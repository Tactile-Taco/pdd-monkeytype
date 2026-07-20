// Validator: computed-style-metrics (validator-set 0.2.0, operational layer)
// Covers S-UI-004 (sealed token set on :root, parseable colors), O-UI-001 (WCAG
// contrast floors + >=24px letter size clause), O-UI-002 (dark-family luminance
// band + error hue/saturation band, theme schema-conformance), O-UI-003 (four
// letter-state colors pairwise distinct, max channel delta >= 32), O-UI-004
// (v2.0.0 amended: monospace advance equality for the DEFAULT font; configured
// fontFamily path requires O-UI-003 distinguishability + caret legibility only),
// B-UI-005 (v2.0.0 must: theme precedence custom-slots all-nine gate > catalog >
// default; partial/malformed slots fail-closed), B-UI-007 (blind: incorrect/extra
// computed colors identical to correct, classes intact), B-UI-010 (flip role swap
// + WCAG symmetry; colorful high-saturation error variants within the hue band),
// B-UI-011 (should: randomTheme applies a catalog theme atomically at test start).
import { openSessionPage, ensureConfigToken } from "../lib/browser.mjs";
import { scanComputedStyles, settle } from "../lib/dom.mjs";
import { readTargets, setWordsMode, focusWords, scan } from "../lib/driver.mjs";
import { parseColor, luminance, contrast, rgbToHsl, maxChannelDelta } from "../lib/color.mjs";
import { loadBundle } from "../../../../harness/schema-loader.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
// Sealed token set per S-UI-004 (ui-presentation v2.0.0: nine slots).
const TOKENS = ["--bg", "--main", "--caret", "--text", "--sub", "--error", "--error-extra", "--sub-alt", "--colorful-error"];
const RED_BAND = (h) => (h >= 0 && h <= 15) || (h >= 340 && h <= 360);

// user-config v1.2.0 custom slot keys -> charter slots (sealed naming; B-UI-005 (1))
const SLOT_MAP = { customThemeBg: "--bg", customThemeMain: "--main", customThemeCaret: "--caret",
  customThemeSub: "--sub", customThemeSubAlt: "--sub-alt", customThemeText: "--text",
  customThemeError: "--error", customThemeErrorExtra: "--error-extra",
  customThemeColorfulError: "--colorful-error" };
// A fully-valid, distinctive all-nine custom fixture (charter pattern per slot)
const CUSTOM_SLOTS = { customThemeBg: "#0b0e14", customThemeMain: "#7aa2f7", customThemeCaret: "#c0caf5",
  customThemeSub: "#565f89", customThemeSubAlt: "#1f2335", customThemeText: "#c0caf5",
  customThemeError: "#f7768e", customThemeErrorExtra: "#803a49", customThemeColorfulError: "#ff7a93" };

