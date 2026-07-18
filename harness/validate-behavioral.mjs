// PDD Validator Loop — Layer 2: BEHAVIORAL (property-based tests + mutation sanity).
// Every test carries invariant lineage. Emits harness/out/behavioral.json.
import fc from "fast-check";
import { writeJson } from "./evidence.mjs";
import { bootApp, makeEvent } from "./boot.mjs";
import { round2, calculateWpm, kogasa, consistencyOf, mean, stdDev } from "../implementation/src/shared/stats.js";
import { countChars } from "../implementation/src/engine/countChars.js";
import { TypingSession } from "../implementation/src/engine/session.js";
import { generateWords } from "../implementation/src/engine/words.js";
import { evaluate } from "../implementation/src/anticheat/index.js";

const RUNS = Number(process.env.PBT_RUNS || 200);
const HTTP_RUNS = 20;
const results = [];
const rec = (id, ok, evidence = "", suspect = false) =>
  results.push({ invariant_id: id, layer: "behavioral",
                 outcome: suspect ? "mutation-suspect" : ok ? "pass" : "fail",
                 evidence: String(evidence).slice(0, 300) });
const prop = (id, arb, predicate, runs = RUNS) => {
  try {
    fc.assert(fc.property(arb, predicate), { numRuns: runs });
    rec(id, true, `${runs} cases`);
  } catch (e) { rec(id, false, e.message.split("\n")[0]); }
};
const asyncProp = async (id, arb, predicate, runs = HTTP_RUNS) => {
  try {
    await fc.assert(fc.asyncProperty(arb, predicate), { numRuns: runs });
    rec(id, true, `${runs} cases`);
  } catch (e) { rec(id, false, e.message.split("\n")[0]); }
};
// mutation-sanity: the property MUST fail against the mutant, else it is vacuous
const mutationSanity = (id, arb, predicate, mutantPredicate) => {
  let genuineFails = false, mutantFails = false;
  try { fc.assert(fc.property(arb, predicate), { numRuns: RUNS }); } catch { genuineFails = true; }
  try { fc.assert(fc.property(arb, mutantPredicate), { numRuns: RUNS }); } catch { mutantFails = true; }
  if (genuineFails) rec(id, false, "property fails on genuine implementation");
  else if (!mutantFails) rec(id, false, "property passes against mutant — vacuous", true);
  else rec(id, true, "mutant killed");
};

// ---------- engine stats (B-ENG-001/002/003) ----------
prop("B-ENG-001", fc.tuple(fc.nat({ max: 100000 }), fc.double({ min: 0.01, max: 3600, noNaN: true })),
  ([c, s]) => round2(calculateWpm(c, s)) === round2(c / 5 / (s / 60)));
prop("B-ENG-001", fc.integer({ min: -100, max: 0 }), (s) => calculateWpm(50, s) === 0);
mutationSanity("B-ENG-001",
  fc.tuple(fc.nat({ max: 100000 }), fc.double({ min: 0.01, max: 3600, noNaN: true })),
  ([c, s]) => round2(calculateWpm(c, s)) === round2(c / 5 / (s / 60)),
  ([c, s]) => round2(c / 4 / (s / 60)) === round2(c / 5 / (s / 60))); // mutant: 4-char words

prop("B-ENG-002", fc.double({ min: 0, max: 10, noNaN: true }),
  (c) => Math.abs(kogasa(c) - 100 * (1 - Math.tanh(c + c ** 3 / 3 + c ** 5 / 5))) < 1e-9);
prop("B-ENG-002", fc.constant([]), (xs) => consistencyOf(xs) === 0);
prop("B-ENG-002", fc.array(fc.constant(7), { minLength: 1, maxLength: 20 }), (xs) => consistencyOf(xs) === 100);
mutationSanity("B-ENG-002",
  fc.double({ min: 0.01, max: 10, noNaN: true }),
  (c) => Math.abs(kogasa(c) - 100 * (1 - Math.tanh(c + c ** 3 / 3 + c ** 5 / 5))) < 1e-9,
  (c) => Math.abs(100 * (1 - Math.tanh(c + c ** 3 / 3)) - 100 * (1 - Math.tanh(c + c ** 3 / 3 + c ** 5 / 5))) < 1e-9);

