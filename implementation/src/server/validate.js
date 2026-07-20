// Minimal hand-rolled validators for protocol handshakes (server-side).
// Keeps implementation dependency allowlists tight (no ajv in impl); the harness
// independently validates the same payloads with ajv against the bundle schemas.

export function isNonNegInt(n) { return Number.isInteger(n) && n >= 0; }
export function isNum(n) { return typeof n === "number" && !Number.isNaN(n); }
export function inRange(n, lo, hi) { return isNum(n) && n >= lo && n <= hi; }

export function validateCompletedEvent(e) {
  const errs = [];
  const req = (cond, msg) => { if (!cond) errs.push(msg); };
  req(e && typeof e === "object", "event object required");
  if (!e || typeof e !== "object") return errs;
  req(isNum(e.wpm) && e.wpm >= 0, "wpm >= 0");
  req(isNum(e.rawWpm) && e.rawWpm >= 0, "rawWpm >= 0");
  req(inRange(e.acc, 0, 100), "acc in [0,100]");
  req(Array.isArray(e.charStats) && e.charStats.length === 4 && e.charStats.every(isNonNegInt),
      "charStats tuple[4] of non-negative ints");
  req(isNonNegInt(e.charTotal), "charTotal non-negative int");
  req(["time", "words", "quote", "zen", "custom"].includes(e.mode), "mode enum");
  req(typeof e.mode2 === "string", "mode2 string");
  if (e.mode === "quote") req(isNonNegInt(e.quoteLength) && e.quoteLength <= 3, "quoteLength 0..3");
  req(isNum(e.testDuration) && e.testDuration > 0, "testDuration > 0");
  req(isNonNegInt(e.timestamp), "timestamp int");
  for (const k of ["consistency", "keyConsistency", "wpmConsistency"]) req(inRange(e[k], 0, 100), k + " in [0,100]");
  req(e.chartData === "toolong" ||
      (e.chartData && ["wpm", "burst", "err"].every((k) =>
        Array.isArray(e.chartData[k]) && e.chartData[k].length <= 122)), "chartData arrays <= 122");
  req(isNonNegInt(e.restartCount), "restartCount int");
  req(isNum(e.afkDuration) && e.afkDuration >= 0, "afkDuration >= 0");
  req(typeof e.bailedOut === "boolean", "bailedOut bool");
  req(typeof e.language === "string", "language string");
  req(typeof e.punctuation === "boolean" && typeof e.numbers === "boolean", "flags bool");
  req(typeof e.hash === "string" && e.hash.length <= 100, "hash <= 100 chars");
  req(Array.isArray(e.incompleteTests), "incompleteTests array");
  return errs;
}

