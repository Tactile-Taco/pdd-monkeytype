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

export const CONFIG_KEYS = {
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
};

export const CONFIG_DEFAULTS = {
  mode: "time", mode2: "30", language: "english", punctuation: false,
  numbers: false, difficulty: "normal", blindMode: false, stopOnError: "off",
  theme: "serika_dark", lazyMode: false,
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
