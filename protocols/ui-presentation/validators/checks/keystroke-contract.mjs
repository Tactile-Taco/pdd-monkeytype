// Validator: keystroke-contract (validator-set 0.1.0, structural layer)
// Covers S-UI-005 (should): every keystroke dispatched from the UI to the
// engine conforms to ../typing-test-engine/schemas/keystroke-event.schema.json.
// The served engine module was rewritten at request time (lib/browser.mjs) to
// capture feed() arguments into window.__feedLog.
import { loadBundle } from "../../../../harness/schema-loader.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

export function evaluateKeystrokeContract(ctx) {
  const { scenarios } = ctx;
  const { feedLog, meta } = scenarios.scripted;
  if (!meta.engineRewriteSeen) {
    return [{ invariant_id: "S-UI-005", layer: "structural", severity: "should", outcome: "fail",
      evidence: "engine module not observed/rewritten (engineModuleRe did not match any served script)" }];
  }
  const eng = loadBundle(join(root, "protocols", "typing-test-engine"));
  const bad = [];
  for (let i = 0; i < feedLog.length; i++) {
    const v = eng.validate("keystroke-event.schema.json", feedLog[i]);
    if (!v.ok) bad.push(`event ${i}: ${JSON.stringify(feedLog[i]).slice(0, 80)} — ${JSON.stringify(v.errors).slice(0, 120)}`);
  }
  return [{ invariant_id: "S-UI-005", layer: "structural", severity: "should",
    outcome: bad.length === 0 ? "pass" : "fail",
    evidence: bad.length ? bad.slice(0, 4).join(" | ")
      : `${feedLog.length} feed() events captured via served-module rewrite, all schema-conformant` }];
}
