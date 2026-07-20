// theme-catalog v1.0.0 + ui-presentation v2.0.0 — shared theme module.
// Isomorphic (zero runtime deps, no node: imports): served verbatim to the
// browser (/shared/themes.js), imported by the Node server, and concatenated
// into the Workers bundle (worker/build.mjs). Single source of truth for:
//   - the nine sealed token slots (S-THM-002 / S-UI-004)
//   - the starter catalog data (S-THM-001; contents transient, shape is the contract)
//   - static charter-band checking (O-THM-003): pure WCAG/HSL math over hex tokens
//   - ui-presentation theme resolution precedence (B-UI-005) and the
//     colorful-error derivation (B-UI-010(b))

// ---- sealed charter surface ----
export const COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/; // theme.schema.json colorToken
export const THEME_SLOTS = [
  "--bg", "--main", "--caret", "--sub", "--sub-alt",
  "--text", "--error", "--error-extra", "--colorful-error",
]; // S-THM-002: nine slots, additive growth only

// ---- color math (WCAG 2.x relative luminance; rgb -> HSL) ----
export function parseHex(v) {
  if (typeof v !== "string" || !COLOR_RE.test(v)) return null;
  let h = v.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
export function relLuminance({ r, g, b }) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a, b) {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
export function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s, l };
}
export function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return "#" + to(r) + to(g) + to(b);
}
export function maxChannelDelta(a, b) {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

// ---- charter shape (S-THM-001/S-THM-002; mirrors theme.schema.json) ----
export function validateThemeShape(theme) {
  const errors = [];
  if (!theme || typeof theme !== "object") return { ok: false, errors: ["theme object required"] };
  if (typeof theme.name !== "string" || theme.name.length < 1) errors.push("name: non-empty string required");
  if (!theme.tokens || typeof theme.tokens !== "object") errors.push("tokens object required");
  else {
    for (const slot of THEME_SLOTS) {
      const v = theme.tokens[slot];
      if (typeof v !== "string" || !COLOR_RE.test(v)) errors.push(`${slot}: charter color pattern required (got ${JSON.stringify(v)})`);
    }
    for (const [k, v] of Object.entries(theme.tokens)) { // additive slots permitted, must be colors
      if (!THEME_SLOTS.includes(k) && (typeof v !== "string" || !COLOR_RE.test(v))) errors.push(`${k}: additive slot must be a color`);
    }
    const extraKeys = Object.keys(theme).filter((k) => !["name", "tokens"].includes(k));
    if (extraKeys.length) errors.push(`unknown top-level keys: ${extraKeys.join(",")}`);
  }
  return { ok: errors.length === 0, errors };
}

// ---- static charter bands (O-THM-003; same floors as O-UI-001..003, no browser) ----
const RED_BAND = (h) => (h >= 0 && h <= 15) || (h >= 340 && h <= 360);
export function charterBandReport(tokens) {
  const clauses = [];
  const p = (k) => parseHex(tokens[k]);
  const bg = p("--bg"), text = p("--text"), error = p("--error"), extra = p("--error-extra"),
        caret = p("--caret"), sub = p("--sub");
  const req = (ok, msg) => clauses.push({ ok, msg });
  req(!!(bg && text && error && extra && caret && sub), "all band-relevant tokens parse as charter colors");
  if (!(bg && text && error && extra && caret && sub)) return { ok: false, clauses };
  req(contrast(text, bg) >= 4.5, `contrast(--text,--bg)=${contrast(text, bg).toFixed(2)} >= 4.5`);
  req(contrast(error, bg) >= 3.0, `contrast(--error,--bg)=${contrast(error, bg).toFixed(2)} >= 3.0`);
  req(contrast(caret, bg) >= 3.0, `contrast(--caret,--bg)=${contrast(caret, bg).toFixed(2)} >= 3.0`);
  req(relLuminance(bg) <= 0.2, `L(--bg)=${relLuminance(bg).toFixed(4)} <= 0.2`);
  req(relLuminance(text) > relLuminance(bg), `L(--text) > L(--bg)`);
  for (const [k, c] of [["--error", error], ["--error-extra", extra]]) {
    const { h, s } = rgbToHsl(c);
    req(RED_BAND(h) && s >= 0.45, `${k} h=${h.toFixed(1)} in redband, s=${s.toFixed(3)} >= 0.45`);
  }
  // four renderable letter states (untyped/correct/incorrect/extra) pairwise distinct
  const states = { untyped: sub, correct: text, incorrect: error, extra };
  const names = Object.keys(states);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const d = maxChannelDelta(states[names[i]], states[names[j]]);
    req(d >= 32, `${names[i]}~${names[j]} maxChannelDelta=${d} >= 32`);
  }
  return { ok: clauses.every((c) => c.ok), clauses };
}

