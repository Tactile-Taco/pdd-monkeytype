// Evidence Keeper: binds validation results into signed admission evidence
// E = H(P, I, V, R, t) per protocol, writes Discovery Logs, and seeds/extends
// the Dynamic Evidence Ledger with genesis blocks.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hashTree, buildEvidence, appendBlock, writeJson } from "./evidence.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const layers = ["structural", "behavioral", "operational"];
const layerResults = {};
for (const l of layers) {
  const p = join(root, "harness", "out", `${l}.json`);
  if (!existsSync(p)) { console.error(`missing ${l}.json — run validators first`); process.exit(1); }
  layerResults[l] = JSON.parse(readFileSync(p, "utf8"));
}
// Optional ui-presentation browser suite (protocols/ui-presentation/validators/run.mjs).
// Its results carry per-invariant layer tags + severity; should-severity gaps are
// reported but do not block admission (validation-plan admission_rule: must only).
const uiPath = join(root, "harness", "out", "ui-presentation.json");
const ui = existsSync(uiPath) ? JSON.parse(readFileSync(uiPath, "utf8")) : null;
if (ui) layerResults["ui-presentation"] = { validator: ui.suite ?? { id: "ui-presentation-validator-suite" },
                                            verdict: ui.verdict, results: ui.validation_results ?? ui.results ?? [] };
const allLayers = ui ? [...layers, "ui-presentation"] : layers;
const implDigest = hashTree(join(root, "implementation", "src"));
const evidenceRoot = join(root, "evidence");
const admission = [];

for (const proto of readdirSync(join(root, "protocols"))) {
  const pdir = join(root, "protocols", proto);
  if (!statSync(pdir).isDirectory()) continue;
  const bundleDigest = hashTree(pdir);
  const myResults = allLayers.flatMap((l) =>
    layerResults[l].results.filter((r) => appliesTo(r.invariant_id, proto)));
  if (myResults.length === 0) continue;
  const admitted = layers.every((l) => layerResults[l].verdict === "admit") &&
                   (!ui || proto !== "ui-presentation" || ui.verdict === "admit") &&
                   myResults.every((r) => r.outcome === "pass" ||
                     (r.severity === "should" && r.outcome !== "mutation-suspect"));
  const protoYaml = readFileSync(join(pdir, "protocol.yaml"), "utf8");
  const protoVersion = (protoYaml.match(/^  version: (.+)$/m) ?? [, "unknown"])[1].trim();
  const ev = buildEvidence({
    protocol: { name: proto, version: protoVersion, bundle_digest: bundleDigest },
    implDigest,
    validators: (proto === "ui-presentation" && ui ? allLayers : layers).map((l) => layerResults[l].validator),
    results: myResults,
    meta: { layers_run: proto === "ui-presentation" && ui ? allLayers : layers },
  });
  ev.decision = admitted ? "admit" : "reject";
  writeJson(join(evidenceRoot, proto, "admission", `${implDigest.slice(7, 19)}.evidence.json`), ev);
  writeJson(join(evidenceRoot, proto, "discovery", `${implDigest.slice(7, 19)}.discovery.json`), {
    protocol: proto, artifact_digest: implDigest, node: process.version, platform: process.platform,
    validators: layers.map((l) => layerResults[l].validator),
    coverage: { structural: count(layerResults.structural, proto), behavioral: count(layerResults.behavioral, proto),
                operational: count(layerResults.operational, proto),
                ...(ui ? { "ui-presentation": count(layerResults["ui-presentation"], proto) } : {}) },
    observed: { decision: ev.decision },
    derived_behaviors: [],
  });
  // genesis/re-admission block on the per-protocol runtime ledger (only on admit)
  const ledger = join(evidenceRoot, proto, "runtime-ledger.jsonl");
  if (admitted) {
    appendBlock(ledger, { name: proto, version: protoVersion, bundle_digest: bundleDigest },
                implDigest, { admission: true, evidence_digest: ev.digest }, "attest-pass");
  }
  admission.push({ protocol: proto, decision: ev.decision, checks: myResults.length, digest: ev.digest });
}

function appliesTo(invariantId, proto) {
  const PFX = { "user-account": ["ACC"], "user-config": ["CFG"], "quote-library": ["QT"],
                "test-results": ["RES"], "leaderboards": ["LB"],
                "result-stats": ["STS"], "wordlists": ["WL"],
                "user-profile": ["PRO"], "public-api": ["API"],
                "typing-test-engine": ["ENG"], "result-anticheat": ["AC"],
                "ui-presentation": ["UI"], "theme-catalog": ["THM"] };
  const pfx = PFX[proto] ?? [];
  return pfx.some((p) => invariantId.includes(`-${p}-`)) ||
         (proto === "typing-test-engine" && invariantId.startsWith("O-ENG")) ||
         (invariantId.startsWith("O-DEP") && proto === "test-results");
}
function count(layer, proto) { return layer.results.filter((r) => appliesTo(r.invariant_id, proto)).length; }

const rejected = admission.filter((a) => a.decision !== "admit");
writeJson(join(evidenceRoot, "admission-summary.json"), { implDigest, admission });
console.log(JSON.stringify({ implDigest, admission }, null, 2));
process.exit(rejected.length ? 1 : 0);