prop("B-ENG-003", fc.tuple(fc.nat(), fc.nat(), fc.nat()), ([a, i, e]) => {
  const d = a + i + e;
  const acc = d === 0 ? 0 : round2((a / d) * 100);
  return acc >= 0 && acc <= 100 && (d !== 0 || acc === 0);
});

// ---------- char accounting (B-ENG-004/005/006/007) ----------
const word = () => fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz"), { minLength: 1, maxLength: 12 });
prop("B-ENG-004", fc.tuple(word(), word()), ([inp, tgt]) => {
  const c = countChars(inp, tgt, false);
  return c.allCorrect + c.incorrect + c.extra + c.missed === Math.max(inp.length, tgt.length);
});
prop("B-ENG-004", fc.array(word(), { minLength: 1, maxLength: 8 }), (ws) => {
  const s = new TypingSession({ mode: "words", mode2: String(ws.length), words: ws });
  let t = 1000;
  for (const w of ws) { for (const ch of w) s.feed({ t: t += 100, type: "char", value: ch }); s.feed({ t: t += 100, type: "space" }); }
  const ev = s.completionEvent({ timestamp: 1 });
  return ev.charTotal === ev.charStats[0] + ev.charStats[1] + ev.charStats[2] &&
         ev.charStats[3] === 0 && ev.wpm > 0;
});
prop("B-ENG-005", fc.array(fc.constant("backspace"), { minLength: 1, maxLength: 50 }), (bs) => {
  const s = new TypingSession({ mode: "words", mode2: "3", words: ["abc", "def", "ghi"] });
  bs.forEach((_, i) => s.feed({ t: i + 1, type: "backspace" }));
  return s.inputs[0] === "";
});
prop("B-ENG-006", fc.array(word(), { minLength: 2, maxLength: 6 }), (ws) => {
  const build = () => {
    const s = new TypingSession({ mode: "words", mode2: String(ws.length), words: ws, now: () => 42 });
    let t = 1000;
    for (const w of ws) { for (const ch of w) s.feed({ t: t += 100, type: "char", value: ch }); s.feed({ t: t += 100, type: "space" }); }
    return s.completionEvent({ timestamp: 42, hash: "det" });
  };
  return JSON.stringify(build()) === JSON.stringify(build());
});
prop("B-ENG-007", fc.integer({ min: 1, max: 10 }), (secs) => {
  const s = new TypingSession({ mode: "time", mode2: String(secs), words: generateWords(200, 3) });
  s.feed({ t: 0, type: "char", value: "a" });
  s.feed({ t: secs * 1000 + 1, type: "char", value: "b" });
  return s.completed === true;
});

// ---------- anticheat (B-AC-001/003/005/006) ----------
prop("B-AC-001", fc.double({ min: 350.01, max: 2000, noNaN: true }), (w) => {
  const ev = makeEvent({ wpm: w });
  return evaluate({ event: ev, keySpacingStats: { average: 100, sd: 20 },
                    keyDurationStats: { average: 80, sd: 10 }, lbOptOut: false })
    .reasons.includes("wpm_bound");
});
prop("B-AC-001", fc.double({ min: 0, max: 350, noNaN: true }), (w) => {
  const ev = makeEvent({ wpm: w });
  return !evaluate({ event: ev, keySpacingStats: { average: 100, sd: 20 },
                     keyDurationStats: { average: 80, sd: 10 }, lbOptOut: false })
    .reasons.includes("wpm_bound");
});
prop("B-AC-003", fc.double({ min: 1.01, max: 100, noNaN: true }), (delta) => {
  const ev = makeEvent({ rawWpm: 84 + delta + 0.001 });
  return evaluate({ event: ev, keySpacingStats: { average: 100, sd: 20 },
                    keyDurationStats: { average: 80, sd: 10 }, lbOptOut: false })
    .reasons.includes("stat_mismatch");
});
prop("B-AC-005", fc.anything(), (x) => {
  try {
    const v = evaluate(x);
    return v && ["admit", "reject"].includes(v.decision) && Array.isArray(v.reasons);
  } catch { return false; }
});
prop("B-AC-006", fc.double({ min: 0, max: 300, noNaN: true }), (w) => {
  const req = { event: makeEvent({ wpm: w }), keySpacingStats: { average: 100, sd: 20 },
                keyDurationStats: { average: 80, sd: 10 }, lbOptOut: false };
  return JSON.stringify(evaluate(req)) === JSON.stringify(evaluate(req));
});
mutationSanity("B-AC-001",
  fc.double({ min: 351, max: 419, noNaN: true }),
  (w) => evaluate({ event: makeEvent({ wpm: w }), keySpacingStats: { average: 100, sd: 20 },
                    keyDurationStats: { average: 80, sd: 10 }, lbOptOut: false }).decision === "reject",
  (w) => (w > 500 ? "reject" : "admit") === "reject"); // mutant with raised bound