// ---- starter catalog (delegated data, ~10 themes; byte-stable within a deploy) ----
// Every entry passes validateThemeShape + charterBandReport at module load and at
// server boot (catalog admission). Reference-informed values; band-driven hex
// adjustments are documented in research/brownfield/implementation/ui-v2-report.md
// (BQ-THM-02: no exceptions, minimal delta, charter = persistent intent).
export const DEFAULT_THEME = {
  name: "serika_dark",
  tokens: {
    "--bg": "#323437", "--main": "#e2b714", "--caret": "#e2b714",
    "--sub": "#646669", "--sub-alt": "#2c2e31", "--text": "#d1d0c5",
    "--error": "#cf5763", "--error-extra": "#7e2a33", "--colorful-error": "#ff4655",
  },
};
export const THEMES = [
  DEFAULT_THEME,
  { name: "dracula", tokens: {
    "--bg": "#282a36", "--main": "#bd93f9", "--caret": "#f8f8f2",
    "--sub": "#6272a4", "--sub-alt": "#191a21", "--text": "#f8f8f2",
    "--error": "#e1555f", "--error-extra": "#7d2f36", "--colorful-error": "#ff4655" } },
  { name: "nord", tokens: {
    "--bg": "#2e3440", "--main": "#88c0d0", "--caret": "#d8dee9",
    "--sub": "#4c566a", "--sub-alt": "#242933", "--text": "#d8dee9",
    "--error": "#c45c66", "--error-extra": "#7b2d37", "--colorful-error": "#ff5d67" } },
  { name: "monokai", tokens: {
    "--bg": "#272822", "--main": "#a6e22e", "--caret": "#f8f8f2",
    "--sub": "#75715e", "--sub-alt": "#1c1c17", "--text": "#f8f8f2",
    "--error": "#f92656", "--error-extra": "#8a1e38", "--colorful-error": "#ff2e4f" } },
  { name: "gruvbox_dark", tokens: {
    "--bg": "#282828", "--main": "#fabd2f", "--caret": "#ebdbb2",
    "--sub": "#928374", "--sub-alt": "#1d1d1d", "--text": "#ebdbb2",
    "--error": "#e04738", "--error-extra": "#8f3a2f", "--colorful-error": "#ff4934" } },
  { name: "solarized_dark", tokens: {
    "--bg": "#002b36", "--main": "#b58900", "--caret": "#93a1a1",
    "--sub": "#586e75", "--sub-alt": "#001f27", "--text": "#93a1a1",
    "--error": "#dc322f", "--error-extra": "#7c2d2a", "--colorful-error": "#ff322e" } },
  { name: "matrix", tokens: {
    "--bg": "#000000", "--main": "#15ff00", "--caret": "#15ff00",
    "--sub": "#006500", "--sub-alt": "#02100a", "--text": "#00ff41",
    "--error": "#e03131", "--error-extra": "#7d1f1f", "--colorful-error": "#ff1e1e" } },
  { name: "carbon", tokens: {
    "--bg": "#313131", "--main": "#f66e0d", "--caret": "#f66e0d",
    "--sub": "#665c54", "--sub-alt": "#252525", "--text": "#f5e6c8",
    "--error": "#e74c3c", "--error-extra": "#7e2a33", "--colorful-error": "#ff4433" } },
  { name: "midnight", tokens: {
    "--bg": "#1e1e2e", "--main": "#cba6f7", "--caret": "#f5e0dc",
    "--sub": "#6c7086", "--sub-alt": "#181825", "--text": "#cdd6f4",
    "--error": "#e0799a", "--error-extra": "#853046", "--colorful-error": "#ff8fa8" } },
  { name: "bento", tokens: {
    "--bg": "#2d394d", "--main": "#ff7a90", "--caret": "#ff7a90",
    "--sub": "#4a6785", "--sub-alt": "#212b3b", "--text": "#e4ecf7",
    "--error": "#e06b6e", "--error-extra": "#873137", "--colorful-error": "#ff5a5e" } },
];

export function catalogList() { return THEMES.map((t) => ({ name: t.name })); }
export function findTheme(name) { return THEMES.find((t) => t.name === name) ?? null; }

// ---- ui-presentation v2.0.0 theme resolution (B-UI-005) ----
// user-config v1.2.0 custom slot keys -> charter slots (nine slots per C2).
export const CUSTOM_SLOT_MAP = {
  customThemeBg: "--bg", customThemeMain: "--main", customThemeCaret: "--caret",
  customThemeSub: "--sub", customThemeSubAlt: "--sub-alt", customThemeText: "--text",
  customThemeError: "--error", customThemeErrorExtra: "--error-extra",
  customThemeColorfulError: "--colorful-error",
};
// Precedence (sealed): (1) custom slots when ALL NINE are non-empty AND every
// value matches the charter color pattern; (2) the catalog theme named by
// config theme (via the injected catalog lookup); (3) the default dark theme.
// The all-nine gate keeps partial/malformed custom themes fail-closed.
export function customSlotsToTokens(cfg) {
  const tokens = {};
  for (const [key, slot] of Object.entries(CUSTOM_SLOT_MAP)) {
    const v = cfg?.[key];
    if (typeof v !== "string" || v === "" || !COLOR_RE.test(v)) return null; // fail-closed
    tokens[slot] = v;
  }
  return tokens;
}
export function resolveThemeTokens(cfg, catalogGet) {
  const custom = customSlotsToTokens(cfg);
  if (custom) return { source: "custom", name: "custom", tokens: custom };
  const named = typeof cfg?.theme === "string" && cfg.theme ? catalogGet(cfg.theme) : null;
  if (named && validateThemeShape(named).ok) return { source: "catalog", name: named.name, tokens: named.tokens };
  return { source: "default", name: DEFAULT_THEME.name, tokens: DEFAULT_THEME.tokens };
}

// ---- colorful-error derivation (B-UI-010(b)) ----
// incorrect renders as --colorful-error; extra as a lightness-reduced variant
// (same hue/saturation -> stays in the red band with s >= s(--error) whenever
// the source does), derived deterministically from the token set.
export function deriveColorfulExtra(colorfulErrorHex) {
  const c = parseHex(colorfulErrorHex);
  if (!c) return null;
  const { h, s, l } = rgbToHsl(c);
  return hslToHex(h, s, Math.max(l * 0.55, 0.12));
}
