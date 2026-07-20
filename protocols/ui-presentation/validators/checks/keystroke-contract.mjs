// Validator: keystroke-contract (validator-set 0.2.0, structural layer)
// Covers S-UI-005 (should): every keystroke dispatched from the UI to the
// engine conforms to ../typing-test-engine/schemas/keystroke-event.schema.json.
// The served engine module was rewritten at request time (lib/browser.mjs) to
// capture feed() arguments into window.__feedLog.
// Covers B-UI-009 (v2.0.0 must): quickRestart dispatches an engine restart
// keystroke-event per the cfg enum (tab|esc|enter), produces no character
// input, does not alter configuration; "off" installs no such binding.
import { openSessionPage, ensureConfigToken } from "../lib/browser.mjs";
import { scan, readTargets, setWordsMode, focusWords } from "../lib/driver.mjs";
import { loadBundle } from "../../../../harness/schema-loader.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const settle = () => new Promise((r) => setTimeout(() => requestAnimationFrame(() => r()), 0));

export async function evaluateKeystrokeContract(ctx) {
  const { scenarios } = ctx;
  const { feedLog, meta } = scenarios.scripted;
  const eng = loadBundle(join(root, "protocols", "typing-test-engine"));
  const results = [];
  if (!meta.engineRewriteSeen) {
    results.push({ invariant_id: "S-UI-005", layer: "structural", severity: "should", outcome: "fail",
      evidence: "engine module not observed/rewritten (engineModuleRe did not match any served script)" });
  } else {
    const bad = [];
    for (let i = 0; i < feedLog.length; i++) {
      const v = eng.validate("keystroke-event.schema.json", feedLog[i]);
      if (!v.ok) bad.push(`event ${i}: ${JSON.stringify(feedLog[i]).slice(0, 80)} — ${JSON.stringify(v.errors).slice(0, 120)}`);
    }
    results.push({ invariant_id: "S-UI-005", layer: "structural", severity: "should",
      outcome: bad.length === 0 ? "pass" : "fail",
      evidence: bad.length ? bad.slice(0, 4).join(" | ")
        : `${feedLog.length} feed() events captured via served-module rewrite, all schema-conformant` });
  }
  results.push(await evaluateQuickRestart(ctx, eng));
  return results;
}

// B-UI-009: quick-restart dispatch per the user-config quickRestart enum
async function evaluateQuickRestart(ctx, eng) {
  const { selectors, browser, origin, options } = ctx;
  const clauses = [];
  for (const variant of ["tab", "esc", "enter", "off"]) {
    const key = { tab: "Tab", esc: "Escape", enter: "Enter" }[variant] ?? "Tab";
    const token = await ensureConfigToken(ctx);
    const sp = await openSessionPage(browser, origin, {
      seed: options.seed * 53 + variant.length, selectors, initScript: options.initScript,
      pinnedConfig: { quickRestart: variant }, sessionToken: token });
    try {
      await setWordsMode(sp.page, selectors);
      await focusWords(sp.page, selectors);
      const { targets } = await readTargets(sp.page, selectors);
      // guaranteed >=3 letter states regardless of first-word length:
      // type word 0 fully, commit, then 2 chars of word 1
      for (const ch of targets[0]) await sp.page.keyboard.press(ch);
      await sp.page.keyboard.press("Space");
      for (const ch of targets[1].slice(0, 2)) await sp.page.keyboard.press(ch);
      const typedStates = targets[0].length + 2;
      await sp.page.evaluate(settle);
      const n0 = (await sp.page.evaluate(() => window.__feedLog)).length;
      await sp.page.keyboard.press(key);
      await sp.page.evaluate(settle);
      const feed = await sp.page.evaluate(() => window.__feedLog);
      const fresh = feed.slice(n0);
      const s = await scan(sp.page, selectors);
      const stateClasses = s.words.flatMap((w) => w.letters.flatMap((l) => l.states));
      if (variant === "off") {
        const ok = !fresh.some((e) => e?.type === "restart") && !fresh.some((e) => e?.type === "char") &&
                   stateClasses.length === typedStates; // the typed input survives; nothing dispatched
        clauses.push(`${ok ? "pass" : "fail"}: quickRestart=off — Tab dispatches nothing (restart=${fresh.filter((e) => e?.type === "restart").length}, char=${fresh.filter((e) => e?.type === "char").length}, input intact=${stateClasses.length === typedStates})`);
      } else {
        const restarts = fresh.filter((e) => e?.type === "restart");
        const schemaOk = restarts.length === 1 && eng.validate("keystroke-event.schema.json", restarts[0]).ok;
        const noChar = !fresh.some((e) => e?.type === "char");
        const reset = stateClasses.length === 0; // stream re-rendered, all letters untyped
        clauses.push(`${restarts.length === 1 && schemaOk && noChar && reset ? "pass" : "fail"}: quickRestart=${variant} — ${key} dispatched restart event (schema-conformant=${schemaOk}), no char input=${noChar}, session reset=${reset}`);
      }
    } finally {
      await sp.close();
      ctx.artifactMetas.push(sp.meta);
    }
  }
  return { invariant_id: "B-UI-009", layer: "behavioral", severity: "must",
    outcome: clauses.every((c) => c.startsWith("pass")) ? "pass" : "fail",
    evidence: clauses.join(" | ") };
}
