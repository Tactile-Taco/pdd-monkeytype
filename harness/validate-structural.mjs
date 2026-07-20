// PDD Validator Loop — Layer 1: STRUCTURAL (schema-conformance + contract tests).
// Maps to invariant IDs; emits harness/out/structural.json.
import { loadBundle } from "./schema-loader.mjs";
import { bootApp, makeEvent, SEALED_CONFIG_DEFAULTS } from "./boot.mjs";
import { writeJson } from "./evidence.mjs";
import { TypingSession } from "../implementation/src/engine/session.js";
import { generateWords } from "../implementation/src/engine/words.js";
import { internalWordlist } from "../implementation/src/engine/wordlist.js";
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
    // ---------- user-config v1.1.1: closed 24-key set (S-CFG-001 amended) ----------
    {
      const fresh = await app.signup("cfg_fresh24");
      const body = (await app.call("/api/config", { token: fresh })).body;
      const keys = Object.keys(body ?? {}).sort();
      const sealed = Object.keys(SEALED_CONFIG_DEFAULTS).sort();
      check("S-CFG-001", keys.length === 24 && JSON.stringify(keys) === JSON.stringify(sealed),
            `GET presents exactly the 24 sealed keys (n=${keys.length})`);
      // B-CFG-001: every key present, unset keys at the documented sealed defaults
      // (incl. fontSize: 0 — the v1.1.1 PATCH resolution of BQ-IMPL-01).
      check("B-CFG-001", sealed.every((k) => body[k] === SEALED_CONFIG_DEFAULTS[k]) && body.fontSize === 0,
            "all 24 keys at documented defaults (fontSize:0 present)");
      // v1.1.1 fontSize domain: 0 accepted, -1 rejected wholesale (422 + ErrorEnvelope)
      const t2 = await app.signup("cfg_fontsize");
      const ok0 = await app.call("/api/config", { method: "PUT", token: t2, body: { fontSize: 0 } });
      const badNeg = await app.call("/api/config", { method: "PUT", token: t2, body: { fontSize: -1 } });
      const after = await app.call("/api/config", { token: t2 });
      check("S-CFG-001", ok0.status === 200 && badNeg.status === 422 && after.body.fontSize === 0 &&
            cfg.validate("error.schema.json", badNeg.body).ok,
            `fontSize:0 -> ${ok0.status}; fontSize:-1 -> ${badNeg.status} (nothing persisted)`);
      // B-CFG-004: unauthenticated GET/PUT unauthorized (ErrorEnvelope)
      const noGet = await app.call("/api/config", {});
      const noPut = await app.call("/api/config", { method: "PUT", body: { punctuation: true } });
      check("B-CFG-004", noGet.status === 401 && noPut.status === 401 &&
            cfg.validate("error.schema.json", noGet.body).ok && cfg.validate("error.schema.json", noPut.body).ok,
            `GET=${noGet.status} PUT=${noPut.status}`);
    }
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
  // ---------- typing-test-engine v2.0.0 (MAJOR) ----------
  // S-ENG-003 (amended): custom-mode start config fail-closed — positive-integer
  // target + explicit unit (seconds|words); mode enum enforced at construction.
  {
    const refuse = [
      () => new TypingSession({ mode: "custom", mode2: "0", words: ["a"], config: { unit: "seconds" } }),
      () => new TypingSession({ mode: "custom", mode2: "-3", words: ["a"], config: { unit: "words" } }),
      () => new TypingSession({ mode: "custom", mode2: "1.5", words: ["a"], config: { unit: "seconds" } }),
      () => new TypingSession({ mode: "custom", mode2: "10", words: ["a"] }),                   // no unit
      () => new TypingSession({ mode: "custom", mode2: "10", words: ["a"], config: { unit: "minutes" } }),
      () => new TypingSession({ mode: "sideways", mode2: "1", words: ["a"] }),                 // mode enum fail-closed
    ];
    const leaked = refuse.filter((fn) => { try { fn(); return true; } catch { return false; } });
    let acceptOk = true;
    try { new TypingSession({ mode: "custom", mode2: "10", words: ["a"], config: { unit: "seconds" } }); }
    catch { acceptOk = false; }
    check("S-ENG-003", leaked.length === 0 && acceptOk,
          `${refuse.length - leaked.length}/${refuse.length} invalid starts refused; valid custom start ${acceptOk ? "accepted" : "REJECTED"}`);
  }
  // B-ENG-008(g) contract: confidenceMode=true with stopOnError!=off refuses start
  {
    const refused = ["letter", "word"].map((soe) => {
      try {
        new TypingSession({ mode: "words", mode2: "1", words: ["a"], config: { confidenceMode: true, stopOnError: soe } });
        return false;
      } catch { return true; }
    });
    check("B-ENG-008", refused.every(Boolean), "refuse-start on confidenceMode × stopOnError=letter|word");
  }
  // S-ENG-004 (new): wordlist handshake — fail-closed injection; the internal
  // default provider conforms to wordlist.schema.json (plain + decorated).
  {
    const plain = internalWordlist({ language: "english", count: 25, seed: 42 });
    const decorated = internalWordlist({ language: "english", count: 25, seed: 7, punctuation: true, numbers: true });
    check("S-ENG-004",
          eng.validate("wordlist.schema.json", plain).ok && eng.validate("wordlist.schema.json", decorated).ok,
          "internal provider conforms (plain + decorated)");
    const malformed = [null, {}, { language: "" }, { language: "en" }, { language: "en", words: [] },
      { language: "en", words: ["ok", ""] }, { language: "en", words: ["ok"], id: "x".repeat(101) },
      { language: "en", words: ["ok"], ordered: "yes" }];
    const verdicts = malformed.map((wl) =>
      !eng.validate("wordlist.schema.json", wl).ok && // schema rejects
      (() => { try { new TypingSession({ mode: "words", mode2: "1", wordlist: wl }); return false; }
               catch { return true; } })());          // AND refused before the first keystroke
    check("S-ENG-004", verdicts.every(Boolean),
          `${verdicts.filter(Boolean).length}/${malformed.length} non-conforming lists fail-closed (schema + start)`);
    const inj = new TypingSession({ mode: "words", mode2: "2", wordlist: { id: "ext/1", language: "klingon", words: ["qa", "mey"] } });
    check("S-ENG-004", inj.words.join(" ") === "qa mey" && inj.config.language === "klingon",
          "conforming injection starts; provider language adopted");
  }
  // S-ENG-002 (amended schema): keystroke-event conformance incl. navigate +
  // shift optional fields; out-of-contract events rejected by the schema.
  {
    const valid = [
      { t: 0, type: "char", value: "a" },
      { t: 1, type: "char", value: "A", shift: "left" },
      { t: 2, type: "char", value: "B", shift: "right" },
      { t: 3, type: "char", value: "b", shift: "none" },
      { t: 4, type: "backspace" }, { t: 5, type: "space" }, { t: 6, type: "restart" },
      { t: 7, type: "navigate", wordIndex: 0, charIndex: 2 },
    ];
    const invalid = [
      { t: -1, type: "char", value: "a" }, { type: "char", value: "a" },
      { t: 1, type: "char", value: "ab" }, { t: 1, type: "char", value: "a", shift: "middle" },
      { t: 1, type: "teleport" }, { t: 1, type: "navigate", wordIndex: -1, charIndex: 0 },
      { t: 1, type: "char", value: "a", extra: 1 },
    ];
    check("S-ENG-002", valid.every((ev) => eng.validate("keystroke-event.schema.json", ev).ok),
          `${valid.length}/${valid.length} contract events conform (incl. navigate+shift)`);
    check("S-ENG-002", invalid.every((ev) => !eng.validate("keystroke-event.schema.json", ev).ok),
          `${invalid.length}/${invalid.length} out-of-contract shapes rejected by schema`);
    // navigate is admitted under freedomMode and inert otherwise (contract behavior)
    const f = new TypingSession({ mode: "words", mode2: "2", words: ["abc", "def"], config: { freedomMode: true } });
    f.feed(valid[7]);
    const g = new TypingSession({ mode: "words", mode2: "2", words: ["abc", "def"] });
    g.feed(valid[7]);
    check("S-ENG-002", f.wordIndex === 0 && f.caret === 2 && g.wordIndex === 0 && g.caret === 0,
          "navigate applied under freedomMode, inert without");
  }
  // S-ENG-001 (amended) + B-ENG-007 (amended) + B-ENG-010 (new): v2 completion
  // events — custom unit echo, zen bailedOut, min-threshold flag — vs the v2 schema.
  {
    // custom/seconds completes at timer expiry
    const cs = new TypingSession({ mode: "custom", mode2: "5", words: generateWords(50, 3),
                                   config: { unit: "seconds" }, now: () => 0 });
    cs.feed({ t: 0, type: "char", value: "a" });
    cs.feed({ t: 4999, type: "char", value: "b" });
    const notYet = !cs.completed;
    cs.feed({ t: 5000, type: "char", value: "c" });
    const evSecs = cs.completionEvent({ timestamp: 1 });
    check("B-ENG-007",
          notYet && cs.completed && evSecs.mode === "custom" && evSecs.mode2 === "5" &&
          evSecs.unit === "seconds" && evSecs.bailedOut === false,
          "custom/seconds completes at timer expiry; event echoes mode/mode2/unit");
    // custom/words completes on final word commit
    const cw = new TypingSession({ mode: "custom", mode2: "2", words: ["ab", "cd"],
                                   config: { unit: "words" }, now: () => 0 });
    let t = 1000;
    for (const ch of "ab") { cw.feed({ t, type: "char", value: ch }); t += 100; }
    cw.feed({ t, type: "space" }); t += 100;
    const notYet2 = !cw.completed;
    for (const ch of "cd") { cw.feed({ t, type: "char", value: ch }); t += 100; }
    const evWords = cw.completionEvent({ timestamp: 1 });
    check("B-ENG-007", notYet2 && cw.completed && evWords.unit === "words" && evWords.mode2 === "2",
          "custom/words completes on final commit; echoes unit=words");
    // zen never self-completes; manual end emits bailedOut=true
    const z = new TypingSession({ mode: "zen", mode2: "", words: [" ".repeat(30)], now: () => 0 });
    z.feed({ t: 1000, type: "char", value: "z" });
    z.feed({ t: 1100, type: "space" });
    const zenOpen = !z.completed;
    z.bail(1200);
    const evZen = z.completionEvent({ timestamp: 1 });
    check("B-ENG-007", zenOpen && z.completed && evZen.mode === "zen" && evZen.bailedOut === true,
          "zen never self-completes; manual end -> completion event bailedOut=true");
    // decorated custom session under failing min-thresholds
    const dec = new TypingSession({ mode: "custom", mode2: "2",
      words: internalWordlist({ language: "english", count: 2, seed: 5, punctuation: true, numbers: true }).words,
      config: { unit: "words", punctuation: true, numbers: true, minWpm: 100000, minAcc: 100 }, now: () => 0 });
    let t2 = 1000;
    for (const w of dec.words) {
      for (const ch of w) { dec.feed({ t: t2, type: "char", value: ch }); t2 += 100; }
      dec.feed({ t: t2, type: "space" }); t2 += 100;
    }
    const evDec = dec.completionEvent({ timestamp: 1 });
    check("S-ENG-001",
          eng.validate("completed-event.schema.json", evSecs).ok &&
          eng.validate("completed-event.schema.json", evWords).ok &&
          eng.validate("completed-event.schema.json", evZen).ok &&
          eng.validate("completed-event.schema.json", evDec).ok,
          "v2 events (custom/seconds, custom/words, zen, decorated+threshold) conform to v2 schema");
    check("S-ENG-001", !("unit" in evZen) && evDec.unit === "words",
          "unit present only on custom-mode events");
    check("B-ENG-010", evDec.minThresholdFailed === true && evSecs.minThresholdFailed === false,
          "flag set under failing thresholds; clear when disabled (0)");
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
