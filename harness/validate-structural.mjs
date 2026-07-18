// PDD Validator Loop — Layer 1: STRUCTURAL (schema-conformance + contract tests).
// Maps to invariant IDs; emits harness/out/structural.json.
import { loadBundle } from "./schema-loader.mjs";
import { bootApp, makeEvent } from "./boot.mjs";
import { writeJson } from "./evidence.mjs";
import { TypingSession } from "../implementation/src/engine/session.js";
import { generateWords } from "../implementation/src/engine/words.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const P = (b) => join(root, "protocols", b);
const results = [];
const rec = (invariant, layer, ok, evidence = "") =>
  results.push({ invariant_id: invariant, layer, outcome: ok ? "pass" : "fail", evidence: String(evidence).slice(0, 300) });
const check = (id, cond, ev = "") => rec(id, "structural", !!cond, ev);

const app = await bootApp();
try {
  // ---------- user-account ----------
  const acc = loadBundle(P("user-account"));
  {
    const bad = await app.call("/api/account/signup", { method: "POST", body: { name: "x", password: "password123" } });
    check("S-ACC-001", bad.status === 422, `status=${bad.status}`);
    check("S-ACC-002", acc.validate("error.schema.json", bad.body).ok, JSON.stringify(acc.validate("error.schema.json", bad.body).errors));
    const good = await app.call("/api/account/signup", { method: "POST", body: { name: "struct_user", password: "password123" } });
    check("S-ACC-003", acc.validate("auth-response.schema.json", good.body).ok, JSON.stringify(good.body).slice(0, 120));
    const prof = await app.call("/api/account/profile", { token: good.body.token });
    check("S-ACC-003", acc.validate("profile.schema.json", prof.body).ok, "profile");
    const unauth = await app.call("/api/account/profile", {});
    check("S-ACC-002", unauth.status === 401 && acc.validate("error.schema.json", unauth.body).ok, "401 envelope");
  }
  // ---------- user-config ----------
  const cfg = loadBundle(P("user-config"));
  const token = await app.signup("cfg_user");
  {
    const got = await app.call("/api/config", { token });
    check("S-CFG-001", cfg.validate("config.schema.json", got.body).ok, JSON.stringify(cfg.validate("config.schema.json", got.body).errors));
    const badPut = await app.call("/api/config", { method: "PUT", token, body: { noSuchKey: 1 } });
    check("S-CFG-001", badPut.status === 422 && cfg.validate("error.schema.json", badPut.body).ok, "unknown key rejected");
    const empty = await app.call("/api/config", { method: "PUT", token, body: {} });
    check("S-CFG-002", empty.status === 422, "empty update rejected");
  }
  // ---------- quote-library ----------
  const qt = loadBundle(P("quote-library"));
  {
    const r = await app.call("/api/quotes/random?language=english");
    check("S-QT-001", r.status === 200 && qt.validate("quote.schema.json", r.body).ok, JSON.stringify(qt.validate("quote.schema.json", r.body).errors));
    const unauth = await app.call("/api/quotes", { method: "POST", body: { text: "hello", source: "x", language: "english" } });
    check("S-QT-002", unauth.status === 401 && qt.validate("error.schema.json", unauth.body).ok, "401 envelope");
  }
  // ---------- test-results ----------
  const res = loadBundle(P("test-results"));
  {
    const unauth = await app.call("/api/results", { method: "POST", body: makeEvent() });
    check("S-RES-003", unauth.status === 401 && res.validate("error.schema.json", unauth.body).ok, "401 envelope");
    const malformed = await app.call("/api/results", { method: "POST", token, body: { wpm: -1 } });
    check("S-RES-001", malformed.status === 422 && res.validate("error.schema.json", malformed.body).ok, "malformed rejected");
    const okPost = await app.call("/api/results", { method: "POST", token, body: makeEvent() });
    check("S-RES-002", okPost.status === 201 && res.validate("stored-result.schema.json", okPost.body).ok,
          JSON.stringify(res.validate("stored-result.schema.json", okPost.body).errors));
  }
  // ---------- leaderboards ----------
  const lb = loadBundle(P("leaderboards"));
  {
    const r = await app.call("/api/leaderboards/15");
    check("S-LB-001", r.status === 200 && lb.validate("leaderboard.schema.json", r.body).ok,
          JSON.stringify(lb.validate("leaderboard.schema.json", r.body).errors));
    const nf = await app.call("/api/leaderboards/99");
    check("S-LB-002", nf.status === 404 && lb.validate("error.schema.json", nf.body).ok, "404 envelope");
  }
  // ---------- unknown-route envelope (regression from manual testing) ----------
  {
    const nf = await app.call("/api/definitely-not-a-route");
    check("S-RES-003", nf.status === 404 && nf.body?.error?.code === "not_found" &&
          typeof nf.body?.error?.correlation_id === "string",
          "unknown API route returns ErrorEnvelope");
  }
  // ---------- typing-test-engine: synthetic completion event vs handshake ----------
  const eng = loadBundle(P("typing-test-engine"));
  {
    const s = new TypingSession({ mode: "words", mode2: "5", words: generateWords(5, 7), now: () => 1752000000000 });
    let t = 1000;
    for (const w of s.words) {
      for (const ch of w) { s.feed({ t, type: "char", value: ch }); t += 120; }
      s.feed({ t, type: "space" }); t += 120;
    }
    const ev = s.completionEvent({ timestamp: 1752000000000, hash: "struct-test" });
    check("S-ENG-001", eng.validate("completed-event.schema.json", ev).ok,
          JSON.stringify(eng.validate("completed-event.schema.json", ev).errors).slice(0, 200));
    check("S-ENG-003", ["time", "words", "quote", "zen", "custom"].includes(ev.mode) && typeof ev.mode2 === "string", "mode enums");
    const bad = new TypingSession({ mode: "words", mode2: "5", words: ["abc", "def"] });
    bad.feed(null); bad.feed({ t: -5, type: "char", value: "x" }); bad.feed({ t: 1, type: "nonsense" });
    check("S-ENG-002", bad.inputs[0] === "", "out-of-contract events ignored");
  }
} finally {
  app.close();
}

const failed = results.filter((r) => r.outcome === "fail");
const out = { layer: "structural", validator: { id: "schema-conformance+contract-tests", version: "1.0.0" },
              results, verdict: failed.length === 0 ? "admit" : "reject",
              verdict_reason: failed.length ? `${failed.length} structural failures` : "all structural checks pass" };
writeJson(new URL("./out/structural.json", import.meta.url).pathname, out);
console.log(JSON.stringify({ verdict: out.verdict, checks: results.length, failed: failed.map((f) => f.invariant_id) }, null, 2));
process.exit(failed.length ? 1 : 0);
