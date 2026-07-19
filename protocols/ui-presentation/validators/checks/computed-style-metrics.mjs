// Validator: computed-style-metrics (validator-set 0.1.0, operational layer)
// Covers S-UI-004 (sealed token set on :root, parseable colors), O-UI-001 (WCAG
// contrast floors + >=24px letter size clause), O-UI-002 (dark-family luminance
// band + error hue/saturation band, theme schema-conformance), O-UI-003 (four
// letter-state colors pairwise distinct, max channel delta >= 32), O-UI-004
// (monospace advance equality via canvas measureText + generic fallback),
// B-UI-005 (should: theme applied via :root tokens; unknown/absent theme value
// falls back to the default charter-conformant dark theme).
import { openSessionPage } from "../lib/browser.mjs";
import { scanComputedStyles, settle } from "../lib/dom.mjs";
import { readTargets, setWordsMode, focusWords } from "../lib/driver.mjs";
import { parseColor, luminance, contrast, rgbToHsl, maxChannelDelta } from "../lib/color.mjs";
import { loadBundle } from "../../../../harness/schema-loader.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const TOKENS = ["--bg", "--main", "--caret", "--text", "--sub", "--error", "--error-extra"];
const RED_BAND = (h) => (h >= 0 && h <= 15) || (h >= 340 && h <= 360);

