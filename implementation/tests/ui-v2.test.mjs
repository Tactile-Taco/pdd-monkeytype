// Focused unit tests for theme-catalog v1.0.0 + user-config v1.2.0 +
// ui-presentation v2.0.0 shared logic. Every test carries invariant lineage.
// Run: node --test implementation/tests/
// (The formal validator-suite extension for v2 invariants is a later stage;
// these are the candidate's own cheap checks.)
import test from "node:test";
import assert from "node:assert/strict";
import { THEMES, THEME_SLOTS, DEFAULT_THEME, COLOR_RE, catalogList, findTheme,
         validateThemeShape, charterBandReport, customSlotsToTokens, CUSTOM_SLOT_MAP,
         resolveThemeTokens, deriveColorfulExtra, parseHex, rgbToHsl, maxChannelDelta,
         contrast } from "../src/shared/themes.js";
import { CONFIG_KEYS, CONFIG_DEFAULTS, validateConfigUpdate } from "../src/server/validate.js";

// ---------- user-config v1.2.0: closed 37-key set (S-CFG-001/002, B-CFG-003) ----------
test("S-CFG-001: 37 sealed keys; customThemeId removed (BQ-CFG-01)", () => {
  assert.equal(Object.keys(CONFIG_KEYS).length, 37);
  assert.equal(Object.keys(CONFIG_DEFAULTS).length, 37);
  assert.deepEqual(Object.keys(CONFIG_KEYS).sort(), Object.keys(CONFIG_DEFAULTS).sort());
  assert.ok(!("customThemeId" in CONFIG_KEYS) && !("customThemeId" in CONFIG_DEFAULTS));
});
test("B-CFG-003: batch-2 value domains; wholesale rejection shape", () => {
  assert.ok(validateConfigUpdate({ caretStyle: "block" }).ok);
  assert.ok(!validateConfigUpdate({ caretStyle: "curly" }).ok);
  assert.ok(validateConfigUpdate({ smoothCaret: false, liveWpm: true, liveAcc: true, liveBurst: true }).ok);
  assert.ok(validateConfigUpdate({ customThemeBg: "not a color!" }).ok); // slots loose ("" unset); app-time gate
  assert.ok(!validateConfigUpdate({ customThemeBg: "x".repeat(33) }).ok);
  assert.ok(!validateConfigUpdate({ customThemeId: "theme-42" }).ok); // removed key -> unknown
  assert.ok(!validateConfigUpdate({}).ok); // S-CFG-002: at least one key
});

// ---------- theme-catalog v1.0.0: starter set conformance (S-THM-001/002, O-THM-003) ----------
test("S-THM-001/002: every starter theme carries the nine sealed slots, charter colors", () => {
  assert.equal(THEMES.length, 10); // ~10 starter themes (delegated data)
  for (const t of THEMES) {
    const v = validateThemeShape(t);
    assert.ok(v.ok, `${t.name}: ${v.errors.join("; ")}`);
    assert.deepEqual(Object.keys(t.tokens).sort(), [...THEME_SLOTS].sort());
  }
});
test("O-THM-003: every starter theme passes the static charter bands", () => {
  for (const t of THEMES) {
    const r = charterBandReport(t.tokens);
    assert.ok(r.ok, `${t.name}: ${r.clauses.filter((c) => !c.ok).map((c) => c.msg).join("; ")}`);
  }
});
test("O-THM-003 negative: band violations are caught (contrast, hue, distinction)", () => {
  const base = { ...DEFAULT_THEME.tokens };
  assert.ok(!charterBandReport({ ...base, "--text": "#3a3b3e" }).ok);   // contrast floor
  assert.ok(!charterBandReport({ ...base, "--error": "#3ba7ff" }).ok);  // hue band
  assert.ok(!charterBandReport({ ...base, "--error-extra": "#cf5763" }).ok); // == error: pair delta 0
  assert.ok(!charterBandReport({ ...base, "--bg": "#f2f2f2" }).ok);     // L(bg) > 0.2
});
test("B-THM-001 shape: catalog list carries every theme name; findTheme round-trips", () => {
  const list = catalogList();
  assert.equal(list.length, THEMES.length);
  for (const { name } of list) assert.equal(findTheme(name).name, name);
  assert.equal(findTheme("definitely-not-a-theme"), null);
});
test("S-THM-001 negative: malformed themes rejected by the shape check", () => {
  assert.ok(!validateThemeShape(null).ok);
  assert.ok(!validateThemeShape({ name: "", tokens: {} }).ok);
  const missing = { name: "x", tokens: { ...DEFAULT_THEME.tokens } };
  delete missing.tokens["--sub-alt"];
  assert.ok(!validateThemeShape(missing).ok);
  const badColor = { name: "x", tokens: { ...DEFAULT_THEME.tokens, "--caret": "red" } };
  assert.ok(!validateThemeShape(badColor).ok);
});

