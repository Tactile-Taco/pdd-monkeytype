// PDD Validator Loop — Layer 1: STRUCTURAL (schema-conformance + contract tests).
// Maps to invariant IDs; emits harness/out/structural.json.
import { loadBundle } from "./schema-loader.mjs";
import { bootApp, makeEvent, SEALED_CONFIG_DEFAULTS, assetWordlist, readWordlistAsset, WORDLIST_ASSETS_DIR } from "./boot.mjs";
import { writeJson } from "./evidence.mjs";
import { TypingSession } from "../implementation/src/engine/session.js";
import { generateWords } from "../implementation/src/engine/words.js";
import { isValidWordlist } from "../implementation/src/engine/wordlist.js";
import { readdirSync } from "node:fs";
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
    // ---------- user-config v1.2.0: closed 37-key set (S-CFG-001 amended) ----------
    {
      const fresh = await app.signup("cfg_fresh37");
      const body = (await app.call("/api/config", { token: fresh })).body;
      const keys = Object.keys(body ?? {}).sort();
      const sealed = Object.keys(SEALED_CONFIG_DEFAULTS).sort();
      check("S-CFG-001", keys.length === 37 && JSON.stringify(keys) === JSON.stringify(sealed),
            `GET presents exactly the 37 sealed keys (n=${keys.length})`);
      // B-CFG-001: every key present, unset keys at the documented sealed defaults
      // (incl. fontSize: 0 — the v1.1.1 PATCH resolution of BQ-IMPL-01).
      check("B-CFG-001", sealed.every((k) => body[k] === SEALED_CONFIG_DEFAULTS[k]) && body.fontSize === 0,
            "all 37 keys at documented defaults (fontSize:0 present)");
      // BQ-CFG-01 (v1.2.0): customThemeId removed pre-consumer — PUT carrying it
      // is an unknown-key rejection (S-CFG-001), and GET never presents it.
      const tOld = await app.signup("cfg_removed_key");
      const rmPut = await app.call("/api/config", { method: "PUT", token: tOld, body: { customThemeId: "theme-42" } });
      check("S-CFG-001", rmPut.status === 422 && cfg.validate("error.schema.json", rmPut.body).ok &&
            !("customThemeId" in (await app.call("/api/config", { token: tOld })).body),
            `customThemeId PUT -> ${rmPut.status} (removed key, intended rejection)`);
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
  // ---------- theme-catalog (v1.0.0, NEW bundle) ----------
  const thm = loadBundle(P("theme-catalog"));
  const ui = loadBundle(P("ui-presentation"));
  {
    const list = await app.call("/api/themes");
    check("S-THM-001", list.status === 200 && thm.validate("theme-catalog.schema.json", list.body).ok,
          JSON.stringify(thm.validate("theme-catalog.schema.json", list.body).errors ?? {}).slice(0, 120));
    // every listed theme retrievable + charter-schema conformant (nine sealed slots)
    const SLOTS = ["--bg", "--main", "--caret", "--sub", "--sub-alt", "--text", "--error", "--error-extra", "--colorful-error"];
    let okAll = true, checked = 0, ev = "";
    for (const { name } of list.body?.themes ?? []) {
      const one = await app.call("/api/themes/" + encodeURIComponent(name));
      checked++;
      const v = ui.validate("theme.schema.json", one.body);
      const slotsOk = SLOTS.every((s) => typeof one.body?.tokens?.[s] === "string");
      if (one.status !== 200 || !v.ok || !slotsOk || one.body?.name !== name) {
        okAll = false; ev = `${name}: status=${one.status} schema=${v.ok} slots=${slotsOk}`;
        if (!v.ok) ev += " " + JSON.stringify(v.errors).slice(0, 140);
        break;
      }
    }
    check("S-THM-001", okAll && checked >= 1, `${checked} themes charter-schema conformant ${ev}`);
    check("S-THM-002", okAll, `nine sealed slots present on every theme (${checked} checked)`);
    const unk = await app.call("/api/themes/definitely-not-a-theme");
    check("S-THM-003", unk.status === 404 && thm.validate("error.schema.json", unk.body).ok,
          `unknown -> ${unk.status} ErrorEnvelope`);
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
  // S-ENG-004 (new): wordlist handshake — fail-closed injection; the shipped
  // wordlists-asset provider conforms to wordlist.schema.json (plain + decorated).
  // ADV-W2-01: migrated from the retired internal provider to the wordlists
  // bundle's english asset (the list the server now serves).
  {
    const plain = assetWordlist({ language: "english", count: 25, seed: 42 });
    const decorated = assetWordlist({ language: "english", count: 25, seed: 7, punctuation: true, numbers: true });
    check("S-ENG-004",
          eng.validate("wordlist.schema.json", plain).ok && eng.validate("wordlist.schema.json", decorated).ok,
          "asset provider conforms (plain + decorated)");
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
      words: assetWordlist({ language: "english", count: 2, seed: 5, punctuation: true, numbers: true }).words,
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

  // ==================== wave-2 bundles (stage-3 extension) ====================
  // ---------- test-results v1.2.0 (bundle loader `res` reused from the v1 block) ----------
  const tRes = await app.signup("w2s_res");
  {
    // S-RES-001/S-RES-003: invalid submission -> 422 ErrorEnvelope; nothing stored
    const before = (await app.call("/api/results", { token: tRes })).body.results.length;
    const badSub = await app.call("/api/results", { method: "POST", token: tRes, body: { wpm: "fast" } });
    const afterBad = (await app.call("/api/results", { token: tRes })).body.results.length;
    check("S-RES-001", badSub.status === 422 && res.validate("error.schema.json", badSub.body).ok && before === afterBad,
          `invalid submission 422 envelope; stored count unchanged (${before})`);
    // S-RES-002 (amended): stored record conforms incl. v1.2.0 tags:[] + recorded anticheat
    const okSub = await app.call("/api/results", { method: "POST", token: tRes, body: makeEvent({ wpm: 91.5 }) });
    check("S-RES-002", okSub.status === 201, `store status=${okSub.status}`);
    const hist0 = (await app.call("/api/results", { token: tRes })).body.results;
    const rec0 = hist0.find((r) => r.wpm === 91.5);
    const v0 = res.validate("stored-result.schema.json", rec0 ?? {});
    check("S-RES-002", !!rec0 && v0.ok && Array.isArray(rec0.tags) && rec0.tags.length === 0 &&
          rec0.anticheat?.decision === "admit",
          JSON.stringify(v0.errors).slice(0, 160) || "conforms (tags:[], anticheat recorded)");
    // B-RES-001 (amended): zen admitted (anticheat admit) but NOT persisted —
    // 200 + stored:false; repeated zen submissions never create records.
    const zenBody = () => makeEvent({ mode: "zen", mode2: "", bailedOut: true });
    const z1 = await app.call("/api/results", { method: "POST", token: tRes, body: zenBody() });
    const z2 = await app.call("/api/results", { method: "POST", token: tRes, body: zenBody() });
    const z3 = await app.call("/api/results", { method: "POST", token: tRes, body: zenBody() });
    const histZen = (await app.call("/api/results", { token: tRes })).body.results;
    check("B-RES-001",
          [z1, z2, z3].every((z) => z.status === 200 && z.body?.stored === false && z.body?.verdict === "admit") &&
          histZen.length === hist0.length && histZen.every((r) => r.mode !== "zen"),
          `3 zen submissions -> 200 {verdict:admit, stored:false}; history count ${hist0.length}->${histZen.length}, no mode=zen`);
    // B-RES-001: anticheat-rejected submission -> 422 with reasons; never persisted
    const rej = await app.call("/api/results", { method: "POST", token: tRes, body: makeEvent({ wpm: 9000 }) });
    const histRej = (await app.call("/api/results", { token: tRes })).body.results;
    check("B-RES-001", rej.status === 422 && res.validate("error.schema.json", rej.body).ok &&
          histRej.length === hist0.length,
          `rejected (wpm_bound) -> 422; stored count unchanged (${histRej.length})`);
  }
  {
    // B-RES-003 (amended): minThresholdFailed exclusion truth table — stored and
    // visible in history, never isPb, excluded from PB reads, no demotion.
    const tF = await app.signup("w2s_flag");
    const flagged = await app.call("/api/results", { method: "POST", token: tF,
      body: makeEvent({ wpm: 200, minThresholdFailed: true, timestamp: 1752000001000 }) });
    const pbs1 = (await app.call("/api/results/pbs", { token: tF })).body.pbs;
    const clean = await app.call("/api/results", { method: "POST", token: tF,
      body: makeEvent({ wpm: 100, timestamp: 1752000002000 }) });
    const flagged2 = await app.call("/api/results", { method: "POST", token: tF,
      body: makeEvent({ wpm: 250, minThresholdFailed: true, timestamp: 1752000003000 }) });
    const pbs2 = (await app.call("/api/results/pbs", { token: tF })).body.pbs;
    const histF = (await app.call("/api/results", { token: tF })).body.results;
    check("B-RES-003",
          flagged.status === 201 && flagged.body.isPb === false && pbs1.length === 0 &&
          clean.status === 201 && clean.body.isPb === true &&
          flagged2.status === 201 && flagged2.body.isPb === false &&
          pbs2.length === 1 && pbs2[0].wpm === 100 &&
          histF.length === 3 && histF.filter((r) => r.minThresholdFailed).length === 2,
          "flagged 200/250 stored+visible, never PB; clean 100 is the only PB");
    // B-RES-006 (composite) — contract level; exhaustive properties in behavioral.
    const mkTag = async (tok, name) => app.call("/api/results/tags", { method: "POST", token: tok, body: { name } });
    const tagA = await mkTag(tRes, "Fast");
    const vTag = res.validate("tag.schema.json", tagA.body ?? {});
    check("B-RES-006", tagA.status === 201 && vTag.ok && Object.keys(tagA.body).sort().join(",") === "id,name",
          `tag created; exactly {id,name} (${JSON.stringify(vTag.errors).slice(0, 80) || "schema ok"})`);
    const dup = await mkTag(tRes, "fast");       // case-insensitive uniqueness
    const empty = await mkTag(tRes, "");
    check("B-RES-006", dup.status === 409 && empty.status === 422 &&
          res.validate("error.schema.json", dup.body).ok, "case-insensitive dup 409; empty name 422");
    const tagB = await mkTag(tRes, "Other");
    const ren = await app.call(`/api/results/tags/${tagA.body.id}`, { method: "PATCH", token: tRes, body: { name: "Faster" } });
    const clash = await app.call(`/api/results/tags/${tagB.body.id}`, { method: "PATCH", token: tRes, body: { name: "faster" } });
    check("B-RES-006", ren.status === 200 && ren.body.name === "Faster" && clash.status === 409, "rename ok; rename clash 409");
    // foreign indistinguishability (b): second user cannot see/act on tRes's tag
    const tX = await app.signup("w2s_other");
    const fPatch = await app.call(`/api/results/tags/${tagA.body.id}`, { method: "PATCH", token: tX, body: { name: "hijack" } });
    const fDel = await app.call(`/api/results/tags/${tagA.body.id}`, { method: "DELETE", token: tX });
    check("B-RES-006", fPatch.status === 404 && fDel.status === 404, "foreign tag patch/delete -> 404 (indistinguishable)");
    // assignment (b): own result + own tag; unknown/foreign -> 404
    const rid = (await app.call("/api/results", { token: tRes })).body.results.find((r) => r.wpm === 91.5).id;
    const asg = await app.call(`/api/results/${rid}/tags`, { method: "POST", token: tRes, body: { tagId: tagA.body.id } });
    const asgBadBody = await app.call(`/api/results/${rid}/tags`, { method: "POST", token: tRes, body: {} });
    const asgForeign = await app.call(`/api/results/${rid}/tags`, { method: "POST", token: tX, body: { tagId: tagA.body.id } });
    check("B-RES-006", asg.status === 200 && asg.body.tags.includes(tagA.body.id) &&
          asgBadBody.status === 422 && asgForeign.status === 404,
          "assign 200 (tag id on result); malformed 422; foreign result 404");
    // filter (c): multi-tag = intersection (contract spot; property in behavioral)
    const sub2 = await app.call("/api/results", { method: "POST", token: tRes, body: makeEvent({ wpm: 55, timestamp: 1752000004000 }) });
    await app.call(`/api/results/${sub2.body.id}/tags`, { method: "POST", token: tRes, body: { tagId: tagB.body.id } });
    const both = await app.call(`/api/results?tags=${tagA.body.id},${tagB.body.id}`, { token: tRes });
    const onlyA = await app.call(`/api/results?tags=${tagA.body.id}`, { token: tRes });
    check("B-RES-006", both.status === 200 && both.body.results.length === 0 &&
          onlyA.body.results.length === 1 && onlyA.body.results[0].id === rid,
          "intersection: A,B -> 0 results; A -> exactly the tagged one");
    // (e) tag-scoped PB read — 200; stored isPb flags untouched by the scoped read
    await app.call(`/api/results/${sub2.body.id}/tags`, { method: "POST", token: tRes, body: { tagId: tagA.body.id } });
    const pbsBefore = (await app.call("/api/results/pbs", { token: tRes })).body.pbs.map((r) => [r.id, r.isPb]);
    const scoped = await app.call(`/api/results/pbs?tags=${tagA.body.id}`, { token: tRes });
    const pbsAfter = (await app.call("/api/results/pbs", { token: tRes })).body.pbs.map((r) => [r.id, r.isPb]);
    check("B-RES-006", scoped.status === 200 && Array.isArray(scoped.body.pbs) &&
          JSON.stringify(pbsBefore) === JSON.stringify(pbsAfter),
          `scoped PB read 200 (${scoped.body.pbs.length} entries); global isPb flags unchanged`);
    // (d) delete-cascade: tag removed from every result; results unaffected
    const cntBefore = (await app.call("/api/results", { token: tRes })).body.results.length;
    const del = await app.call(`/api/results/tags/${tagA.body.id}`, { method: "DELETE", token: tRes });
    const histDel = (await app.call("/api/results", { token: tRes })).body.results;
    check("B-RES-006", del.status === 200 && histDel.length === cntBefore &&
          histDel.every((r) => !(r.tags ?? []).includes(tagA.body.id)),
          `delete-cascade: tag gone from ${cntBefore} results; results intact`);
  }

  // ---------- result-stats v1.0.0 (NEW bundle) ----------
  const sts = loadBundle(P("result-stats"));
  {
    // S-STS-003: auth before computation on all four reads; S-STS-002 envelopes.
    // Route URLs are a delegated surface (the bundle seals handshake schemas, not
    // paths); the candidate serves the pb-table handshake at /api/stats/pbs.
    const routes = ["aggregates", "pbs", "wpm-series", "activity"];
    const un = await Promise.all(routes.map((r) => app.call("/api/stats/" + r, {})));
    check("S-STS-003", un.every((u) => u.status === 401 && sts.validate("error.schema.json", u.body).ok),
          "all four reads 401 + ErrorEnvelope unauthenticated");
    // S-STS-001: every read response conforms to its handshake schema
    const tS = await app.signup("w2s_sts");
    await app.call("/api/results", { method: "POST", token: tS, body: makeEvent({ wpm: 88, timestamp: 1752000000000 }) });
    await app.call("/api/results", { method: "POST", token: tS,
      body: makeEvent({ mode: "words", mode2: "10", wpm: 76, testDuration: 8, timestamp: 1752000100000 }) });
    const payloads = await Promise.all(routes.map((r) => app.call("/api/stats/" + r, { token: tS })));
    const names = { aggregates: "aggregates.schema.json", pbs: "pb-table.schema.json",
                    "wpm-series": "wpm-series.schema.json", activity: "activity.schema.json" };
    const oks = payloads.map((p, i) => p.status === 200 && sts.validate(names[routes[i]], p.body).ok);
    check("S-STS-001", oks.every(Boolean),
          routes.map((r, i) => `${r}:${oks[i] ? "ok" : JSON.stringify(sts.validate(names[r], payloads[i].body).errors).slice(0, 60)}`).join(" "));
  }

  // ---------- wordlists v1.0.0 (NEW bundle) ----------
  const wlb = loadBundle(P("wordlists"));
  {
    const reg = await app.call("/wordlists/registry.json"); // public: no token
    const vReg = wlb.validate("language-registry.schema.json", reg.body ?? {});
    check("S-WL-002", reg.status === 200 && vReg.ok, JSON.stringify(vReg.errors).slice(0, 120) || "registry conforms");
    const lists = reg.body?.lists ?? [];
    // S-WL-001: every asset conforms to the engine's wordlist handshake schema;
    // closure: language field equals the entry id (S-WL-002).
    const assetOks = [];
    for (const e of lists) {
      const a = await app.call(`/wordlists/${e.id}.json`);
      assetOks.push(a.status === 200 && eng.validate("wordlist.schema.json", a.body).ok &&
                    a.body.language === e.id && a.body.words.length > 0);
    }
    check("S-WL-001", assetOks.every(Boolean),
          `${assetOks.filter(Boolean).length}/${lists.length} assets conform to the S-ENG-004 handshake schema`);
    // referential closure, both directions, over the shipped catalog dir
    const files = readdirSync(WORDLIST_ASSETS_DIR).filter((f) => f.endsWith(".json") && f !== "registry.json")
      .map((f) => f.replace(/\.json$/, ""));
    check("S-WL-002", lists.length >= 1 &&
          lists.every((e) => files.includes(e.id)) && files.every((f) => lists.some((e) => e.id === f)),
          `closure: ${lists.length} entries <-> ${files.length} assets, no dead entries, no orphans`);
    // S-WL-003: same-origin static, public reads (all fetches above tokenless),
    // failures return the ErrorEnvelope
    const miss = await app.call("/wordlists/__missing__.json");
    check("S-WL-003", miss.status === 404 && wlb.validate("error.schema.json", miss.body).ok,
          `unknown asset -> 404 ErrorEnvelope (status=${miss.status})`);
    // engine consumes the shipped asset through the handshake (S-ENG-004 x S-WL-001):
    // an asset-sourced list starts a session and the provider language is adopted.
    const fromAsset = assetWordlist({ language: "spanish", count: 3, seed: 11 });
    const sAsset = new TypingSession({ mode: "words", mode2: "3", wordlist: fromAsset });
    check("S-ENG-004", sAsset.words.length === 3 && sAsset.config.language === "spanish" &&
          isValidWordlist(readWordlistAsset("spanish")),
          "engine starts from a wordlists-bundle asset (spanish); handshake valid");
  }

  // ---------- quote-library v1.1.0 (bundle loader `qt` reused) ----------
  const tQ = await app.signup("w2s_qt");
  {
    const rnd = await app.call("/api/quotes/random");
    const vQ = qt.validate("quote.schema.json", rnd.body ?? {});
    check("S-QT-001", rnd.status === 200 && vQ.ok && rnd.body.state === "approved" && rnd.body.approved === true &&
          rnd.body.length === rnd.body.text.length && Number.isInteger(rnd.body.group) && rnd.body.group >= 0 && rnd.body.group <= 3,
          JSON.stringify(vQ.errors).slice(0, 100) || "random fetch conforms; approved<=>state; length/group derived");
    const list = await app.call("/api/quotes");
    const itemsOk = (list.body?.quotes ?? []).every((q) => qt.validate("quote.schema.json", q).ok);
    check("S-QT-001", list.status === 200 && itemsOk && list.body.pageSize === 50 && list.body.page === 0 &&
          typeof list.body.total === "number",
          `search page conforms (${list.body?.quotes?.length} items, total=${list.body?.total})`);
    // S-QT-002: failure envelopes across the v1.1.0 surface
    const badFav = await app.call("/api/quotes/favorites", { method: "POST", token: tQ, body: { quoteId: "q1", extra: 1 } });
    const noFav = await app.call("/api/quotes/favorites", {});
    const badRate = await app.call("/api/quotes/q1/rate", { method: "POST", token: tQ, body: { rating: 6 } });
    const missRate = await app.call("/api/quotes/nope/rate", { method: "POST", token: tQ, body: { rating: 5 } });
    const badSub = await app.call("/api/quotes", { method: "POST", token: tQ, body: { text: "", source: "x", language: "english" } });
    check("S-QT-002",
          [badFav, badRate, badSub].every((r) => r.status === 422) && missRate.status === 404 && noFav.status === 401 &&
          [badFav, badRate, badSub, missRate, noFav].every((r) => qt.validate("error.schema.json", r.body).ok),
          "favorite 422 (extra key), rate 422 (range) + 404 (unknown), submit 422, unauth 401 — all ErrorEnvelope");
    // B-QT-006(a) on the write path: a fresh submission is pending with approved=false
    const sub = await app.call("/api/quotes", { method: "POST", token: tQ,
      body: { text: "Structural wave two pending quote specimen.", source: "harness", language: "english" } });
    check("B-QT-006", sub.status === 201 && sub.body.state === "pending" && sub.body.approved === false &&
          qt.validate("quote.schema.json", sub.body).ok, "submit -> pending, approved=false (tri-state consistent)");
  }

  // ---------- leaderboards v1.1.0 (bundle loader `lb` reused) ----------
  {
    // fixture: one user with a clean 100 and a flagged 200 on time/15/english
    const tL = await app.signup("w2s_lb");
    await app.call("/api/results", { method: "POST", token: tL, body: makeEvent({ wpm: 100, timestamp: Date.now() - 60000 }) });
    await app.call("/api/results", { method: "POST", token: tL,
      body: makeEvent({ wpm: 200, minThresholdFailed: true, timestamp: Date.now() - 30000 }) });
    const board = await app.call("/api/leaderboards/15");
    const vB = lb.validate("leaderboard.schema.json", board.body ?? {});
    check("S-LB-001", board.status === 200 && vB.ok &&
          board.body.board.mode === "time" && board.body.board.mode2 === "15" &&
          board.body.board.timeWindow === "alltime",
          JSON.stringify(vB.errors).slice(0, 120) || "board conforms; key echoed (time/15/english/alltime)");
    const mine = (board.body.entries ?? []).filter((e) => e.name === "w2s_lb");
    check("B-LB-001", mine.length === 1 && mine[0].wpm === 100,
          `flagged 200 excluded; user contributes exactly one entry (best eligible wpm=${mine[0]?.wpm})`);
    const daily = await app.call("/api/leaderboards/15?timeWindow=daily&language=spanish");
    check("S-LB-001", daily.status === 200 && lb.validate("leaderboard.schema.json", daily.body).ok &&
          daily.body.board.language === "spanish" && daily.body.board.timeWindow === "daily",
          "registry language + daily window accepted (spanish/daily board)");
    // S-LB-002 / S-LB-001: unknown board keys -> 404 ErrorEnvelope
    const b30 = await app.call("/api/leaderboards/30");
    const bKlingon = await app.call("/api/leaderboards/15?language=klingon");
    const bWeekly = await app.call("/api/leaderboards/15?timeWindow=weekly");
    check("S-LB-001", [b30, bKlingon, bWeekly].every((b) => b.status === 404 && lb.validate("error.schema.json", b.body).ok),
          "mode2=30 / language=klingon / timeWindow=weekly -> 404 ErrorEnvelope");
  }

  // ==================== wave-3 bundles (stage-3 extension) ====================
  // ---------- user-profile v1.0.0 (NEW bundle) ----------
  const pro = loadBundle(P("user-profile"));
  const tP = await app.signup("w3s_pro");
  {
    // S-PRO-001: own read conforms to profile.schema.json (fresh user at
    // defaults: empty publicFields, xp 0, level 0, streaks 0/0)
    await app.call("/api/results", { method: "POST", token: tP, body: makeEvent({ wpm: 85, timestamp: 1753000000000 }) });
    const own = await app.call("/api/profile", { token: tP });
    const vP = pro.validate("profile.schema.json", own.body ?? {});
    check("S-PRO-001", own.status === 200 && vP.ok, JSON.stringify(vP.errors).slice(0, 140) || "own profile conforms");
    // pass-throughs delivered EXACTLY as the source handshakes produce them
    const pbsSrc = (await app.call("/api/stats/pbs", { token: tP })).body;
    const aggSrc = (await app.call("/api/stats/aggregates", { token: tP })).body;
    check("S-PRO-001", JSON.stringify(own.body.pbs) === JSON.stringify(pbsSrc) &&
          JSON.stringify(own.body.aggregates) === JSON.stringify(aggSrc),
          "pbs/aggregates pass-through identical to result-stats handshakes");
    const fresh = await app.signup("w3s_fresh");
    const freshProf = (await app.call("/api/profile", { token: fresh })).body;
    check("S-PRO-001", freshProf.xp === 0 && freshProf.level === 0 &&
          JSON.stringify(freshProf.streaks) === '{"current":0,"max":0}' &&
          JSON.stringify(freshProf.publicFields) === '{"bio":"","avatarUrl":"","socials":{}}',
          "fresh user: derived defaults (xp 0, level 0, streaks 0/0, empty publicFields)");
    // S-PRO-002: failure envelopes
    const unauthGet = await app.call("/api/profile", {});
    const unauthPatch = await app.call("/api/profile", { method: "PATCH", body: { bio: "x" } });
    const unknownPub = await app.call("/api/profile/no-such-user-w3");
    check("S-PRO-002", [unauthGet, unauthPatch].every((r) => r.status === 401) && unknownPub.status === 404 &&
          [unauthGet, unauthPatch, unknownPub].every((r) => pro.validate("error.schema.json", r.body).ok),
          "401 unauth read/edit; 404 unknown public name — all ErrorEnvelope");
    // S-PRO-003: edits authed + closed shape (profile-update.schema.json);
    // harness-side schema validation mirrors the server's accept/reject
    const okBody = { bio: "hi", avatarUrl: "https://cdn.example.com/a.png",
                     socials: { website: "https://me.example.com", twitter: "@t", github: "g" }, isPublic: true };
    const badBodies = [{}, { role: "admin" }, { bio: "x".repeat(501) }, { avatarUrl: "http://insecure.example.com" },
                       { socials: { mastodon: "@x" } }, { isPublic: "yes" }, { socials: { website: "http://nope" } }];
    check("S-PRO-003", pro.validate("profile-update.schema.json", okBody).ok &&
          badBodies.every((b) => !pro.validate("profile-update.schema.json", b).ok),
          `schema mirror: 1 valid + ${badBodies.length} invalid bodies classified`);
    const okPatch = await app.call("/api/profile", { method: "PATCH", token: tP, body: okBody });
    const badResults = [];
    for (const b of badBodies) {
      badResults.push(await app.call("/api/profile", { method: "PATCH", token: tP, body: b }));
    }
    check("S-PRO-003", okPatch.status === 200 && okPatch.body.publicFields.bio === "hi" &&
          badResults.every((r) => r.status === 422 && pro.validate("error.schema.json", r.body).ok),
          `valid patch 200 applied; ${badBodies.length} closed-shape violations 422 envelope`);
  }

  // ---------- public-api v1.0.0 (NEW bundle) ----------
  const api = loadBundle(P("public-api"));
  const tA = await app.signup("w3s_api");
  {
    // S-API-001: create request schema mirror + served metadata conformance
    const goodCreate = { name: "ci", scopes: ["results:read", "stats:read"] };
    const badCreates = [{ scopes: ["results:read"] }, { name: "x" }, { name: "x", scopes: [] },
                        { name: "x", scopes: ["results:write"] }, { name: "x", scopes: ["results:read"], extra: 1 }];
    check("S-API-001", api.validate("apekey-create-request.schema.json", goodCreate).ok &&
          badCreates.every((b) => !api.validate("apekey-create-request.schema.json", b).ok),
          "create-request schema mirror: valid accepted, unknown scopes/keys rejected");
    const created = await app.call("/api/apekeys", { method: "POST", token: tA, body: goodCreate });
    const vKey = api.validate("apekey.schema.json", created.body?.apekey ?? {});
    check("S-API-001", created.status === 201 && vKey.ok &&
          !("hash" in created.body.apekey) && !("salt" in created.body.apekey) && !("uid" in created.body.apekey),
          `key created; metadata conforms (no key material/uid) ${JSON.stringify(vKey.errors).slice(0, 80)}`);
    const bad = await app.call("/api/apekeys", { method: "POST", token: tA, body: badCreates[3] });
    const list = await app.call("/api/apekeys", { token: tA });
    check("S-API-001", bad.status === 422 && api.validate("error.schema.json", bad.body).ok &&
          list.body.apekeys.every((k) => api.validate("apekey.schema.json", k).ok),
          "unknown scope 422 envelope; list metadata conforms");
    const key = created.body.key;
    // S-API-002: 401/403/404 envelopes on the API surface
    const noKey = await app.call("/api/public/results");
    const badKey = await app.call("/api/public/results", { token: "pdd_" + "0".repeat(32) });
    const noRoute = await app.call("/api/public/nope", { token: key });
    check("S-API-002", noKey.status === 401 && badKey.status === 401 && noRoute.status === 404 &&
          [noKey, badKey, noRoute].every((r) => api.validate("error.schema.json", r.body).ok),
          "401 no/bad key; 404 unknown route — all ErrorEnvelope");
    const narrow = await app.call("/api/apekeys", { method: "POST", token: tA, body: { name: "n", scopes: ["profile:read"] } });
    const forbidden = await app.call("/api/public/results", { token: narrow.body.key });
    check("S-API-002", forbidden.status === 403 && api.validate("error.schema.json", forbidden.body).ok,
          "403 out-of-scope envelope");
    // S-API-003: mirrored payloads conform to the SOURCE bundles' sealed schemas
    await app.call("/api/results", { method: "POST", token: tA, body: makeEvent({ wpm: 95, timestamp: 1753000000000 }) });
    const fullKey = (await app.call("/api/apekeys", { method: "POST", token: tA,
      body: { name: "full", scopes: ["results:read", "stats:read", "profile:read", "quotes:read"] } })).body.key;
    const mResults = await app.call("/api/public/results", { token: fullKey });
    const itemOk = (mResults.body?.results ?? []).every((r) => res.validate("stored-result.schema.json", r).ok);
    check("S-API-003", mResults.status === 200 && itemOk && Array.isArray(mResults.body.results),
          "mirror /results items conform to test-results stored-result schema");
    const statSchemas = { aggregates: "aggregates.schema.json", pbs: "pb-table.schema.json",
                          activity: "activity.schema.json", "wpm-series": "wpm-series.schema.json" };
    const statOks = [];
    for (const [route, schema] of Object.entries(statSchemas)) {
      const r = await app.call("/api/public/stats/" + route, { token: fullKey });
      statOks.push(r.status === 200 && sts.validate(schema, r.body).ok);
    }
    check("S-API-003", statOks.every(Boolean), `mirror /stats x4 conform to result-stats schemas (${statOks})`);
    const mProf = await app.call("/api/public/profile", { token: fullKey });
    const mQuotes = await app.call("/api/public/quotes?language=english", { token: fullKey });
    const mRandom = await app.call("/api/public/quotes/random?seed=5", { token: fullKey });
    check("S-API-003", mProf.status === 200 && pro.validate("profile.schema.json", mProf.body).ok &&
          mQuotes.status === 200 && (mQuotes.body.quotes ?? []).every((q) => qt.validate("quote.schema.json", q).ok) &&
          mRandom.status === 200 && qt.validate("quote.schema.json", mRandom.body).ok,
          "mirror /profile + /quotes(+random) conform to user-profile/quote-library schemas");
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