export async function runComputedStyleMetrics(ctx) {
  const { browser, origin, selectors, options } = ctx;
  const results = [];
  const sp = await openSessionPage(browser, origin, { seed: options.seed * 7 + 11, selectors, initScript: options.initScript });
  let css0;
  try {
    // Drive the four letter states into existence: 1 correct, 1 incorrect, extras.
    await setWordsMode(sp.page, selectors);
    await focusWords(sp.page, selectors);
    const { targets } = await readTargets(sp.page, selectors);
    // pick the first word with >= 2 letters so all four states can be driven
    let wi = targets.findIndex((w) => w.length >= 2);
    if (wi < 0) throw new Error("no word with >= 2 letters to drive letter states");
    for (let k = 0; k < wi; k++) { for (const ch of targets[k]) await sp.page.keyboard.press(ch); await sp.page.keyboard.press("Space"); }
    const w = targets[wi];
    await sp.page.keyboard.press(w[0]);                                    // correct
    const wrong = w[1] === "z" ? "a" : String.fromCharCode(w[1].charCodeAt(0) + 1);
    await sp.page.keyboard.press(wrong);                                   // incorrect
    for (let i = 2; i < w.length + 2; i++) await sp.page.keyboard.press(i < w.length ? w[i] : "x"); // rest + 2 extras
    await sp.page.evaluate(settle);
    css0 = await sp.page.evaluate(scanComputedStyles, selectors);
    // monospace advance measurement with the computed font shorthand (canvas)
    css0.advance = await sp.page.evaluate((font) => {
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.font = font;
      return { i: ctx.measureText("i").width, m: ctx.measureText("m").width, font };
    }, css0.letterFont?.shorthand ?? "16px monospace");
  } finally {
    await sp.close();
    ctx.artifactMetas.push(sp.meta);
  }

  const parsed = {};
  for (const t of TOKENS) parsed[t] = css0.tokens[t] ? parseColor(css0.tokens[t]) : null;

  // ---- S-UI-004: sealed tokens on :root, each resolving to a parseable color ----
  {
    const missing = TOKENS.filter((t) => !css0.tokens[t]);
    const unparseable = TOKENS.filter((t) => css0.tokens[t] && !parsed[t]);
    const ok = missing.length === 0 && unparseable.length === 0;
    results.push({ invariant_id: "S-UI-004", layer: "structural", severity: "must",
      outcome: ok ? "pass" : "fail",
      evidence: ok ? `all 7 sealed tokens resolve on :root (${TOKENS.map((t) => `${t}=${css0.tokens[t]}`).join(" ")})`
        : [missing.length && `missing: ${missing.join(",")}`, unparseable.length && `unparseable: ${unparseable.join(",")}`]
            .filter(Boolean).join(" | ") });
  }
  // ---- O-UI-001: contrast floors + large-text clause ----
  {
    const clauses = [];
    const bg = parsed["--bg"];
    if (!bg) clauses.push("fail: --bg not resolvable");
    for (const [t, floor] of [["--text", 4.5], ["--error", 3.0], ["--caret", 3.0]]) {
      if (!parsed[t] || !bg) { clauses.push(`fail: ${t} not resolvable`); continue; }
      const c = contrast(parsed[t], bg);
      clauses.push(`${c >= floor ? "pass" : "fail"}: contrast(${t},--bg)=${c.toFixed(2)} (floor ${floor})`);
    }
    const fs = css0.letterFont?.fontSize ?? 0;
    clauses.push(`${fs >= 24 ? "pass" : "fail"}: letter font-size ${fs}px (WCAG large-text clause >=24px)`);
    results.push({ invariant_id: "O-UI-001", layer: "operational", severity: "must",
      outcome: clauses.every((c) => c.startsWith("pass")) ? "pass" : "fail",
      evidence: clauses.join(" | ") });
  }
  // ---- O-UI-002: dark family + error hue/sat band + theme schema conformance ----
  {
    const clauses = [];
    const bg = parsed["--bg"], text = parsed["--text"];
    if (bg) {
      const L = luminance(bg);
      clauses.push(`${L <= 0.2 ? "pass" : "fail"}: L(--bg)=${L.toFixed(4)} (<=0.2)`);
    } else clauses.push("fail: --bg not resolvable");
    if (bg && text) clauses.push(`${luminance(text) > luminance(bg) ? "pass" : "fail"}: L(--text) > L(--bg)`);
    for (const t of ["--error", "--error-extra"]) {
      if (!parsed[t]) { clauses.push(`fail: ${t} not resolvable`); continue; }
      const { h, s } = rgbToHsl(parsed[t]);
      clauses.push(`${RED_BAND(h) && s >= 0.45 ? "pass" : "fail"}: ${t} h=${h.toFixed(1)} s=${s.toFixed(3)} (h in [0,15]U[340,360], s>=0.45)`);
    }
    // theme schema conformance of the authored (raw) token set
    try {
      const ui = loadBundle(join(root, "protocols", "ui-presentation"));
      const theme = { name: "active", tokens: css0.rawTokens };
      const v = ui.validate("theme.schema.json", theme);
      clauses.push(`${v.ok ? "pass" : "fail"}: authored :root token set vs theme.schema.json${v.ok ? "" : " " + JSON.stringify(v.errors).slice(0, 140)}`);
    } catch (e) { clauses.push(`fail: theme schema validation error ${e.message}`); }
    results.push({ invariant_id: "O-UI-002", layer: "operational", severity: "must",
      outcome: clauses.every((c) => c.startsWith("pass")) ? "pass" : "fail",
      evidence: clauses.join(" | ") });
  }
  // ---- O-UI-003: four letter-state colors pairwise distinct (>=32 channel delta) ----
  {
    const FLOOR = 32; // validation-plan tolerances.letter_state_min_channel_delta
    const states = {};
    const missing = [];
    for (const s of ["untyped", "correct", "incorrect", "extra"]) {
      const found = css0.states[s];
      if (!found || !parseColor(found.color)) { missing.push(s); continue; }
      states[s] = parseColor(found.color);
    }
    const pairs = [];
    const names = Object.keys(states);
    let ok = missing.length === 0;
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const d = maxChannelDelta(states[names[i]], states[names[j]]);
      pairs.push(`${names[i]}~${names[j]}=${d}`);
      if (d < FLOOR) { ok = false; pairs[pairs.length - 1] += "<32!"; }
    }
    results.push({ invariant_id: "O-UI-003", layer: "operational", severity: "must",
      outcome: ok ? "pass" : "fail",
      evidence: missing.length ? `states not measurable: ${missing.join(",")}`
        : `pairwise max-channel deltas on same computed background: ${pairs.join(" ")} (floor 32)` });
  }
  // ---- O-UI-004: monospace advance equality + generic fallback ----
  {
    const clauses = [];
    const adv = css0.advance;
    if (!adv || adv.i === 0) clauses.push("fail: canvas measureText unavailable/zero");
    else clauses.push(`${Math.abs(adv.i - adv.m) <= 1 ? "pass" : "fail"}: adv('i')=${adv.i.toFixed(2)} adv('m')=${adv.m.toFixed(2)} (|d|<=1px)`);
    const fam = css0.letterFont?.fontFamily ?? "";
    const hasGeneric = /(?:^|,)\s*(ui-monospace|monospace)\s*(?:,|$)/i.test(fam);
    clauses.push(`${hasGeneric ? "pass" : "fail"}: letter font-family resolves through monospace generic (${fam.slice(0, 90)})`);
    results.push({ invariant_id: "O-UI-004", layer: "operational", severity: "must",
      outcome: clauses.every((c) => c.startsWith("pass")) ? "pass" : "fail",
      evidence: clauses.join(" | ") });
  }
  // ---- B-UI-005 (should): theme via :root tokens; unknown theme falls back ----
  {
    // second page with an unknown theme value pinned into /api/config
    const sp2 = await openSessionPage(browser, origin, { seed: options.seed * 7 + 11, selectors,
                                                         initScript: options.initScript,
                                                         pinnedConfig: { theme: "definitely-not-a-theme" } });
    try {
      const css2 = await sp2.page.evaluate(scanComputedStyles, selectors);
      const tokensKnown = TOKENS.every((t) => !!css0.tokens[t]);
      const sameUnderUnknown = TOKENS.every((t) => css0.tokens[t] === css2.tokens[t]);
      const bandsHold = parsed["--bg"] && luminance(parsed["--bg"]) <= 0.2 &&
                        parsed["--text"] && luminance(parsed["--text"]) > luminance(parsed["--bg"]);
      const ok = tokensKnown && sameUnderUnknown && !!bandsHold;
      results.push({ invariant_id: "B-UI-005", layer: "behavioral", severity: "should",
        outcome: ok ? "pass" : "fail",
        evidence: ok ? "tokens applied on :root; unknown theme value falls back to charter-conformant default"
          : [`tokens on :root: ${tokensKnown}`, `identical under unknown theme: ${sameUnderUnknown}`,
             `default bands hold: ${!!bandsHold}`].join(" | ") });
    } finally {
      await sp2.close();
      ctx.artifactMetas.push(sp2.meta);
    }
  }
  return results;
}
