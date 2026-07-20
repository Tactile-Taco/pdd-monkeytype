#!/usr/bin/env node
// ui-presentation v1.0.0 — validator suite runner (stage 3a).
// Substrate: puppeteer-core + headless Chromium (validation-plan.yaml).
// One browser session amortized across checks; accepts any target origin.
//
// Usage:
//   node protocols/ui-presentation/validators/run.mjs --origin http://localhost:8787
//   node .../run.mjs --boot-candidate              # boot implementation/ in-process (harness bootApp convention)
//   node .../run.mjs --replica                     # boot the pinned v2.2 reference origin
//   node .../run.mjs --origin https://pdd-monkeytype.pdd-typing.workers.dev
// Flags:
//   --origin URL                 target origin (required unless --replica)
//   --replica                    serve validators/reference-origin (v2.2 replica)
//   --runs N                     fuzz property runs (default: plan property_runs_default=50)
//   --seed N                     base seed (default 42; deterministic runs)
//   --engine-semantics v1.1|v1.0 oracle backspace semantics (default v1.1 = sealed engine;
//                                v1.0 only for the pre-CA-001 v2.2 origin/replica)
//   --baseline-mode compare|capture|skip   (default compare)
//   --set key=value              selector override (e.g. --set caret=#caret)
//   --out PATH                   results JSON (default harness/out/ui-presentation.json)
//   --captures-dir PATH          candidate scene captures (default harness/out/ui-captures)
//   --smoke                      tag output as a smoke/research run (no ledger write unless --ledger)
//   --ledger                     append a block to protocols/ui-presentation/evidence/runtime-ledger.jsonl
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { parseYamlSubset } from "./lib/tinyyaml.mjs";
import { launchBrowser, artifactHash } from "./lib/browser.mjs";
import { hostMetadata } from "./lib/hostmeta.mjs";
import { DEFAULT_SELECTORS } from "./lib/selectors.mjs";
import { selfTestOracle } from "./lib/oracle.mjs";
import { scenarioScripted, scenarioFuzz } from "./lib/scenarios.mjs";
import { evaluateDomStructure } from "./checks/dom-structure.mjs";
import { evaluateKeystrokeContract } from "./checks/keystroke-contract.mjs";
import { evaluateCaretTracking } from "./checks/caret-tracking.mjs";
import { evaluateDomStateFidelity } from "./checks/dom-state-fidelity.mjs";
import { evaluateMutationConfinement } from "./checks/dom-mutation-confinement.mjs";
import { runResultsFidelity } from "./checks/results-fidelity.mjs";
import { runComputedStyleMetrics } from "./checks/computed-style-metrics.mjs";
import { runScreenshotSimilarity } from "./checks/screenshot-similarity.mjs";
import { evaluateRequestAudit } from "./checks/request-audit.mjs";
import { serveReferenceOrigin } from "./reference-origin/serve.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const bundleDir = join(here, "..");

// ---------- args ----------
const args = process.argv.slice(2);
const opt = { runs: null, seed: 42, engineSemantics: "v1.1", baselineMode: "compare",
              out: null,
              capturesDir: join(root, "harness", "out", "ui-captures"),
              shotSeed: 20260719, smoke: false, ledger: false, originLabel: null };
const selectors = { ...DEFAULT_SELECTORS };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const next = () => args[++i];
  if (a === "--origin") opt.origin = next();
  else if (a === "--replica") opt.replica = true;
  else if (a === "--boot-candidate") opt.bootCandidate = true;
  else if (a === "--runs") opt.runs = Number(next());
  else if (a === "--seed") opt.seed = Number(next());
  else if (a === "--engine-semantics") opt.engineSemantics = next();
  else if (a === "--baseline-mode") opt.baselineMode = next();
  else if (a === "--out") opt.out = next();
  else if (a === "--captures-dir") opt.capturesDir = next();
  else if (a === "--smoke") opt.smoke = true;
  else if (a === "--ledger") opt.ledger = true;
  else if (a === "--set") { const [k, v] = next().split("="); selectors[k] = v.includes("|") ? v.split("|") : v; }
  else if (a === "--shot-seed") opt.shotSeed = Number(next());
  else if (a === "--init-script") opt.initScript = readFileSync(next(), "utf8"); // candidate fixture/shim (testing aid)
  else if (a === "--origin-label") opt.originLabel = next();
  else if (a === "--capture-note") opt.captureNote = next();
  else { console.error("unknown flag:", a); process.exit(2); }
}
if (!opt.origin && !opt.replica && !opt.bootCandidate) { console.error("need --origin URL, --boot-candidate, or --replica"); process.exit(2); }
// Smoke/research runs write a distinct file so build-evidence only ever binds
// CANDIDATE results to the candidate artifact digest.
if (opt.out == null) opt.out = join(root, "harness", "out",
  opt.smoke ? "ui-presentation.smoke.json" : "ui-presentation.json");

