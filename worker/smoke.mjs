// Local smoke test of worker/bundle.mjs against a mock KV namespace (Node 20).
import worker from "./bundle.mjs";

const mem = new Map();
const ns = {
  async get(k, { type } = {}) { const v = mem.get(k); return v === undefined ? null : (type === "json" ? JSON.parse(v) : v); },
  async put(k, v) { mem.set(k, v); },
};
const env = { PDD_STORE: ns };
const call = (path, opts = {}) =>
  worker.fetch(new Request("https://x" + path, opts), env, {});

let fails = 0;
const check = (name, cond, extra = "") => {
  console.log((cond ? "PASS" : "FAIL") + " " + name + (extra ? " — " + extra : ""));
  if (!cond) fails++;
};

// 1. static
let r = await call("/");
check("GET / 200 html", r.status === 200 && r.headers.get("content-type").includes("text/html"), r.headers.get("content-type"));
const html = await r.text();
check("html has app.js", html.includes("/app.js"));
r = await call("/style.css");
const css = await r.text();
check("style.css 200 css + :root tokens", r.status === 200 && css.includes(":root") && css.includes("--caret"), r.headers.get("content-type"));
r = await call("/app.js");
const appjs = await r.text();
check("app.js 200 js + caret code", r.status === 200 && appjs.includes("updateCaret") && appjs.includes('caretEl.id = "caret"'));
r = await call("/engine/session.js");
check("/engine/session.js 200 module", r.status === 200 && (await r.text()).includes("export class TypingSession"));
r = await call("/shared/stats.js");
check("/shared/stats.js 200 module", r.status === 200 && (await r.text()).includes("export function round2"));
r = await call("/favicon.ico");
check("favicon 204", r.status === 204);

// 2. api: quotes + leaderboards + 404 envelope
r = await call("/api/quotes/random");
const q = await r.json();
check("quotes/random 200 S-QT-001 shape", r.status === 200 && typeof q.text === "string" && q.ratings === undefined && Number.isInteger(q.group));
r = await call("/api/leaderboards/15");
const lb = await r.json();
check("leaderboards/15 200 S-LB-001 shape", r.status === 200 && lb.board.mode2 === "15" && Array.isArray(lb.entries));
r = await call("/api/leaderboards/99");
check("leaderboards/99 404 envelope", r.status === 404 && (await r.json()).error.code === "not_found");
r = await call("/nope");
const nf = await r.json();
check("unknown route 404 envelope O-RES-004", r.status === 404 && nf.error.code === "not_found" && typeof nf.error.correlation_id === "string");
r = await call("/api/nope");
check("unknown api route 404 envelope", r.status === 404 && (await r.json()).error.code === "not_found");

// 3. auth flow: signup -> config -> result -> leaderboard entry
r = await call("/api/account/signup", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "smoke_ui1", password: "password123" }) });
const su = await r.json();
check("signup 200 token", r.status === 200 && typeof su.token === "string" && su.profile.name === "smoke_ui1");
const ah = { "content-type": "application/json", authorization: "Bearer " + su.token };
r = await call("/api/config", { headers: ah });
check("config defaults 200", r.status === 200 && (await r.json()).theme === "serika_dark");
r = await call("/api/config", { method: "PUT", headers: ah, body: JSON.stringify({ theme: "dark" }) });
check("config put merge", r.status === 200 && (await r.json()).theme === "dark");

const ev = { wpm: 80, rawWpm: 82, acc: 96, charStats: [400, 5, 0, 0], charTotal: 405, mode: "time",
  mode2: "15", testDuration: 15, timestamp: Date.now(), consistency: 70, keyConsistency: 60,
  wpmConsistency: 65, chartData: { wpm: [80], burst: [27], err: [0] }, keySpacing: [120, 110],
  keyDuration: [], restartCount: 0, afkDuration: 0, bailedOut: false, language: "english",
  punctuation: false, numbers: false, hash: "smoke-hash-1", incompleteTests: [] };
// B-AC-003 cross-check: rawWpm ~= charTotal/5/(15/60); use 308 chars -> 246.4
ev.charTotal = 308; ev.charStats = [300, 8, 0, 0]; ev.rawWpm = 246.4; ev.wpm = 240;
r = await call("/api/results", { method: "POST", headers: ah, body: JSON.stringify(ev) });
const saved = await r.json();
check("result 201 admitted", r.status === 201 && saved.anticheat.decision === "admit", JSON.stringify(saved.error || ""));
r = await call("/api/leaderboards/15", { headers: ah });
const lb2 = await r.json();
check("leaderboard shows result + requester", lb2.entries.length === 1 && lb2.entries[0].name === "smoke_ui1" && lb2.requester.rank === 1);
r = await call("/api/results", { headers: ah });
check("results list hides hash", r.status === 200 && (await r.json()).results[0].hash === undefined);

// 4. anticheat rejection + unauth
r = await call("/api/results", { method: "POST", headers: ah, body: JSON.stringify({ ...ev, hash: "h2", wpm: 999, rawWpm: 999 }) });
check("anticheat rejects 422", r.status === 422 && (await r.json()).error.message.includes("wpm_bound"));
r = await call("/api/config");
check("unauth config 401", r.status === 401);
r = await call("/api/account/login", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "smoke_ui1", password: "password123" }) });
check("login 200", r.status === 200 && (await r.json()).token);

console.log(fails === 0 ? "ALL PASS" : fails + " FAILURES");
process.exit(fails ? 1 : 0);