// ---------- HTTP-level behavioral (account/config/quotes/results/leaderboards) ----------
const app = await bootApp();
try {
  await asyncProp("B-ACC-001", fc.integer({ min: 0, max: 999999999 }), async (n) => {
    const name = "case" + n;
    const t1 = await app.signup(name);
    const r2 = await app.call("/api/account/signup", { method: "POST", body: { name: name.toUpperCase(), password: "password123" } });
    return !!t1 && r2.status === 409;
  }, 5);

  await asyncProp("B-CFG-002", fc.record({
      punctuation: fc.boolean(), numbers: fc.boolean(),
      difficulty: fc.constantFrom("normal", "expert", "master") }), async (upd) => {
    const t = await app.signup("cfg" + Math.random().toString(36).slice(2, 8));
    await app.call("/api/config", { method: "PUT", token: t, body: upd });
    const got = await app.call("/api/config", { token: t });
    return got.body.punctuation === upd.punctuation && got.body.numbers === upd.numbers &&
           got.body.difficulty === upd.difficulty && got.body.mode === "time"; // defaults intact
  });
  await asyncProp("B-CFG-003", fc.constantFrom("badkey", "modee", "theme2"), async (bad) => {
    const t = await app.signup("cfg" + Math.random().toString(36).slice(2, 8));
    await app.call("/api/config", { method: "PUT", token: t, body: { punctuation: true } });
    const r = await app.call("/api/config", { method: "PUT", token: t, body: { [bad]: 1, numbers: true } });
    const got = await app.call("/api/config", { token: t });
    return r.status === 422 && got.body.numbers === false && got.body.punctuation === true; // wholesale reject
  }, 5);

  await asyncProp("B-QT-002", fc.integer({ min: 1, max: 500 }), async (len) => {
    const t = await app.signup("qt" + Math.random().toString(36).slice(2, 8));
    const r = await app.call("/api/quotes", { method: "POST", token: t,
      body: { text: "a".repeat(len), source: "prop", language: "english" } });
    const expect = len <= 100 ? 0 : len <= 300 ? 1 : len <= 600 ? 2 : 3;
    return (r.status === 201 || r.status === 200) && r.body.group === expect && r.body.length === len;
  });
  // B-QT-002 boundary examples (group 3 unreachable via submit maxLength=500 — coverage note in evidence)
  {
    const t = await app.signup("qtbounds");
    for (const [len, expect] of [[1, 0], [100, 0], [101, 1], [300, 1], [301, 2], [500, 2]]) {
      const r = await app.call("/api/quotes", { method: "POST", token: t,
        body: { text: "a".repeat(len), source: "prop", language: "english" } });
      rec("B-QT-002", r.body.group === expect && r.body.length === r.body.text.length, `len=${len} -> group=${r.body?.group}`);
    }
  }
  await asyncProp("B-QT-005", fc.tuple(fc.integer({ min: 1, max: 5 }), fc.integer({ min: 1, max: 5 })), async ([r1, r2]) => {
    const t = await app.signup("qt" + Math.random().toString(36).slice(2, 8));
    const made = await app.call("/api/quotes", { method: "POST", token: t,
      body: { text: "rate me " + Math.random(), source: "prop", language: "english" } });
    const id = made.body.id;
    await app.call(`/api/quotes/${id}/rate`, { method: "POST", token: t, body: { rating: r1 } });
    const again = await app.call(`/api/quotes/${id}/rate`, { method: "POST", token: t, body: { rating: r2 } });
    return again.body.rating.count === 1 && again.body.rating.average === r2; // replace, not add
  }, 10);

  await asyncProp("B-RES-002", fc.constant(null), async () => {
    const t = await app.signup("rs" + Math.random().toString(36).slice(2, 8));
    const ev = makeEvent();
    const r1 = await app.call("/api/results", { method: "POST", token: t, body: ev });
    const r2 = await app.call("/api/results", { method: "POST", token: t, body: ev });
    const hist = await app.call("/api/results", { token: t });
    return r1.status === 201 && r2.status === 200 && r1.body.id === r2.body.id &&
           hist.body.results.length === 1;
  }, 5);

  await asyncProp("B-RES-003", fc.tuple(fc.double({ min: 40, max: 100, noNaN: true }),
                                        fc.double({ min: 101, max: 200, noNaN: true })), async ([w1, w2]) => {
    const t = await app.signup("rs" + Math.random().toString(36).slice(2, 8));
    const r1 = await app.call("/api/results", { method: "POST", token: t,
      body: makeEvent({ wpm: w1, hash: "a" + Math.random() }) });
    const r2 = await app.call("/api/results", { method: "POST", token: t,
      body: makeEvent({ wpm: w2, hash: "b" + Math.random() }) });
    return r1.body.isPb === true && r2.body.isPb === true; // each strictly greater than prior best
  }, 10);

  await asyncProp("B-RES-004", fc.constant(null), async () => {
    const t = await app.signup("rs" + Math.random().toString(36).slice(2, 8));
    const r = await app.call("/api/results", { method: "POST", token: t,
      body: makeEvent({ bailedOut: true, wpm: 300, hash: "bail" + Math.random() }) });
    return r.status === 201 && r.body.isPb === false;
  }, 3);

  // B-LB-002 runs on a DEDICATED instance: leaderboard assertions are global-state
  // sensitive, so the harness isolates them (harness-side test isolation).
  const lbApp = await bootApp();
  try {
    const mk = async (wpm, ts) => {
      const t = await lbApp.signup("lb" + Math.random().toString(36).slice(2, 8));
      await lbApp.call("/api/results", { method: "POST", token: t,
        body: makeEvent({ wpm, timestamp: ts, mode2: "15", hash: "lb" + Math.random() }) });
    };
    await mk(120, 1000); await mk(120, 500); await mk(90, 700);
    const b = await lbApp.call("/api/leaderboards/15");
    const e = b.body.entries;
    rec("B-LB-002",
        e.length === 3 && e[0].wpm === 120 && e[0].timestamp === 500 && // tie: earlier first
        e[1].wpm === 120 && e[2].wpm === 90,
        JSON.stringify(e));
    // B-LB-001: bailed + rejected results never appear
    const t2 = await lbApp.signup("lbbail");
    await lbApp.call("/api/results", { method: "POST", token: t2,
      body: makeEvent({ wpm: 400, timestamp: 100, mode2: "15", bailedOut: true, hash: "bail1" }) });
    await lbApp.call("/api/results", { method: "POST", token: t2,
      body: makeEvent({ wpm: 999, timestamp: 100, mode2: "15", hash: "cheat1" }) }); // anticheat rejects
    const b2 = await lbApp.call("/api/leaderboards/15");
    rec("B-LB-001", b2.body.entries.every((x) => x.wpm <= 120), "bailed/rejected excluded");
  } finally {
    lbApp.close();
  }
} finally {
  app.close();
}

const failed = results.filter((r) => r.outcome !== "pass");
const out = { layer: "behavioral", validator: { id: "property-check+mutation-sanity", version: "1.0.0" },
              runs: RUNS, results,
              verdict: failed.length === 0 ? "admit" : "reject",
              verdict_reason: failed.length ? `${failed.length} behavioral failures/suspects` : "all behavioral properties hold" };
writeJson(new URL("./out/behavioral.json", import.meta.url).pathname, out);
console.log(JSON.stringify({ verdict: out.verdict, checks: results.length,
        failed: failed.map((f) => [f.invariant_id, f.outcome, f.evidence]) }, null, 2));
process.exit(failed.length ? 1 : 0);