// ---------- sealed plan + validator identities ----------
const plan = parseYamlSubset(readFileSync(join(here, "validation-plan.yaml"), "utf8")).validation_plan;
const validatorSet = parseYamlSubset(readFileSync(join(here, "validator-set.yaml"), "utf8")).validators;
if (opt.runs == null) opt.runs = Number(process.env.UI_PBT_RUNS ?? plan.property_runs_default ?? 50);

const shaFile = (p) => "sha256:" + createHash("sha256").update(readFileSync(p)).digest("hex");
const SUITE_VERSION = "0.2.0";
// sealed protocol version reported in evidence metadata (read, never hardcoded)
const PROTO_VERSION = (readFileSync(join(bundleDir, "protocol.yaml"), "utf8").match(/^  version: (.+)$/m) ?? [null, "unknown"])[1].trim();
const t0 = Date.now();
const results = [];
const push = (rs) => results.push(...rs);

let replica = null, boot = null;
const browser = await launchBrowser();
const ctx = {
  browser, origin: null, selectors, options: opt, plan,
  baselineDir: join(bundleDir, "evidence", "baseline"),
  artifactMetas: [], scenarios: {}, baselineManifest: null, host: null,
};

try {
  if (opt.bootCandidate) {
    const { bootApp } = await import("../../../harness/boot.mjs");
    boot = await bootApp(); // ephemeral port + temp data dir (harness convention)
    opt.origin = boot.base;
    opt.originLabel = opt.originLabel ?? `candidate implementation (bootApp, ${boot.base})`;
  }
  if (opt.replica) {
    replica = await serveReferenceOrigin({ port: 0 });
    opt.origin = replica.url;
    if (opt.engineSemantics === "v1.1") {
      console.error("note: replica serves engine v1.0 (pre-CA-001); consider --engine-semantics=v1.0");
    }
  }
  ctx.origin = opt.origin;
  opt.originLabel = opt.originLabel ?? (opt.replica
    ? "https://pdd-monkeytype.pdd-typing.workers.dev (via pinned local replica)"
    : opt.origin);

  // preflight: fail fast with a clear message when the origin is unreachable
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10000);
    await fetch(opt.origin + "/", { signal: ac.signal }).then((r) => r.arrayBuffer());
    clearTimeout(t);
  } catch (e) {
    console.error(`preflight failed: cannot reach ${opt.origin} (${e.name === "AbortError" ? "timeout" : e.message}).`);
    console.error("On egress-restricted hosts use --replica (pinned v2.2 reference origin).");
    process.exit(2);
  }

  // host metadata (O-UI-005 host pinning; evidence replay requirements)
  const metaPage = await browser.newPage();
  ctx.host = await hostMetadata(browser, metaPage);
  await metaPage.close();

  // oracle equivalence self-test (validator hygiene; must pass before page work)
  {
    const st = await selfTestOracle();
    push([{ invariant_id: "S-UI-ORACLE", layer: "structural", severity: "must",
            outcome: st.ok ? "pass" : "fail",
            evidence: st.ok ? `oracle == repo engine over ${st.seeds} seeded streams (v1.1 semantics)`
                            : `oracle diverged from repo engine at seed ${st.seed} step ${st.step}` }]);
    if (!st.ok) throw new Error("oracle self-test failed; aborting before page work");
  }

  // bundle-lint (validator-set: bundle-lint 1.0.0)
  {
    const r = spawnSync("python3", [join(root, "harness", "check_bundle.py"), bundleDir], { encoding: "utf8" });
    const ok = r.status === 0;
    push([{ invariant_id: "S-UI-LINT", layer: "structural", severity: "must",
            outcome: ok ? "pass" : "fail",
            evidence: (r.stdout + r.stderr).trim().split("\n").slice(0, 3).join(" | ") }]);
  }

  // ---------- scenarios (page work, one browser amortized) ----------
  ctx.scenarios.scripted = await scenarioScripted(ctx);
  ctx.artifactMetas.push(ctx.scenarios.scripted.meta);
  ctx.scenarios.fuzz = await scenarioFuzz(ctx);
  ctx.artifactMetas.push(ctx.scenarios.fuzz.meta);

  // ---------- structural/behavioral evaluators over traces ----------
  push(evaluateDomStructure(ctx));
  push(await evaluateCaretTracking(ctx));
  push(evaluateDomStateFidelity(ctx));
  push(evaluateMutationConfinement(ctx));
  push(await evaluateKeystrokeContract(ctx));

  // ---------- scenario-owning validators ----------
  push(await runResultsFidelity(ctx));
  push(await runComputedStyleMetrics(ctx));
  if (opt.baselineMode !== "skip") push(await runScreenshotSimilarity(ctx));
  else push([{ invariant_id: "O-UI-005", layer: "operational", severity: "must", outcome: "skip",
               evidence: "baseline-mode=skip" }]);
  push(evaluateRequestAudit(ctx));
} finally {
  if (ctx.scenarios.scripted?.page) await ctx.scenarios.scripted.page.close().catch(() => {});
  if (ctx.scenarios.fuzz?.page) await ctx.scenarios.fuzz.page.close().catch(() => {});
  await browser.close().catch(() => {});
  if (replica) await replica.close().catch(() => {});
  if (boot) boot.close();
}