// ---------- ui-presentation v2.0.0: theme resolution precedence (B-UI-005) ----------
const validSlots = () => ({
  customThemeBg: "#101010", customThemeMain: "#202020", customThemeCaret: "#303030",
  customThemeSub: "#404040", customThemeSubAlt: "#505050", customThemeText: "#606060",
  customThemeError: "#aa0000", customThemeErrorExtra: "#550000", customThemeColorfulError: "#ff1111",
});
test("B-UI-005 (1): all-nine valid custom slots form the active token set", () => {
  const cfg = { ...validSlots(), theme: "dracula" };
  const tokens = customSlotsToTokens(cfg);
  assert.ok(tokens);
  assert.equal(tokens["--bg"], "#101010");
  assert.equal(tokens["--colorful-error"], "#ff1111");
  const r = resolveThemeTokens(cfg, findTheme);
  assert.equal(r.source, "custom"); // custom outranks a valid catalog name
});
test("B-UI-005 gate: partial or malformed custom slots fail closed", () => {
  const missing = validSlots(); delete missing.customThemeSubAlt;
  assert.equal(customSlotsToTokens(missing), null);
  assert.equal(customSlotsToTokens({ ...validSlots(), customThemeBg: "" }), null);        // empty = unset
  assert.equal(customSlotsToTokens({ ...validSlots(), customThemeError: "red" }), null);  // non-pattern
  assert.equal(customSlotsToTokens({ ...validSlots(), customThemeText: "#12345" }), null);
  // falls through to the catalog path
  const r = resolveThemeTokens({ ...validSlots(), customThemeBg: "", theme: "nord" }, findTheme);
  assert.equal(r.source, "catalog");
  assert.equal(r.name, "nord");
});
test("B-UI-005 (2)(3): catalog by name; unknown/absent -> default dark theme", () => {
  assert.equal(resolveThemeTokens({ theme: "matrix" }, findTheme).name, "matrix");
  const unknown = resolveThemeTokens({ theme: "definitely-not-a-theme" }, findTheme);
  assert.equal(unknown.source, "default");
  assert.deepEqual(unknown.tokens, DEFAULT_THEME.tokens);
  assert.equal(resolveThemeTokens({ theme: "" }, findTheme).source, "default");
  assert.equal(resolveThemeTokens({}, findTheme).source, "default");
  // unreadable catalog (lookup throws/returns null) -> default
  assert.equal(resolveThemeTokens({ theme: "dracula" }, () => null).source, "default");
});
test("B-UI-005: resolved catalog/default sets always satisfy the charter bands", () => {
  for (const name of catalogList().map((t) => t.name)) {
    const r = resolveThemeTokens({ theme: name }, findTheme);
    assert.ok(charterBandReport(r.tokens).ok, name);
  }
  assert.ok(charterBandReport(resolveThemeTokens({}, findTheme).tokens).ok);
});

// ---------- ui-presentation v2.0.0: colorful derivation (B-UI-010(b)) ----------
test("B-UI-010(b): colorful extra derivation keeps hue/sat, drops lightness", () => {
  for (const t of THEMES) {
    const src = t.tokens["--colorful-error"];
    const derived = deriveColorfulExtra(src);
    assert.ok(COLOR_RE.test(derived), t.name);
    const a = rgbToHsl(parseHex(src)), b = rgbToHsl(parseHex(derived));
    assert.ok(Math.abs(a.h - b.h) < 1.5, `${t.name}: hue drift ${a.h} -> ${b.h}`);
    assert.ok(Math.abs(a.s - b.s) < 0.02, `${t.name}: sat drift ${a.s} -> ${b.s}`);
    assert.ok(b.l < a.l, `${t.name}: lightness not reduced`);
    // stays distinguishable from its source (incorrect vs extra under colorful)
    assert.ok(maxChannelDelta(parseHex(src), parseHex(derived)) >= 32,
            `${t.name}: colorful pair delta ${maxChannelDelta(parseHex(src), parseHex(derived))}`);
    // and keeps the error-role contrast floor on the theme bg
    assert.ok(contrast(parseHex(src), parseHex(t.tokens["--bg"])) >= 3.0, t.name);
  }
  assert.equal(deriveColorfulExtra("nope"), null);
});
test("B-UI-010(b) property: colorful error states exceed s(--error) within the hue band", () => {
  const RED = (h) => (h >= 0 && h <= 15) || (h >= 340 && h <= 360);
  for (const t of THEMES) {
    const sErr = rgbToHsl(parseHex(t.tokens["--error"])).s;
    const col = rgbToHsl(parseHex(t.tokens["--colorful-error"]));
    assert.ok(RED(col.h), `${t.name}: colorful hue ${col.h.toFixed(1)} out of band`);
    assert.ok(col.s > sErr, `${t.name}: s(colorful)=${col.s.toFixed(3)} <= s(error)=${sErr.toFixed(3)}`);
  }
});
