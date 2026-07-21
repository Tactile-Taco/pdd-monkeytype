import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../implementation/src/server/app.js";
import { generateWords, decorateWords, mulberry32 } from "../implementation/src/engine/words.js";

const here = dirname(fileURLToPath(import.meta.url));

// ADV-W2-01 (wave-2 validator extension): the engine validators migrate off the
// RETIRED internalWordlist provider onto the wordlists bundle's shipped assets
// (implementation/assets/wordlists/<id>.json) — the S-ENG-004 handshake is now
// exercised against the S-WL-001 catalog the server actually serves. Same
// deterministic construction the retired provider used (generate + independent
// decoration stream from the same seed), sourced from the asset words.
export const WORDLIST_ASSETS_DIR = join(here, "..", "implementation", "assets", "wordlists");
export function readWordlistAsset(id) {
  return JSON.parse(readFileSync(join(WORDLIST_ASSETS_DIR, `${id}.json`), "utf8"));
}
export function assetWordlist({ language = "english", count = 50, seed = 1,
                                punctuation = false, numbers = false } = {}) {
  const asset = readWordlistAsset(language);
  const base = generateWords(count, seed, asset.words);
  const rnd = mulberry32(((seed ^ 0x9e3779b9) >>> 0) || 1); // independent decoration stream (B-ENG-009(d))
  return { id: `wordlists/${language}`, language, words: decorateWords(base, rnd, { punctuation, numbers }) };
}

// Starts the implementation on an ephemeral port with a temp data dir.
// clockMs (wave-3): boots with an INJECTED clock pinned at clockMs (createApp's
// `now` — streak aliveness per B-PRO-002, rate-limit windows per B-API-005/
// O-API-003); setNow/getNow drive it deterministically. `headers` on call()
// merges extra request headers (per-IP dimension via x-forwarded-for); the
// response headers are returned for retry-metadata assertions (B-API-005).
export async function bootApp({ ledgerDir = null, heartbeatMs, clockMs } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "pdd-data-"));
  let t = clockMs;
  const app = createApp({ dataDir, implVersion: "candidate", ledgerDir,
                          ...(heartbeatMs ? { heartbeatMs } : {}),
                          ...(clockMs !== undefined ? { now: () => t } : {}) });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = "GET", body, token, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, body: json, headers: res.headers };
  };
  const signup = async (name, password = "password123") => {
    const r = await call("/api/account/signup", { method: "POST", body: { name, password } });
    return r.body?.token;
  };
  return { base, call, signup, close: () => server.close(), dataDir, app,
           setNow: (x) => { t = x; }, getNow: () => t };
}

// Harness-side oracle of the SEALED user-config v1.2.0 defaults (37 keys),
// transcribed from protocols/user-config/ambiguity-log.md (v1.0.0 defaults +
// batch-1 keys; fontSize: 0 = unset/client default per the v1.1.1 PATCH,
// BQ-IMPL-01; batch-2 adds 14 keys and REMOVES customThemeId per round-4 ruling
// BQ-CFG-01 — a stored config carrying it now rejects on PUT, intended).
// Validators compare the candidate's effective config against this table —
// deliberately independent of implementation/src/server/validate.js.
export const SEALED_CONFIG_DEFAULTS = {
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
}; // 37 keys

// A deterministic, protocol-valid completion event generator for tests.
export function makeEvent(over = {}) {
  const ev = {
    wpm: 80.5, rawWpm: 84, acc: 95.5,
    charStats: [100, 4, 1, 0], charTotal: 105,
    mode: "time", mode2: "15", testDuration: 15, timestamp: 1752000000000,
    consistency: 70.2, keyConsistency: 55.1, wpmConsistency: 65.3,
    chartData: { wpm: [80, 81], burst: [7, 7], err: [0, 0] },
    keySpacing: [120, 110, 130], keyDuration: [80, 75, 90],
    restartCount: 0, afkDuration: 0, bailedOut: false,
    language: "english", punctuation: false, numbers: false,
    blindMode: false, stopOnLetter: false,
    hash: "h-" + Math.random().toString(36).slice(2, 12), incompleteTests: [],
  };
  return { ...ev, ...over };
}