// user-config v1.2.0: closed key set 24 -> 37 (brownfield batch 2; 14 added,
// customThemeId removed pre-consumer per round-4 ruling BQ-CFG-01 — a stored
// config carrying it is rejected on next PUT per S-CFG-001, intended).
// Value domains mirror protocols/user-config/schemas/config.schema.json exactly.
// Custom theme slot VALUES stay loose here (any string <= 32 chars, "" = unset);
// charter-pattern conformance is enforced at application time by ui-presentation
// theme resolution (B-UI-005 fail-closed all-nine gate) — deliberate per the
// v1.2.0 ambiguity-log so "" remains representable as unset.
export const CONFIG_KEYS = {
  // v1.0.0 keys (unchanged)
  mode: (v) => ["time", "words", "quote", "zen", "custom"].includes(v),
  mode2: (v) => typeof v === "string",
  language: (v) => typeof v === "string" && v.length > 0,
  punctuation: (v) => typeof v === "boolean",
  numbers: (v) => typeof v === "boolean",
  difficulty: (v) => ["normal", "expert", "master"].includes(v),
  blindMode: (v) => typeof v === "boolean",
  stopOnError: (v) => ["off", "letter", "word"].includes(v),
  theme: (v) => typeof v === "string",
  lazyMode: (v) => typeof v === "boolean",
  // batch-1: typing-test-engine v2.0.0 consumers
  confidenceMode: (v) => typeof v === "boolean",
  freedomMode: (v) => typeof v === "boolean",
  strictSpace: (v) => typeof v === "boolean",
  oppositeShift: (v) => typeof v === "boolean",
  minWpm: (v) => isNum(v) && v >= 0,
  minAcc: (v) => inRange(v, 0, 100),
  // batch-1: ui-presentation v2.0.0 consumers
  fontFamily: (v) => typeof v === "string" && v.length <= 100,
  fontSize: (v) => isNum(v) && v >= 0, // v1.1.1: minimum 0; 0 = unset/client default (BQ-IMPL-01 closed)
  tapeMode: (v) => typeof v === "boolean",
  quickRestart: (v) => ["off", "tab", "esc", "enter"].includes(v),
  flipTestColors: (v) => typeof v === "boolean",
  colorfulError: (v) => typeof v === "boolean",
  randomTheme: (v) => typeof v === "boolean",
  // batch-2 (v1.2.0): custom theme slots (9, per C2 incl. sub-alt/colorful-error)
  customThemeBg: (v) => typeof v === "string" && v.length <= 32,
  customThemeMain: (v) => typeof v === "string" && v.length <= 32,
  customThemeCaret: (v) => typeof v === "string" && v.length <= 32,
  customThemeSub: (v) => typeof v === "string" && v.length <= 32,
  customThemeSubAlt: (v) => typeof v === "string" && v.length <= 32,
  customThemeText: (v) => typeof v === "string" && v.length <= 32,
  customThemeError: (v) => typeof v === "string" && v.length <= 32,
  customThemeErrorExtra: (v) => typeof v === "string" && v.length <= 32,
  customThemeColorfulError: (v) => typeof v === "string" && v.length <= 32,
  // batch-2 (v1.2.0): caret
  caretStyle: (v) => ["off", "line", "block", "outline", "underline"].includes(v),
  smoothCaret: (v) => typeof v === "boolean",
  // batch-2 (v1.2.0): live-stats display toggles (STORAGE sealed; display delegated)
  liveWpm: (v) => typeof v === "boolean",
  liveAcc: (v) => typeof v === "boolean",
  liveBurst: (v) => typeof v === "boolean",
};

// Sealed defaults (ambiguity-log). Defaults-merge at read time => zero data
// migration: configs stored under any prior minor are valid v1.2.0 configs
// (B-CFG-001). fontSize: 0 = unset/client default (v1.1.1, BQ-IMPL-01 closed).
export const CONFIG_DEFAULTS = {
  mode: "time", mode2: "30", language: "english", punctuation: false,
  numbers: false, difficulty: "normal", blindMode: false, stopOnError: "off",
  theme: "serika_dark", lazyMode: false,
  confidenceMode: false, freedomMode: false, strictSpace: false,
  oppositeShift: false, minWpm: 0, minAcc: 0,
  fontFamily: "", fontSize: 0, tapeMode: false,
  quickRestart: "tab", flipTestColors: false, colorfulError: false,
  randomTheme: false,
  customThemeBg: "", customThemeMain: "", customThemeCaret: "",
  customThemeSub: "", customThemeSubAlt: "", customThemeText: "",
  customThemeError: "", customThemeErrorExtra: "", customThemeColorfulError: "",
  caretStyle: "line", smoothCaret: true,
  liveWpm: false, liveAcc: false, liveBurst: false,
};

// -> {ok, badKeys} wholesale validation (B-CFG-003)
export function validateConfigUpdate(u) {
  if (!u || typeof u !== "object" || Array.isArray(u)) return { ok: false, badKeys: ["<body>"] };
  const keys = Object.keys(u);
  if (keys.length === 0) return { ok: false, badKeys: ["<empty>"] };
  const badKeys = keys.filter((k) => !(k in CONFIG_KEYS) || !CONFIG_KEYS[k](u[k]));
  return { ok: badKeys.length === 0, badKeys };
}

export function keyStats(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return { average: 0, sd: 0 };
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  const sd = Math.sqrt(arr.reduce((a, x) => a + (x - avg) ** 2, 0) / arr.length);
  return { average: avg, sd };
}