const normTok = (v) => { const c = parseColor(v); return c ? `${c.r},${c.g},${c.b}` : null; };
const sameTokens = (a, b) => TOKENS.every((t) => normTok(a?.[t]) === normTok(b?.[t]));
async function fetchJson(url) {
  const r = await fetch(url);
  if (r.status !== 200) throw new Error(`GET ${url} -> ${r.status}`);
  return r.json();
}
// Open an authenticated config-pinned session page and wait for the async theme
// resolution to land on :root (B-UI-005 resolution is fetch-driven).
async function openConfigPage(ctx, pinnedConfig, { seed } = {}) {
  const { browser, origin, selectors, options } = ctx;
  const token = await ensureConfigToken(ctx);
  const sp = await openSessionPage(browser, origin, {
    seed: seed ?? (options.seed * 7 + 11), selectors, initScript: options.initScript,
    pinnedConfig: pinnedConfig ?? {}, sessionToken: token });
  await sp.page.waitForFunction(
    () => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() !== "",
    { timeout: 8000 });
  await sp.page.evaluate(settle);
  return sp;
}
// Drive the four letter states into existence on the first >=2-letter word:
// 1 correct, 1 incorrect, rest correct + 2 extras. Shared by the state-color checks.
async function driveFourStates(page, targets) {
  const wi = targets.findIndex((w) => w.length >= 2);
  if (wi < 0) throw new Error("no word with >= 2 letters to drive letter states");
  for (let k = 0; k < wi; k++) { for (const ch of targets[k]) await page.keyboard.press(ch); await page.keyboard.press("Space"); }
  const w = targets[wi];
  await page.keyboard.press(w[0]);                                    // correct
  const wrong = w[1] === "z" ? "a" : String.fromCharCode(w[1].charCodeAt(0) + 1);
  await page.keyboard.press(wrong);                                   // incorrect
  for (let i = 2; i < w.length + 2; i++) await page.keyboard.press(i < w.length ? w[i] : "x"); // rest + 2 extras
  await page.evaluate(settle);
  return wi;
}
// class evidence: at least one letter carries `cls` (S-UI-002 vocabulary intact)
async function hasStateClass(page, selectors, cls) {
  const s = await scan(page, selectors);
  return s.words.some((w) => w.letters.some((l) => l.states.includes(cls)));
}
// computed caret element color (first non-transparent of background/color) vs bg
async function caretContrastProbe(page, selectors) {
  return page.evaluate((sel) => {
    const tv = document.querySelector(sel.testView) || document.body;
    const el = sel.caret.map((s) => tv.querySelector(s)).find(Boolean);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const pick = [cs.backgroundColor, cs.borderColor, cs.color]
      .find((c) => c && c !== "transparent" && c !== "rgba(0, 0, 0, 0)");
    return { color: pick ?? null };
  }, selectors);
}

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
    await driveFourStates(sp.page, targets);
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
      evidence: ok ? `all 9 sealed tokens resolve on :root (${TOKENS.map((t) => `${t}=${css0.tokens[t]}`).join(" ")})`
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
  // ---- O-UI-004 (v2.0.0 amended): default font -> advance equality; configured
  // fontFamily -> O-UI-003 distinguishability + caret legibility only ----
  {
    const clauses = [];
    const adv = css0.advance;
    if (!adv || adv.i === 0) clauses.push("fail: canvas measureText unavailable/zero");
    else clauses.push(`${Math.abs(adv.i - adv.m) <= 1 ? "pass" : "fail"}: default font adv('i')=${adv.i.toFixed(2)} adv('m')=${adv.m.toFixed(2)} (|d|<=1px)`);
    const fam = css0.letterFont?.fontFamily ?? "";
    const hasGeneric = /(?:^|,)\s*(ui-monospace|monospace)\s*(?:,|$)/i.test(fam);
    clauses.push(`${hasGeneric ? "pass" : "fail"}: letter font-family resolves through monospace generic (${fam.slice(0, 90)})`);
    // configured-font path (user-config v1.2.0 fontFamily set): advance equality NOT required
    const spF = await openConfigPage(ctx, { fontFamily: "Arial" });
    try {
      await setWordsMode(spF.page, selectors);
      await focusWords(spF.page, selectors);
      const { targets: ft } = await readTargets(spF.page, selectors);
      await driveFourStates(spF.page, ft);
      const cssF = await spF.page.evaluate(scanComputedStyles, selectors);
      const famF = cssF.letterFont?.fontFamily ?? "";
      clauses.push(`${/Arial/i.test(famF) ? "pass" : "fail"}: configured fontFamily applied (${famF.slice(0, 70)})`);
      const st = cssF.states, missF = ["untyped", "correct", "incorrect", "extra"].filter((k) => !st[k]?.color);
      let distOk = missF.length === 0;
      if (distOk) {
        const keys = ["untyped", "correct", "incorrect", "extra"];
        for (let i = 0; i < keys.length && distOk; i++)
          for (let j = i + 1; j < keys.length; j++)
            if (maxChannelDelta(parseColor(st[keys[i]].color), parseColor(st[keys[j]].color)) < 32) distOk = false;
      }
      clauses.push(`${distOk ? "pass" : "fail"}: O-UI-003 distinguishability holds under configured font`);
      const caret = await caretContrastProbe(spF.page, selectors);
      const cc = caret?.color && cssF.effectiveBg ? contrast(parseColor(caret.color), parseColor(cssF.effectiveBg)) : 0;
      clauses.push(`${cc >= 3.0 ? "pass" : "fail"}: caret legibility contrast=${cc.toFixed(2)} (>=3.0) under configured font`);
      const advF = await spF.page.evaluate((font) => {
        const c = document.createElement("canvas").getContext("2d");
        c.font = font;
        return { i: c.measureText("i").width, m: c.measureText("m").width };
      }, cssF.letterFont?.shorthand ?? "16px sans-serif");
      clauses.push(`info: configured-font adv('i')=${advF.i.toFixed(2)} adv('m')=${advF.m.toFixed(2)} (equality not required)`);
    } finally {
      await spF.close();
      ctx.artifactMetas.push(spF.meta);
    }
    results.push({ invariant_id: "O-UI-004", layer: "operational", severity: "must",
      outcome: clauses.every((c) => c.startsWith("pass") || c.startsWith("info")) ? "pass" : "fail",
      evidence: clauses.join(" | ") });
  }
  // ---- B-UI-005 (v2.0.0 must): theme precedence custom-slots all-nine gate >
  // catalog > default; partial/malformed slots fail-closed; structure untouched ----
  {
    const clauses = [];
    const themeSeed = options.seed * 7 + 11;
    const ref = await openConfigPage(ctx, {});                                   // tier 3 (theme:"default" unknown)
    const unknown = await openConfigPage(ctx, { theme: "definitely-not-a-theme" });
    const serika = await openConfigPage(ctx, { theme: "serika_dark" });
    const dracula = await openConfigPage(ctx, { theme: "dracula" });
    const custom = await openConfigPage(ctx, { ...CUSTOM_SLOTS, theme: "dracula" });
    const partialSlots = { ...CUSTOM_SLOTS, theme: "dracula" };
    delete partialSlots.customThemeColorfulError;                                // 8/9 slots = partial
    const partial = await openConfigPage(ctx, partialSlots);
    const malformed = await openConfigPage(ctx, { ...CUSTOM_SLOTS, customThemeBg: "red", theme: "dracula" });
    const pages = { ref, unknown, serika, dracula, custom, partial, malformed };
    const css = {};
    try {
      for (const [k, sp] of Object.entries(pages)) css[k] = await sp.page.evaluate(scanComputedStyles, selectors);
      const catS = await fetchJson(origin + "/api/themes/serika_dark");
      const catD = await fetchJson(origin + "/api/themes/dracula");
      const refScan = await scan(ref.page, selectors);
      const dracScan = await scan(dracula.page, selectors);
      const custScan = await scan(custom.page, selectors);
      const wordText = (s) => s.words.map((w) => w.text).join(" ");
      // tier 3: default resolvable; unknown/absent value falls back to it
      clauses.push(`${TOKENS.every((t) => css.ref.tokens[t]) ? "pass" : "fail"}: default tier resolves all 9 tokens`);
      clauses.push(`${sameTokens(css.ref.tokens, css.unknown.tokens) ? "pass" : "fail"}: unknown theme value -> default tier (identity)`);
      // tier 2: catalog themes named by user-config theme, read from the handshake
      clauses.push(`${sameTokens(css.serika.tokens, catS.tokens) ? "pass" : "fail"}: theme=serika_dark -> catalog tokens`);
      clauses.push(`${sameTokens(css.dracula.tokens, catD.tokens) ? "pass" : "fail"}: theme=dracula -> catalog tokens`);
      clauses.push(`${!sameTokens(catS.tokens, catD.tokens) ? "pass" : "fail"}: catalog tier switch observable (serika != dracula)`);
      clauses.push(`${dracula.meta.requests.some((r) => r.url.includes("/api/themes/dracula")) ? "pass" : "fail"}: catalog theme read via the theme-catalog handshake`);
      // tier 1: all-nine valid custom slots outrank the catalog theme
      const slotTokens = Object.fromEntries(Object.entries(SLOT_MAP).map(([k, t]) => [t, CUSTOM_SLOTS[k]]));
      clauses.push(`${sameTokens(css.custom.tokens, slotTokens) ? "pass" : "fail"}: all-nine custom slots win over theme=dracula`);
      clauses.push(`${!sameTokens(css.custom.tokens, catD.tokens) ? "pass" : "fail"}: custom tier distinguishable from catalog`);
      // fail-closed: partial or malformed slots drop the whole custom tier
      clauses.push(`${sameTokens(css.partial.tokens, catD.tokens) ? "pass" : "fail"}: partial slots (8/9) rejected -> catalog`);
      clauses.push(`${sameTokens(css.malformed.tokens, catD.tokens) ? "pass" : "fail"}: malformed slot value rejected -> catalog`);
      // token values only, never structure
      clauses.push(`${wordText(refScan) === wordText(dracScan) && wordText(refScan) === wordText(custScan) ? "pass" : "fail"}: theme application changes token values only, never word-stream structure`);
    } finally {
      for (const sp of Object.values(pages)) { await sp.close(); ctx.artifactMetas.push(sp.meta); }
    }
    results.push({ invariant_id: "B-UI-005", layer: "behavioral", severity: "must",
      outcome: clauses.every((c) => c.startsWith("pass")) ? "pass" : "fail",
      evidence: clauses.join(" | ") });
  }
  // ---- B-UI-007 (v2.0.0 must): blindMode — incorrect/extra computed colors
  // identical to correct; state classes intact; untyped unaffected ----
  {
    const clauses = [];
    const spB = await openConfigPage(ctx, { blindMode: true });
    try {
      await setWordsMode(spB.page, selectors);
      await focusWords(spB.page, selectors);
      const { targets: bt } = await readTargets(spB.page, selectors);
      await driveFourStates(spB.page, bt);
      const cssB = await spB.page.evaluate(scanComputedStyles, selectors);
      const st = cssB.states;
      clauses.push(`${normTok(st.incorrect?.color) === normTok(st.correct?.color) ? "pass" : "fail"}: color(incorrect) == color(correct) (${st.incorrect?.color} vs ${st.correct?.color})`);
      clauses.push(`${normTok(st.extra?.color) === normTok(st.correct?.color) ? "pass" : "fail"}: color(extra) == color(correct) (${st.extra?.color})`);
      clauses.push(`${await hasStateClass(spB.page, selectors, "incorrect") && await hasStateClass(spB.page, selectors, "extra") ? "pass" : "fail"}: S-UI-002 state classes carry true engine state under blind`);
      clauses.push(`${normTok(st.untyped?.color) === normTok(css0.states.untyped?.color) ? "pass" : "fail"}: untyped unaffected (${st.untyped?.color})`);
    } finally {
      await spB.close();
      ctx.artifactMetas.push(spB.meta);
    }
    results.push({ invariant_id: "B-UI-007", layer: "behavioral", severity: "must",
      outcome: clauses.every((c) => c.startsWith("pass")) ? "pass" : "fail",
      evidence: clauses.join(" | ") });
  }
  // ---- B-UI-010 (v2.0.0 must): flip token-role swap + WCAG symmetry; colorful
  // high-saturation error variants within the hue band; composite floors hold ----
  {
    const clauses = [];
    const spF = await openConfigPage(ctx, { flipTestColors: true });
    const spC = await openConfigPage(ctx, { colorfulError: true });
    const spX = await openConfigPage(ctx, { flipTestColors: true, colorfulError: true });
    try {
      const run = async (sp) => {
        await setWordsMode(sp.page, selectors);
        await focusWords(sp.page, selectors);
        const { targets } = await readTargets(sp.page, selectors);
        await driveFourStates(sp.page, targets);
        const css = await sp.page.evaluate(scanComputedStyles, selectors);
        css.ceExtra = await sp.page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue("--colorful-error-extra").trim());
        return css;
      };
      const [cssF, cssC, cssX] = [await run(spF), await run(spC), await run(spX)];
      const sErr = css0.tokens["--error"] ? rgbToHsl(parseColor(css0.tokens["--error"])).s : null;
      const bandOf = (col) => { const c = parseColor(col); return c ? rgbToHsl(c) : { h: -1, s: 0 }; };
      // (a) flip: roles swapped, symmetry preserves the O-UI-001 floor, band intact
      const flipBg = parseColor(cssF.effectiveBg), flipCorrect = parseColor(cssF.states.correct?.color);
      clauses.push(`${normTok(cssF.effectiveBg) === normTok(cssF.tokens["--text"]) ? "pass" : "fail"}: flip stream-area background from --text (${cssF.effectiveBg})`);
      clauses.push(`${normTok(cssF.states.correct?.color) === normTok(cssF.tokens["--bg"]) ? "pass" : "fail"}: flip letter colors derive from --bg (${cssF.states.correct?.color})`);
      const sym = flipBg && flipCorrect ? contrast(flipCorrect, flipBg) : 0;
      clauses.push(`${sym >= 4.5 ? "pass" : "fail"}: flip WCAG symmetry contrast=${sym.toFixed(2)} (>=4.5)`);
      const fi = bandOf(cssF.states.incorrect?.color), fe = bandOf(cssF.states.extra?.color);
      clauses.push(`${RED_BAND(fi.h) && fi.s >= 0.45 && RED_BAND(fe.h) && fe.s >= 0.45 ? "pass" : "fail"}: flip error hue band intact (incorrect h=${fi.h.toFixed(1)} s=${fi.s.toFixed(2)}; extra h=${fe.h.toFixed(1)} s=${fe.s.toFixed(2)})`);
      clauses.push(`${await hasStateClass(spF.page, selectors, "incorrect") && await hasStateClass(spF.page, selectors, "extra") ? "pass" : "fail"}: flip changes no classes/structure`);
      // (b) colorful: high-saturation variants sourced from --colorful-error, band applies
      clauses.push(`${normTok(cssC.states.incorrect?.color) === normTok(cssC.tokens["--colorful-error"]) ? "pass" : "fail"}: colorful incorrect renders from --colorful-error (${cssC.states.incorrect?.color})`);
      clauses.push(`${cssC.ceExtra && normTok(cssC.states.extra?.color) === normTok(cssC.ceExtra) ? "pass" : "fail"}: colorful extra renders the derived --colorful-error-extra (${cssC.ceExtra})`);
      const ci = bandOf(cssC.states.incorrect?.color), ce = bandOf(cssC.states.extra?.color);
      clauses.push(`${sErr !== null && ci.s > sErr && ce.s > sErr ? "pass" : "fail"}: colorful saturation raised above --error (s=${sErr.toFixed(2)} -> incorrect ${ci.s.toFixed(2)}, extra ${ce.s.toFixed(2)})`);
      clauses.push(`${RED_BAND(ci.h) && RED_BAND(ce.h) ? "pass" : "fail"}: colorful stays in the O-UI-002(ii) hue band (h=${ci.h.toFixed(1)}/${ce.h.toFixed(1)})`);
      clauses.push(`${await hasStateClass(spC.page, selectors, "incorrect") && await hasStateClass(spC.page, selectors, "extra") ? "pass" : "fail"}: colorful changes no classes/structure`);
      // composite: flip + colorful together — floors still hold
      const xBg = parseColor(cssX.effectiveBg), xCorrect = parseColor(cssX.states.correct?.color);
      const xSym = xBg && xCorrect ? contrast(xCorrect, xBg) : 0;
      const xi = bandOf(cssX.states.incorrect?.color);
      clauses.push(`${normTok(cssX.effectiveBg) === normTok(cssX.tokens["--text"]) && normTok(cssX.states.correct?.color) === normTok(cssX.tokens["--bg"]) ? "pass" : "fail"}: composite flip swap holds`);
      clauses.push(`${xSym >= 4.5 ? "pass" : "fail"}: composite WCAG symmetry contrast=${xSym.toFixed(2)} (>=4.5)`);
      clauses.push(`${normTok(cssX.states.incorrect?.color) === normTok(cssX.tokens["--colorful-error"]) && RED_BAND(xi.h) && sErr !== null && xi.s > sErr ? "pass" : "fail"}: composite colorful-in-flip within band (h=${xi.h.toFixed(1)} s=${xi.s.toFixed(2)})`);
    } finally {
      for (const sp of [spF, spC, spX]) { await sp.close(); ctx.artifactMetas.push(sp.meta); }
    }
    results.push({ invariant_id: "B-UI-010", layer: "behavioral", severity: "must",
      outcome: clauses.every((c) => c.startsWith("pass")) ? "pass" : "fail",
      evidence: clauses.join(" | ") });
  }
  // ---- B-UI-011 (should): randomTheme applies a catalog theme atomically ----
  {
    const clauses = [];
    const spR = await openConfigPage(ctx, { randomTheme: true });
    try {
      const cssR = await spR.page.evaluate(scanComputedStyles, selectors); // NO keystroke sent: tokens set before the first keystroke
      const list = await fetchJson(origin + "/api/themes");
      const members = [];
      for (const e of list.themes ?? []) members.push(await fetchJson(origin + "/api/themes/" + encodeURIComponent(e.name)));
      const matches = members.filter((m) => sameTokens(cssR.tokens, m.tokens)).map((m) => m.name);
      clauses.push(`${matches.length >= 1 ? "pass" : "fail"}: tokens at test start match catalog member(s) [${matches.join(",") || "none"}] (atomic application)`);
    } finally {
      await spR.close();
      ctx.artifactMetas.push(spR.meta);
    }
    results.push({ invariant_id: "B-UI-011", layer: "behavioral", severity: "should",
      outcome: clauses.every((c) => c.startsWith("pass")) ? "pass" : "fail",
      evidence: clauses.join(" | ") });
  }
  return results;
}
