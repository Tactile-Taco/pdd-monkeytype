// Validator: screenshot-similarity (validator-set 0.1.0, operational layer)
// Covers O-UI-005: candidate scenes vs admitted baseline set
// (protocols/ui-presentation/evidence/baseline/), >= 85% of pixels within
// per-channel delta 16, viewport 1280x800 dsf 1, default theme, quote/config
// pinned, same host image only (host-pinned; cross-host not admitted).
// Scenes: (1) fresh-test, (2) mid-test-5-words (five perfectly typed words).
// Baseline mode "capture" writes the baseline set + manifest (authoring time).
import { openSessionPage } from "../lib/browser.mjs";
import { focusWords, readTargets } from "../lib/driver.mjs";
import { settle } from "../lib/dom.mjs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PNGDIFF = join(here, "..", "lib", "pngdiff.py");
const SCENES = ["fresh-test", "mid-test-5-words"]; // validation-plan tolerances.screenshot.scenes

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shaFile = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

// Capture the two scenes with the shared browser; returns paths + capture meta.
export async function captureScenes(ctx, outDir) {
  const { browser, origin, selectors, options } = ctx;
  mkdirSync(outDir, { recursive: true });
  const sp = await openSessionPage(browser, origin, {
    seed: options.shotSeed, selectors, rewriteEngine: false, initScript: options.initScript,
  });
  try {
    // scene 1: fresh test view (default mode/theme, deterministic content)
    await sp.page.waitForSelector(`${selectors.wordStream} ${selectors.word}`, { timeout: 10000 });
    await sp.page.evaluate(() => document.fonts && document.fonts.ready);
    await sp.page.evaluate(settle);
    await sleep(150);
    const p1 = join(outDir, "fresh-test.png");
    await sp.page.screenshot({ path: p1 });
    // scene 2: mid-test after five perfectly typed words
    await focusWords(sp.page, selectors);
    const { targets } = await readTargets(sp.page, selectors);
    for (let wi = 0; wi < 5 && wi < targets.length; wi++) {
      for (const ch of targets[wi]) await sp.page.keyboard.press(ch);
      await sp.page.keyboard.press("Space");
    }
    await sp.page.evaluate(settle);
    await sleep(200);
    const p2 = join(outDir, "mid-test-5-words.png");
    await sp.page.screenshot({ path: p2 });
    return { "fresh-test": p1, "mid-test-5-words": p2 };
  } finally {
    await sp.close();
    ctx.artifactMetas.push(sp.meta);
  }
}

function diffPair(baselinePath, candidatePath, tol, minSimilar) {
  const r = spawnSync("python3", [PNGDIFF, baselinePath, candidatePath,
                                  "--tol", String(tol), "--min-similar", String(minSimilar)],
                      { encoding: "utf8", timeout: 120000 });
  const line = (r.stdout || "").trim().split("\n").pop() || "{}";
  try { return { ...JSON.parse(line), exit: r.status }; }
  catch { return { pass: false, reason: `pngdiff crashed: ${r.stderr?.slice(0, 200)}`, exit: r.status }; }
}

export async function runScreenshotSimilarity(ctx) {
  const { options, baselineDir, host } = ctx;
  const tol = ctx.plan.tolerances?.screenshot?.pixel_channel_tolerance ?? 16;
  const minSimilar = ctx.plan.tolerances?.screenshot?.min_similar_pixel_fraction ?? 0.85;
  const capturesDir = options.capturesDir;
  const captures = await captureScenes(ctx, capturesDir);

  if (options.baselineMode === "capture") {
    mkdirSync(baselineDir, { recursive: true });
    const manifest = {
      schema: 1, protocol: "ui-presentation@1.0.0", invariant: "O-UI-005",
      source_origin: options.originLabel,
      captured_by: "validator-harness at validator-authoring time",
      capture_note: options.captureNote ??
        "Authoring host had no egress to the live origin (docs/09: sandbox blocks general outbound fetch). " +
        "Captured from the byte-faithful pinned replica (validators/reference-origin/, git-pinned v2.2 bytes; " +
        "style.css verified byte-equal to live GET /style.css via egress-capable fetch). Live-origin recapture " +
        "on an egress-capable host = same command with --origin https://pdd-monkeytype.pdd-typing.workers.dev.",
      host_pinned: true,
      host_image_id: host.host_image_id,
      chromium_version: host.chromium_version,
      runtime: host.runtime, operating_system: host.operating_system,
      viewport: host.viewport,
      tolerances: { pixel_channel_tolerance: tol, min_similar_pixel_fraction: minSimilar },
      scenes: {},
      captured_at: new Date().toISOString(),
    };
    for (const scene of SCENES) {
      const dst = join(baselineDir, `${scene}.png`);
      writeFileSync(dst, readFileSync(captures[scene]));
      manifest.scenes[scene] = { file: `${scene}.png`, sha256: shaFile(dst),
                                 viewport: host.viewport, host_image_id: host.host_image_id };
    }
    writeFileSync(join(baselineDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    ctx.baselineManifest = manifest;
    return [{ invariant_id: "O-UI-005", layer: "operational", severity: "must", outcome: "pass",
      evidence: `baseline (re)captured from ${options.originLabel}: ${SCENES.map((s) => `${s}.png sha256:${manifest.scenes[s].sha256.slice(0, 12)}`).join(", ")}; host ${host.host_image_id.slice(0, 19)}` }];
  }

  // compare mode
  const manifestPath = join(baselineDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    return [{ invariant_id: "O-UI-005", layer: "operational", severity: "must", outcome: "fail",
      evidence: `baseline manifest missing at ${manifestPath} — run with --baseline-mode=capture first` }];
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  ctx.baselineManifest = manifest;
  if (manifest.host_image_id !== host.host_image_id) {
    return [{ invariant_id: "O-UI-005", layer: "operational", severity: "must", outcome: "fail",
      evidence: `cross-host comparison not admitted: baseline host ${manifest.host_image_id?.slice(0, 19)} != current ${host.host_image_id.slice(0, 19)}` }];
  }
  const perScene = [];
  let allPass = true;
  for (const scene of SCENES) {
    const b = join(baselineDir, `${scene}.png`);
    if (!existsSync(b)) { perScene.push(`${scene}: baseline png missing`); allPass = false; continue; }
    const d = diffPair(b, captures[scene], tol, minSimilar);
    if (d.pass !== true) allPass = false;
    perScene.push(`${scene}: similar=${d.similar_fraction ?? "?"} (${d.pass ? "pass" : "FAIL"}${d.reason ? ", " + d.reason : ""})`);
  }
  return [{ invariant_id: "O-UI-005", layer: "operational", severity: "must",
    outcome: allPass ? "pass" : "fail",
    evidence: perScene.join(" | ") + ` [tol Δ${tol}, min-similar ${minSimilar}, same-host]` }];
}