// ---------- verdict (plan admission_rule: all must pass; screenshot within band; zero mutation-suspect) ----------
const mustFails = results.filter((r) => r.severity === "must" && r.outcome !== "pass");
const suspects = results.filter((r) => r.outcome === "mutation-suspect");
const shouldFails = results.filter((r) => r.severity === "should" && r.outcome === "fail");
const verdict = mustFails.length === 0 && suspects.length === 0 ? "admit" : "reject";
const verdict_reason = verdict === "admit"
  ? `all must invariants pass (${results.length} checks; ${shouldFails.length} should-level gaps)`
  : `${mustFails.length} must failures (${[...new Set(mustFails.map((f) => f.invariant_id))].join(", ")})` +
    (suspects.length ? ` + ${suspects.length} mutation-suspect` : "");

const out = {
  layer: "ui-presentation",
  suite: { id: "ui-presentation-validator-suite", version: SUITE_VERSION },
  protocol_version: PROTO_VERSION,
  target_origin: opt.originLabel,
  smoke: opt.smoke,
  validation_results: results,
  results, // harness-convention alias (build-evidence reads .results)
  validator_versions: [...validatorSet.map((v) => ({ id: v.id, version: String(v.version), layer: v.layer })),
                       { id: "ui-presentation-validator-suite", version: SUITE_VERSION }],
  implementation_artifact_hash: artifactHash(ctx.artifactMetas),
  dependency_manifest: {
    package_json: shaFile(join(root, "package.json")),
    dependency_lockfile: existsSync(join(root, "package-lock.json")) ? shaFile(join(root, "package-lock.json")) : null,
    runtime_allowlist: "capabilities.dependencies.allow = [] (zero runtime deps)",
    validator_deps: ["puppeteer-core", "Pillow+numpy (pngdiff.py)"],
  },
  discovery_log: {
    layers_run: ["structural", "behavioral", "operational"],
    checks: results.length,
    by_layer: ["structural", "behavioral", "operational"].map((l) => ({
      layer: l,
      pass: results.filter((r) => r.layer === l && r.outcome === "pass").length,
      fail: results.filter((r) => r.layer === l && r.outcome === "fail").length,
    })),
    observed: { decision: verdict },
  },
  baseline_screenshot_manifest: ctx.baselineManifest,
  environment: { ...ctx.host, viewport: plan.environment?.viewport ?? ctx.host.viewport },
  property_runs: opt.runs, seed: opt.seed, engine_semantics: opt.engineSemantics,
  wall_clock_ms: Date.now() - t0,
  verdict, verdict_reason,
};

mkdirSync(dirname(opt.out), { recursive: true });
writeFileSync(opt.out, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ verdict, verdict_reason, checks: results.length,
  wall_clock_s: +((Date.now() - t0) / 1000).toFixed(1),
  matrix: results.map((r) => `${r.invariant_id}:${r.outcome}`) }, null, 2));

// ---------- runtime ledger (evidence-requirements: attestations signed) ----------
if (opt.ledger && !opt.smoke) {
  const { appendBlock, hashTree } = await import("../../../harness/evidence.mjs");
  const block = appendBlock(join(bundleDir, "evidence", "runtime-ledger.jsonl"),
    { name: "ui-presentation", version: PROTO_VERSION, bundle_digest: hashTree(bundleDir) },
    out.implementation_artifact_hash,
    { target: opt.originLabel, checks: results.length, must_failures: mustFails.map((f) => f.invariant_id),
      wall_clock_ms: out.wall_clock_ms, evidence_digest: "sha256:" + createHash("sha256").update(JSON.stringify(out)).digest("hex") },
    verdict === "admit" ? "attest-pass" : "attest-fail");
  console.log("ledger block:", block.digest.slice(0, 24), "decision:", block.decision);
}

process.exit(verdict === "admit" ? 0 : 1);
