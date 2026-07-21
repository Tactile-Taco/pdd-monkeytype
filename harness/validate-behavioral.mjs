// PDD Validator Loop — Layer 2: BEHAVIORAL (property-based tests + mutation sanity).
// Every test carries invariant lineage. Emits harness/out/behavioral.json.
import fc from "fast-check";
import { writeJson } from "./evidence.mjs";
import { bootApp, makeEvent, SEALED_CONFIG_DEFAULTS, assetWordlist, readWordlistAsset, WORDLIST_ASSETS_DIR } from "./boot.mjs";
import { round2, calculateWpm, kogasa, consistencyOf, mean, stdDev } from "../implementation/src/shared/stats.js";
import { countChars } from "../implementation/src/engine/countChars.js";
import { TypingSession } from "../implementation/src/engine/session.js";
import { generateWords, decorateWords, mulberry32 } from "../implementation/src/engine/words.js";
import { admitCatalog } from "../implementation/src/shared/wordlists.js";
import { ratingWeight, weightedPickIndex, seededRand, QUOTE_PAGE_SIZE } from "../implementation/src/shared/quotes.js";
import { computeBoard, percentileOf, xpOf, inWindow, DAILY_WINDOW_MS } from "../implementation/src/shared/leaderboards.js";
import { utcDay } from "../implementation/src/shared/resultStats.js";
import { computeStreaks, levelFor, validateProfileUpdate, XP_PER_LEVEL_SQ, DAY_MS } from "../implementation/src/shared/profile.js";
import { mintApeKey, hashKey, authenticateApeKey, createRateLimiter, SCOPES, APEKEY_PREFIX,
         RATE_KEY_LIMIT, RATE_IP_LIMIT, RATE_WINDOW_MS } from "../implementation/src/shared/apekeys.js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { charsEqual, stripDiacritics, carriesDiacritic } from "../implementation/src/engine/lazy.js";
import { SessionOracle } from "../protocols/ui-presentation/validators/lib/oracle.mjs";
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
// v1.1: delete within word; retreat iff previous committed word has an error; correct words sealed
prop("B-ENG-005", fc.array(fc.constant("backspace"), { minLength: 1, maxLength: 50 }), (bs) => {
  const s = new TypingSession({ mode: "words", mode2: "3", words: ["abc", "def", "ghi"] });
  bs.forEach((_, i) => s.feed({ t: i + 1, type: "backspace" }));
  return s.inputs[0] === "" && s.wordIndex === 0; // never before start of first word
});
prop("B-ENG-005", fc.tuple(fc.constantFrom("abx", "axc", "abd"), fc.integer({ min: 1, max: 4 })), ([typo, nBack]) => {
  const s = new TypingSession({ mode: "words", mode2: "3", words: ["abc", "def", "ghi"] });
  let t = 1000;
  for (const ch of typo) s.feed({ t: t += 100, type: "char", value: ch }); // erroneous first word
  s.feed({ t: t += 100, type: "space" });                                    // commit with error
  for (let i = 0; i < nBack; i++) s.feed({ t: t += 100, type: "backspace" });
  return s.wordIndex === 0 && s.inputs[0].length === Math.max(0, typo.length - (nBack - 1)); // retreated
});
prop("B-ENG-005", fc.integer({ min: 1, max: 6 }), (nBack) => {
  const s = new TypingSession({ mode: "words", mode2: "3", words: ["abc", "def", "ghi"] });
  let t = 1000;
  for (const ch of "abc") s.feed({ t: t += 100, type: "char", value: ch }); // correct first word
  s.feed({ t: t += 100, type: "space" });                                   // committed correct
  for (let i = 0; i < nBack; i++) s.feed({ t: t += 100, type: "backspace" });
  return s.wordIndex === 1 && s.inputs[0] === "abc"; // sealed: no retreat, word untouched
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

// ================= typing-test-engine v2.0.0 (MAJOR) =================
// Session-state hash for inert-event assertions (B-ENG-008(f) / S-ENG-002):
// position, inputs, caret, completion, accepted-event traces, and accounting.
const stateHash = (s) => JSON.stringify([s.wordIndex, s.inputs, s.caret, s.completed, s.bailedOut,
                                         s.events.length, s.keyTimes.length, s._charCounts()]);
const typeChars = (s, text, t0 = 1000, dt = 100) => {
  let t = t0;
  for (const ch of text) { s.feed({ t, type: "char", value: ch }); t += dt; }
  return t;
};

// ---------- B-ENG-008 mode matrix ----------
// (a) stopOnError=letter: while the last committed char is incorrect, char/space inert
prop("B-ENG-008", fc.tuple(word(), fc.nat({ max: 30 }), fc.integer({ min: 1, max: 8 })), ([w, pos0, noise]) => {
  const pos = pos0 % w.length;
  const s = new TypingSession({ mode: "words", mode2: "2", words: [w, "zz"], config: { stopOnError: "letter" } });
  let t = typeChars(s, w.slice(0, pos));
  s.feed({ t, type: "char", value: w[pos] === "x" ? "q" : "x" }); t += 100; // incorrect last char committed
  const armed = stateHash(s);
  for (let k = 0; k < noise; k++) {
    s.feed({ t, type: "char", value: "m" }); t += 100; // inert while the error stands
    s.feed({ t, type: "space" }); t += 100;            // space gated too (clause a)
  }
  if (stateHash(s) !== armed) return false;
  s.feed({ t, type: "backspace" }); t += 100;          // correction path stays open
  s.feed({ t, type: "char", value: w[pos] }); t += 100;
  return s.inputs[0] === w.slice(0, pos + 1);          // input registers again once corrected
});
// (b) stopOnError=word: word-commit registers iff input equals target
// (useSelf biases the positive branch so correct completions are exercised often)
prop("B-ENG-008", fc.tuple(word(), word(), fc.boolean()), ([w, inp0, useSelf]) => {
  const inp = useSelf ? w : inp0;
  const s = new TypingSession({ mode: "words", mode2: "2", words: [w, "zz"], config: { stopOnError: "word" } });
  const t = typeChars(s, inp);
  s.feed({ t, type: "space" });
  return (s.wordIndex === 1) === (inp === w); // caret stays until completed correctly
});
// (c) strictSpace: space inert while the current word is incomplete
prop("B-ENG-008", fc.tuple(word(), word()), ([w, inp]) => {
  const s = new TypingSession({ mode: "words", mode2: "2", words: [w, "zz"], config: { strictSpace: true } });
  const t = typeChars(s, inp);
  const before = stateHash(s);
  s.feed({ t, type: "space" });
  if (inp.length === 0) return s.wordIndex === 0 && stateHash(s) === before;      // no empty commits (v1 rule)
  if (inp.length < w.length) return s.wordIndex === 0 && stateHash(s) === before; // inert mid-word
  return s.wordIndex === 1;                                                        // full/extra input commits
});
// (d) optional shift field is evidence plumbing: admitted identically with/without it
prop("B-ENG-008", fc.tuple(fc.array(word(), { minLength: 2, maxLength: 4 }),
                           fc.array(fc.constantFrom(..."abcxyz"), { minLength: 1, maxLength: 40 })), ([ws, chars]) => {
  const run = (withShift) => {
    const s = new TypingSession({ mode: "words", mode2: String(ws.length), words: ws, now: () => 0 });
    let t = 1000;
    chars.forEach((c, i) => {
      s.feed(withShift ? { t, type: "char", value: c, shift: ["left", "right", "none"][i % 3] }
                       : { t, type: "char", value: c });
      t += 100;
      if (i % 7 === 6) { s.feed({ t, type: "space" }); t += 100; }
    });
    return s;
  };
  const a = run(true), b = run(false);
  return JSON.stringify([a.wordIndex, a.inputs, a.completed, a._charCounts()]) ===
         JSON.stringify([b.wordIndex, b.inputs, b.completed, b._charCounts()]);
});
// (e) blindMode: character accounting unchanged
prop("B-ENG-008", fc.array(word(), { minLength: 1, maxLength: 5 }), (ws) => {
  const run = (blind) => {
    const s = new TypingSession({ mode: "words", mode2: String(ws.length), words: ws, config: { blindMode: blind }, now: () => 0 });
    let t = 1000;
    for (const w of ws) {
      for (const ch of w) { s.feed({ t, type: "char", value: ch === "a" ? "x" : ch }); t += 100; } // deterministic errors
      s.feed({ t, type: "space" }); t += 100;
    }
    if (!s.completed) s.bail(t);
    return s.completionEvent({ timestamp: 1 });
  };
  const on = run(true), off = run(false);
  return JSON.stringify(on.charStats) === JSON.stringify(off.charStats) && on.wpm === off.wpm &&
         on.acc === off.acc && on.blindMode === true && off.blindMode === false;
});
// (f) inert events never corrupt session state and never enter accounting
prop("B-ENG-008", fc.array(fc.constantFrom("space", "char", "junk"), { minLength: 1, maxLength: 30 }), (kinds) => {
  const s = new TypingSession({ mode: "words", mode2: "3", words: ["abc", "de", "fghi"],
                                config: { stopOnError: "letter", strictSpace: true }, now: () => 0 });
  s.feed({ t: 1, type: "char", value: "z" }); // wrong char: letter-stop armed (and word incomplete)
  const armed = stateHash(s);
  kinds.forEach((k, i) => {
    if (k === "space") s.feed({ t: 10 + i, type: "space" });                // inert (letter stop + strictSpace)
    else if (k === "char") s.feed({ t: 10 + i, type: "char", value: "q" }); // inert (letter stop)
    else s.feed({ t: 10 + i, type: "frobnicate", value: 1 });               // out of contract (S-ENG-002)
  });
  return stateHash(s) === armed;
});
// (g) confidenceMode=true with stopOnError!=off: refuse to start the session
prop("B-ENG-008", fc.constantFrom("letter", "word"), (soe) => {
  try {
    new TypingSession({ mode: "words", mode2: "1", words: ["a"], config: { confidenceMode: true, stopOnError: soe } });
    return false; // a session started — the contradictory pairing leaked
  } catch { return true; }
});
prop("B-ENG-008", fc.boolean(), (conf) => {
  const s = new TypingSession({ mode: "words", mode2: "1", words: ["a"], config: { confidenceMode: conf, stopOnError: "off" } });
  return s instanceof TypingSession; // stopOnError=off pairing always starts
});

// ---------- B-ENG-005 v2.0.0 mode gates ----------
// confidenceMode=true: every backspace/delete inert once a char is committed to input
prop("B-ENG-005", fc.tuple(word(), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 10 })), ([w, nChars, nBs]) => {
  const s = new TypingSession({ mode: "words", mode2: "2", words: [w, "zz"], config: { confidenceMode: true } });
  let t = typeChars(s, (w + w).slice(0, nChars));
  const before = stateHash(s);
  for (let i = 0; i < nBs; i++) { s.feed({ t, type: "backspace" }); t += 100; }
  return stateHash(s) === before; // no deletion, no retreat
});
prop("B-ENG-005", word(), (w) => {
  const typo = w.slice(0, -1) + (w.endsWith("x") ? "q" : "x"); // differs from w
  const s = new TypingSession({ mode: "words", mode2: "3", words: [w, "ab", "cd"], config: { confidenceMode: true } });
  let t = typeChars(s, typo);
  s.feed({ t, type: "space" }); t += 100; // committed with an error (default mode would allow retreat)
  s.feed({ t, type: "backspace" });
  return s.wordIndex === 1 && s.inputs[0] === typo; // confidence: no retreat into erroneous word
});
// freedomMode=true: navigate places the caret at an absolute (wordIndex, charIndex)
prop("B-ENG-005", fc.tuple(fc.array(word(), { minLength: 2, maxLength: 5 }), fc.nat({ max: 100 }), fc.nat({ max: 30 })), ([ws, wi0, ci]) => {
  const wi = wi0 % ws.length;
  const s = new TypingSession({ mode: "words", mode2: String(ws.length), words: ws, config: { freedomMode: true } });
  s.feed({ t: 1, type: "navigate", wordIndex: wi, charIndex: ci });
  return s.wordIndex === wi && s.caret === Math.min(ci, Math.max(ws[wi].length, s.inputs[wi].length));
});
// freedomMode: the sealed-word rule does not apply to navigated positions
prop("B-ENG-005", fc.tuple(word(), word()), ([w1, w2]) => {
  const s = new TypingSession({ mode: "words", mode2: "2", words: [w1, w2], config: { freedomMode: true } });
  let t = typeChars(s, w1);
  s.feed({ t, type: "space" }); t += 100; // committed fully correct (sealed under default rules)
  s.feed({ t, type: "backspace" }); t += 100;
  if (s.wordIndex !== 0 || s.caret !== w1.length) return false; // retreat allowed under freedom
  s.feed({ t, type: "backspace" }); t += 100;
  return s.inputs[0] === w1.slice(0, -1); // formerly sealed word is editable
});
// freedomMode: previously-skipped positions are fillable via navigate
prop("B-ENG-005", fc.tuple(word(), fc.integer({ min: 0, max: 20 })), ([w, k0]) => {
  const tgt = w + "ab";
  const k = k0 % tgt.length;
  const s = new TypingSession({ mode: "words", mode2: "2", words: [tgt, "zz"], config: { freedomMode: true } });
  let t = 1000;
  for (let i = 0; i < tgt.length; i++) if (i !== k) { s.feed({ t, type: "char", value: tgt[i] }); t += 100; }
  s.feed({ t, type: "navigate", wordIndex: 0, charIndex: k }); t += 100;
  s.feed({ t, type: "char", value: tgt[k] }); t += 100;
  return s.inputs[0] === tgt; // gap filled at the skipped position
});
// out-of-range navigate inert; navigate inert without freedomMode (S-ENG-002)
prop("B-ENG-005", fc.tuple(fc.integer({ min: -5, max: 20 }), fc.integer({ min: -5, max: 30 })), ([wi, ci]) => {
  const words = ["abc", "def"];
  const s = new TypingSession({ mode: "words", mode2: "2", words, config: { freedomMode: true } });
  const before = stateHash(s);
  s.feed({ t: 1, type: "navigate", wordIndex: wi, charIndex: ci });
  const inRange = wi >= 0 && wi < words.length && ci >= 0;
  if (!inRange) return stateHash(s) === before;
  return s.wordIndex === wi && s.caret === Math.min(ci, words[wi].length);
});
prop("B-ENG-005", fc.integer({ min: 0, max: 5 }), (wi) => {
  const s = new TypingSession({ mode: "words", mode2: "2", words: ["abc", "def"] }); // freedom OFF
  const before = stateHash(s);
  s.feed({ t: 1, type: "navigate", wordIndex: wi, charIndex: 1 });
  return stateHash(s) === before;
});
// engine-semantics v2 registration for the ui-presentation oracle: the oracle's
// "v1.1" semantics must remain EXACTLY the v2 engine's default-config behavior
// (the ui bundle pins oracle semantics; default config is v1-compatible).
prop("B-ENG-005", fc.tuple(fc.array(word(), { minLength: 2, maxLength: 6 }), fc.integer({ min: 1, max: 100000 })), ([ws, seed]) => {
  const rnd = mulberry32(seed);
  const eng = new TypingSession({ mode: "words", mode2: String(ws.length), words: ws, now: () => 0 }); // v2 engine, default config
  const orc = new SessionOracle(ws, { mode: "words", semantics: "v1.1" });
  let t = 0;
  for (let k = 0; k < 80; k++) {
    const r = rnd();
    const ev = r < 0.55 ? { t: ++t, type: "char", value: "abcdefgh"[Math.floor(rnd() * 8)] }
             : r < 0.75 ? { t: ++t, type: "backspace" }
             : { t: ++t, type: "space" };
    eng.feed(ev); orc.feed(ev);
    if (eng.wordIndex !== orc.wordIndex || eng.completed !== orc.completed ||
        eng.inputs.slice(0, eng.wordIndex + 1).join("") !== orc.inputs.slice(0, orc.wordIndex + 1).join("")) return false;
  }
  return true;
});

// ---------- B-ENG-009 generation decoration ----------
// (d)+(e): deterministic given (word list, config, stream position); never empty; flags off = identity
prop("B-ENG-009", fc.tuple(fc.integer({ min: 1, max: 100000 }), fc.boolean(), fc.boolean(), fc.integer({ min: 5, max: 60 })), ([seed, p, n, count]) => {
  const base = generateWords(count, seed);
  const a = decorateWords(base, mulberry32(seed), { punctuation: p, numbers: n });
  const b = decorateWords(base, mulberry32(seed), { punctuation: p, numbers: n });
  if (JSON.stringify(a) !== JSON.stringify(b)) return false; // same seed -> same targets
  if (!a.every((x) => x.length > 0)) return false;           // (e) never empty
  if (!p && !n && a !== base) return false;                  // flags off -> v1 stream unchanged
  return true;
});
// (a)+(b): punctuation/numbers decoration actually decorates (fixed seed, statistical)
{
  const d = decorateWords(generateWords(400, 7), mulberry32(99), { punctuation: true, numbers: true });
  rec("B-ENG-009",
      d.some((w) => /[.,!?;:]$/.test(w)) && d.some((w) => /^[A-Z]/.test(w)) && d.some((w) => /^\d+$/.test(w)),
      "terminal marks, capitalized words, and number tokens all present in a 400-word decorated stream");
}
// decorated characters are ordinary targets: exact typing scores fully correct
prop("B-ENG-009", fc.tuple(fc.integer({ min: 1, max: 1000 }), fc.boolean(), fc.boolean()), ([seed, p, n]) => {
  const wl = assetWordlist({ language: "english", count: 8, seed, punctuation: p, numbers: n }); // ADV-W2-01: asset-sourced
  const s = new TypingSession({ mode: "words", mode2: "8", words: wl.words, config: { punctuation: p, numbers: n }, now: () => 0 });
  let t = 1000;
  for (const w of wl.words) { t = typeChars(s, w, t); s.feed({ t, type: "space" }); t += 100; }
  const ev = s.completionEvent({ timestamp: 1 });
  const total = wl.words.join("").length;
  return ev.charStats.join(",") === `${total},0,0,0` && ev.charTotal === total;
});
// (c) lazy equivalence over U+0300–036F: base+combining-mark targets accept the base char; directional
prop("B-ENG-009", fc.tuple(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz"), fc.integer({ min: 0x300, max: 0x36f })), ([base, cp]) => {
  const target = base + String.fromCodePoint(cp); // NFD form: base + combining mark
  return charsEqual(base, target, true) === true &&  // unaccented base accepted for diacritic target
         charsEqual(target, base, true) === false && // directional: accented input for plain target is NOT equivalent
         charsEqual(base, target, false) === false;  // strict when lazyMode off
});
// (c) equivalence-table scope: precomposed Latin composites accepted; letters
// without an NFD decomposition (ø ß æ ł đ) stay strict (delegated data, settled)
{
  const precomposed = [..."éèêëàáâäñçüöíìîïóòôúùûýÿÉÑÇÀ"];
  const nonDecomposing = [..."øßæłđ"];
  rec("B-ENG-009",
      precomposed.every((c) => carriesDiacritic(c) && stripDiacritics(c).length === 1 && charsEqual(stripDiacritics(c), c, true)) &&
      nonDecomposing.every((c) => !carriesDiacritic(c)),
      "NFD-decomposing precomposed chars equivalent; non-decomposing letters strict");
}
// (c) session-level: words mode completes on a lazy match and counts it correct
// (mark arbitrary biased toward composing marks so the NFC-composite branch is exercised)
const combiningMark = fc.oneof({ weight: 7, arbitrary: fc.constantFrom(0x300, 0x301, 0x302, 0x303, 0x304, 0x306, 0x307, 0x308, 0x30a, 0x30c, 0x323, 0x327, 0x328) },
                               { weight: 3, arbitrary: fc.integer({ min: 0x300, max: 0x36f }) });
prop("B-ENG-009", fc.tuple(fc.constantFrom(..."aeinouycAE"), combiningMark), ([base, cp]) => {
  const pre = (base + String.fromCodePoint(cp)).normalize("NFC");
  if (pre.length !== 1) return true; // no precomposed composite — outside per-code-unit engine scope
  const s = new TypingSession({ mode: "words", mode2: "1", words: ["x" + pre + "z"], config: { lazyMode: true }, now: () => 0 });
  typeChars(s, "x" + base + "z"); // type the unaccented base
  return s.completed && s.completionEvent({ timestamp: 1 }).charStats.join(",") === "3,0,0,0";
});
// (c) accounting conservation holds under lazy equivalence (B-ENG-004 cross-check)
prop("B-ENG-009", fc.tuple(word(), word()), ([inp, tgt]) => {
  const c = countChars(inp, tgt, false, true);
  return c.allCorrect + c.incorrect + c.extra + c.missed === Math.max(inp.length, tgt.length);
});

// ---------- B-ENG-006 (amended): determinism quantified over the mode matrix + decoration ----------
const legalCfg = fc.record({
  punctuation: fc.boolean(), numbers: fc.boolean(), blindMode: fc.boolean(), lazyMode: fc.boolean(),
  strictSpace: fc.boolean(), freedomMode: fc.boolean(), confidenceMode: fc.boolean(),
  stopOnError: fc.constantFrom("off", "letter", "word"),
  minWpm: fc.double({ min: 0, max: 200, noNaN: true }), minAcc: fc.double({ min: 0, max: 100, noNaN: true }),
}).filter((c) => !(c.confidenceMode && c.stopOnError !== "off")); // B-ENG-008(g) illegal pairing
prop("B-ENG-006", fc.tuple(legalCfg, fc.integer({ min: 1, max: 10000 })), ([cfg, seed]) => {
  const build = () => {
    const wl = assetWordlist({ language: "english", count: 6, seed, punctuation: cfg.punctuation, numbers: cfg.numbers });
    const s = new TypingSession({ mode: "words", mode2: "6", words: wl.words, config: cfg, now: () => 42 });
    let t = 1000;
    const rnd = mulberry32(seed + 1);
    for (const w of wl.words) {
      for (const ch of w) {
        if (rnd() < 0.12) { s.feed({ t, type: "char", value: "z" }); t += 100; } // noise error (may arm gates)
        if (rnd() < 0.10) { s.feed({ t, type: "backspace" }); t += 100; }        // noise correction (may be inert)
        s.feed({ t, type: "char", value: ch, shift: "none" }); t += 100;
      }
      if (cfg.freedomMode && rnd() < 0.3) { s.feed({ t, type: "navigate", wordIndex: 0, charIndex: 0 }); t += 100; }
      s.feed({ t, type: "space" }); t += 100;
    }
    if (!s.completed) s.bail(t);
    return s.completionEvent({ timestamp: 42, hash: "det" });
  };
  return JSON.stringify(build()) === JSON.stringify(build());
});

// ---------- B-ENG-007 (amended): custom completion + unit echo; zen manual end ----------
prop("B-ENG-007", fc.integer({ min: 1, max: 30 }), (secs) => {
  const s = new TypingSession({ mode: "custom", mode2: String(secs), words: generateWords(200, 3),
                                config: { unit: "seconds" }, now: () => 0 });
  s.feed({ t: 0, type: "char", value: "a" });
  s.feed({ t: secs * 1000 - 1, type: "char", value: "b" });
  const notYet = !s.completed;
  s.feed({ t: secs * 1000, type: "char", value: "c" });
  const ev = s.completionEvent({ timestamp: 1 });
  return notYet && s.completed && ev.mode === "custom" && ev.mode2 === String(secs) &&
         ev.unit === "seconds" && ev.bailedOut === false; // timer expiry; echo per BQ-ENG-01
});
prop("B-ENG-007", fc.array(word(), { minLength: 1, maxLength: 6 }), (ws) => {
  const s = new TypingSession({ mode: "custom", mode2: String(ws.length), words: ws,
                                config: { unit: "words" }, now: () => 0 });
  let t = 1000, earlyCompletion = false;
  for (let i = 0; i < ws.length; i++) {
    t = typeChars(s, ws[i], t);
    if (i < ws.length - 1) { s.feed({ t, type: "space" }); t += 100; if (s.completed) earlyCompletion = true; }
  }
  const ev = s.completionEvent({ timestamp: 1 });
  return !earlyCompletion && s.completed && ev.unit === "words" && ev.mode2 === String(ws.length);
});
prop("B-ENG-007", fc.array(fc.constantFrom(..."abc z"), { minLength: 1, maxLength: 40 }), (chars) => {
  const s = new TypingSession({ mode: "zen", mode2: "", words: [" ".repeat(60)], now: () => 0 });
  let t = 1000;
  for (const c of chars) {
    if (c === " ") s.feed({ t, type: "space" });
    else s.feed({ t, type: "char", value: c });
    t += 50;
  }
  if (s.completed) return false; // zen NEVER self-completes
  s.bail(t);
  const ev = s.completionEvent({ timestamp: 1 });
  return s.completed && ev.mode === "zen" && ev.bailedOut === true; // manual end (BQ-ENG-06)
});

// ---------- B-ENG-010 (new): min-threshold failure flag truth table ----------
// minThresholdFailed <=> (minWpm>0 && wpm<minWpm) || (minAcc>0 && acc<minAcc); 0 = disabled.
// Flagging never alters stat computation, completion, or accounting.
prop("B-ENG-010", fc.tuple(fc.double({ min: 0, max: 200, noNaN: true }), fc.double({ min: 0, max: 100, noNaN: true }),
                           fc.array(word(), { minLength: 1, maxLength: 4 }), fc.integer({ min: 0, max: 5 })),
  ([minWpm, minAcc, ws, errSeed]) => {
    const run = (cfg) => {
      const s = new TypingSession({ mode: "words", mode2: String(ws.length), words: ws, config: cfg, now: () => 0 });
      let t = 1000;
      ws.forEach((w, wi) => {
        for (let i = 0; i < w.length; i++) {
          const wrong = errSeed > 0 && wi < ws.length - 1 && i === errSeed % w.length; // keep last word committable
          s.feed({ t, type: "char", value: wrong ? (w[i] === "x" ? "q" : "x") : w[i] }); t += 100;
        }
        s.feed({ t, type: "space" }); t += 100;
      });
      if (!s.completed) s.bail(t);
      return s.completionEvent({ timestamp: 1 });
    };
    const ev = run({ minWpm, minAcc });
    const off = run({ minWpm: 0, minAcc: 0 });
    const expect = (minWpm > 0 && ev.wpm < minWpm) || (minAcc > 0 && ev.acc < minAcc);
    return ev.minThresholdFailed === expect && off.minThresholdFailed === false &&
           ev.wpm === off.wpm && ev.acc === off.acc &&
           JSON.stringify(ev.charStats) === JSON.stringify(off.charStats);
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
  // usernames must be collision-free ACROSS runs: the booted app's user store
  // persists for the whole suite, and fast-check's biased fc.integer repeats
  // draws within a 20-run window (measured: 43% of windows contain a duplicate;
  // wave-3 counterexamples [0],[21],[11],[4]) — the repeat signup then 409s on
  // t1 and the property flakes. fc.uuid-sourced suffixes are unique for all
  // practical purposes (12 hex chars; NAME_RE-safe at 16 chars total).
  await asyncProp("B-ACC-001", fc.uuid().map((u) => u.replace(/-/g, "").slice(0, 12)), async (suffix) => {
    const name = "case" + suffix;
    const t1 = await app.signup(name);
    const r2 = await app.call("/api/account/signup", { method: "POST", body: { name: name.toUpperCase(), password: "password123" } });
    return !!t1 && r2.status === 409; // duplicate (case-insensitive) rejected
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

  // ---------- user-config v1.2.0: 37-key round-trip, defaults-merge, wholesale 422 ----------
  const KEYS37 = Object.keys(SEALED_CONFIG_DEFAULTS); // sealed closed key set (ambiguity-log)
  const HEXARB = fc.constantFrom("", "#abc", "#a1b2c3", "#323437".toUpperCase(), "zz-top");
  const CFG_ARB = { // valid value domains per the sealed config schema
    mode: fc.constantFrom("time", "words", "quote", "zen", "custom"),
    mode2: fc.constantFrom("15", "30", "60", "120", "10", "3"),
    language: fc.constantFrom("english", "klingon", "spanish"),
    punctuation: fc.boolean(), numbers: fc.boolean(),
    difficulty: fc.constantFrom("normal", "expert", "master"),
    blindMode: fc.boolean(), stopOnError: fc.constantFrom("off", "letter", "word"),
    theme: fc.constantFrom("serika_dark", "serika_light", "matrix"),
    lazyMode: fc.boolean(), confidenceMode: fc.boolean(), freedomMode: fc.boolean(),
    strictSpace: fc.boolean(), oppositeShift: fc.boolean(),
    minWpm: fc.double({ min: 0, max: 500, noNaN: true }),
    minAcc: fc.double({ min: 0, max: 100, noNaN: true }),
    fontFamily: fc.constantFrom("", "Fira Mono", "f".repeat(100)),
    fontSize: fc.double({ min: 0, max: 200, noNaN: true }),
    tapeMode: fc.boolean(), quickRestart: fc.constantFrom("off", "tab", "esc", "enter"),
    flipTestColors: fc.boolean(), colorfulError: fc.boolean(), randomTheme: fc.boolean(),
    // v1.2.0 batch-2: custom slots are loose strings <= 32 ("" = unset);
    // caret enum; live-stats booleans
    customThemeBg: HEXARB, customThemeMain: HEXARB, customThemeCaret: HEXARB,
    customThemeSub: HEXARB, customThemeSubAlt: HEXARB, customThemeText: HEXARB,
    customThemeError: HEXARB, customThemeErrorExtra: HEXARB, customThemeColorfulError: HEXARB,
    caretStyle: fc.constantFrom("off", "line", "block", "outline", "underline"),
    smoothCaret: fc.boolean(),
    liveWpm: fc.boolean(), liveAcc: fc.boolean(), liveBurst: fc.boolean(),
  };
  // B-CFG-001 (amended): GET presents every schema key; unset keys at documented
  // defaults — incl. fontSize: 0 (v1.1.1 PATCH, BQ-IMPL-01)
  await asyncProp("B-CFG-001", fc.constant(null), async () => {
    const t = await app.signup("cfg" + Math.random().toString(36).slice(2, 8));
    const got = (await app.call("/api/config", { token: t })).body;
    return Object.keys(got ?? {}).length === 37 && got.fontSize === 0 &&
           KEYS37.every((k) => got[k] === SEALED_CONFIG_DEFAULTS[k]);
  }, 3);
  // B-CFG-002: exhaustive 37-key sequential round-trip — every key individually
  // settable, and the merged GET retains every previously set key
  {
    const RT = { mode: "words", mode2: "60", language: "klingon", punctuation: true, numbers: true,
      difficulty: "expert", blindMode: true, stopOnError: "letter", theme: "serika_light", lazyMode: true,
      confidenceMode: true, freedomMode: true, strictSpace: true, oppositeShift: true,
      minWpm: 42.5, minAcc: 87.5, fontFamily: "Fira Mono", fontSize: 16.5, tapeMode: true,
      quickRestart: "esc", flipTestColors: true, colorfulError: true, randomTheme: true,
      customThemeBg: "#111111", customThemeMain: "#222222", customThemeCaret: "#333333",
      customThemeSub: "#444444", customThemeSubAlt: "#555555", customThemeText: "#666666",
      customThemeError: "#ff0000", customThemeErrorExtra: "#880000", customThemeColorfulError: "#ff2233",
      caretStyle: "outline", smoothCaret: false, liveWpm: true, liveAcc: true, liveBurst: true };
    const t = await app.signup("cfg" + Math.random().toString(36).slice(2, 8));
    const expected = { ...SEALED_CONFIG_DEFAULTS };
    let ok = true, done = 0;
    for (const k of KEYS37) {
      const r = await app.call("/api/config", { method: "PUT", token: t, body: { [k]: RT[k] } });
      expected[k] = RT[k];
      const got = (await app.call("/api/config", { token: t })).body;
      done++;
      if (r.status !== 200 || !KEYS37.every((ek) => got?.[ek] === expected[ek])) { ok = false; break; }
    }
    rec("B-CFG-002", ok, `37-key sequential round-trip (${done}/37 PUTs): each key set, all prior retained`);
  }
  // B-CFG-002: random partial updates == merge over the sealed defaults (property)
  await asyncProp("B-CFG-002",
    fc.record(CFG_ARB, { requiredKeys: [] }).filter((u) => Object.keys(u).length > 0), async (upd) => {
      const t = await app.signup("cfg" + Math.random().toString(36).slice(2, 8));
      const r = await app.call("/api/config", { method: "PUT", token: t, body: upd });
      const got = (await app.call("/api/config", { token: t })).body;
      return r.status === 200 &&
             Object.entries(upd).every(([k, v]) => got?.[k] === v) &&
             KEYS37.filter((k) => !(k in upd)).every((k) => got?.[k] === SEALED_CONFIG_DEFAULTS[k]);
    }, 15);
  // B-CFG-003: wholesale 422 — invalid values for EVERY one of the 37 keys (and
  // unknown keys, incl. the v1.2.0-removed customThemeId); nothing persisted
  const CFG_INVALID = { // type/domain violations per the sealed schema (all non-conforming)
    mode: ["sideways", 1, true], mode2: [5, true, {}], language: [42, true, []],
    punctuation: ["yes", 1], numbers: ["no", 0], difficulty: ["hard", 2],
    blindMode: ["yes", 1], stopOnError: ["letters", 3], theme: [7, false],
    lazyMode: ["yes", 1], confidenceMode: ["yes", 1], freedomMode: ["yes", 1],
    strictSpace: ["yes", 1], oppositeShift: ["yes", 1],
    minWpm: [-1, "80"], minAcc: [101, -1, "90"],
    fontFamily: ["x".repeat(101), 5], fontSize: [-1, "16"],
    tapeMode: ["yes", 1], quickRestart: ["space", 2],
    flipTestColors: ["yes", 1], colorfulError: ["no", 0], randomTheme: ["yes", 1],
    customThemeBg: ["y".repeat(33), 9], customThemeMain: ["y".repeat(33), 9],
    customThemeCaret: ["y".repeat(33), 9], customThemeSub: ["y".repeat(33), 9],
    customThemeSubAlt: ["y".repeat(33), 9], customThemeText: ["y".repeat(33), 9],
    customThemeError: ["y".repeat(33), 9], customThemeErrorExtra: ["y".repeat(33), 9],
    customThemeColorfulError: ["y".repeat(33), 9],
    caretStyle: ["curly", 2], smoothCaret: ["yes", 1],
    liveWpm: ["yes", 1], liveAcc: ["yes", 1], liveBurst: ["yes", 1],
  };
  {
    const t = await app.signup("cfg" + Math.random().toString(36).slice(2, 8));
    await app.call("/api/config", { method: "PUT", token: t, body: { punctuation: true, minWpm: 33 } });
    let ok = true, n = 0;
    outer:
    for (const k of [...KEYS37, "customThemeId", "noSuchKey"]) {
      // customThemeId: removed in v1.2.0 (BQ-CFG-01) — even a formerly-valid
      // value is now an unknown-key rejection (intended per the ruling).
      const vals = k === "noSuchKey" ? [1] : k === "customThemeId" ? ["theme-42"] : CFG_INVALID[k];
      for (const v of vals) {
        // bundle a second, VALID key (never k itself): wholesale reject must drop it too
        const bundle = k === "numbers" ? { theme: "matrix" } : { numbers: true };
        const r = await app.call("/api/config", { method: "PUT", token: t, body: { [k]: v, ...bundle } });
        const got = (await app.call("/api/config", { token: t })).body;
        n++;
        if (r.status !== 422 || got?.punctuation !== true || got?.minWpm !== 33 ||
            got?.numbers !== false || got?.theme !== "serika_dark") { ok = false; break outer; }
      }
    }
    rec("B-CFG-003", ok, `wholesale 422 on ${n} invalid requests across all 37 keys + removed + unknown; nothing persisted`);
  }
  await asyncProp("B-CFG-003", fc.tuple(fc.constantFrom(...KEYS37), fc.nat({ max: 2 })), async ([k, i]) => {
    const vals = CFG_INVALID[k];
    const t = await app.signup("cfg" + Math.random().toString(36).slice(2, 8));
    const r = await app.call("/api/config", { method: "PUT", token: t, body: { [k]: vals[i % vals.length] } });
    const got = (await app.call("/api/config", { token: t })).body;
    return r.status === 422 && got?.[k] === SEALED_CONFIG_DEFAULTS[k];
  }, 12);

  // ---------- theme-catalog v1.0.0 (NEW bundle) ----------
  // B-THM-001: list/get round-trip consistency — every listed theme retrievable
  // by name with a token set identical to its catalog entry.
  {
    const list = await app.call("/api/themes");
    let ok = list.status === 200 && Array.isArray(list.body?.themes) && list.body.themes.length >= 1;
    let n = 0;
    for (const { name } of list.body?.themes ?? []) {
      const one = await app.call("/api/themes/" + encodeURIComponent(name));
      n++;
      if (one.status !== 200 || one.body?.name !== name ||
          typeof one.body?.tokens !== "object" || Object.keys(one.body.tokens).length < 9) { ok = false; break; }
    }
    rec("B-THM-001", ok, `list/get round-trip over ${n} themes (get(n).name == n, full token sets)`);
  }
  // B-THM-002: unknown name -> ErrorEnvelope(not_found); NEVER substitution.
  {
    const unk = await app.call("/api/themes/definitely-not-a-theme");
    const def = await app.call("/api/themes/serika_dark");
    rec("B-THM-002", unk.status === 404 && unk.body?.error?.code === "not_found" &&
        JSON.stringify(unk.body?.tokens ?? null) !== JSON.stringify(def.body?.tokens ?? null) &&
        unk.body?.name === undefined,
        `unknown -> ${unk.status} code=${unk.body?.error?.code} (no substitute tokens)`);
  }
  // B-THM-003: byte-identical repeat reads within a deploy.
  {
    const r1 = await fetch(app.base + "/api/themes");
    const r2 = await fetch(app.base + "/api/themes");
    const t1 = await fetch(app.base + "/api/themes/dracula");
    const t2 = await fetch(app.base + "/api/themes/dracula");
    const b1 = await r1.text(), b2 = await r2.text(), b3 = await t1.text(), b4 = await t2.text();
    rec("B-THM-003", b1 === b2 && b3 === b4, `list ${b1.length}B + theme ${b3.length}B byte-identical across reads`);
  }

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

  // ==================== wave-2 bundles (stage-3 extension) ====================
  const w2name = (p) => p + Math.random().toString(36).slice(2, 10);

  // ---------- test-results v1.2.0 ----------
  // B-RES-001: zen admitted-but-never-persisted, under repetition and
  // interleaving with persisted modes.
  await asyncProp("B-RES-001", fc.tuple(fc.integer({ min: 1, max: 4 }), fc.integer({ min: 0, max: 3 })),
    async ([nZen, nNormal]) => {
      const t = await app.signup(w2name("zen"));
      let zenOk = true;
      for (let i = 0; i < nZen; i++) {
        const z = await app.call("/api/results", { method: "POST", token: t,
          body: makeEvent({ mode: "zen", mode2: "", bailedOut: true, timestamp: 1752100000000 + i * 1000 }) });
        zenOk = zenOk && z.status === 200 && z.body?.stored === false && z.body?.verdict === "admit";
      }
      for (let i = 0; i < nNormal; i++) {
        await app.call("/api/results", { method: "POST", token: t,
          body: makeEvent({ wpm: 50 + i, timestamp: 1752100000000 + (nZen + i) * 1000 }) });
      }
      const hist = (await app.call("/api/results", { token: t })).body.results;
      return zenOk && hist.length === nNormal && hist.every((r) => r.mode !== "zen");
    }, 8);

  // B-RES-003 (amended): PB semantics with minThresholdFailed exclusions across
  // random sequences and tuples — final isPb state equals the strict-improvement
  // recomputation over unflagged, unbailed results.
  await asyncProp("B-RES-003", fc.array(fc.record({
    wpm: fc.double({ min: 40, max: 250, noNaN: true }),
    flagged: fc.boolean(),
    mode2: fc.constantFrom("15", "60"),
    punctuation: fc.boolean(),
  }), { minLength: 2, maxLength: 6 }), async (seq) => {
    const t = await app.signup(w2name("pb"));
    const best = new Map(); // tupleKey -> { wpm, id } of current expected PB holder
    const keyOf = (r) => ["time", r.mode2, "english", r.punctuation, false].join(" ");
    for (let i = 0; i < seq.length; i++) {
      const r = seq[i];
      const posted = await app.call("/api/results", { method: "POST", token: t,
        body: makeEvent({ wpm: r.wpm, mode2: r.mode2, punctuation: r.punctuation,
                          minThresholdFailed: r.flagged, timestamp: 1752200000000 + i * 1000 }) });
      if (posted.status !== 201) return false;
      if (!r.flagged) {
        const k = keyOf(r), cur = best.get(k);
        if (!cur || r.wpm > cur.wpm) best.set(k, { wpm: r.wpm, id: posted.body.id });
      }
    }
    const hist = (await app.call("/api/results", { token: t })).body.results;
    const pbs = (await app.call("/api/results/pbs", { token: t })).body.pbs;
    const expectedPbIds = new Set([...best.values()].map((b) => b.id));
    return hist.every((r) => r.isPb === expectedPbIds.has(r.id)) &&         // flags match recompute
           hist.filter((r) => r.minThresholdFailed).every((r) => !r.isPb) && // flagged never PB
           pbs.length === expectedPbIds.size && pbs.every((r) => expectedPbIds.has(r.id));
  }, 10);

  // B-RES-006(a): tag CRUD — case-insensitive uniqueness, per-user isolation.
  await asyncProp("B-RES-006", fc.stringOf(fc.constantFrom(..."abcDEFxyz0123 "), { minLength: 1, maxLength: 12 }),
    async (name) => {
      const tA = await app.signup(w2name("tgA"));
      const tB = await app.signup(w2name("tgB"));
      const c1 = await app.call("/api/results/tags", { method: "POST", token: tA, body: { name } });
      const c2 = await app.call("/api/results/tags", { method: "POST", token: tA, body: { name: name.toUpperCase() } });
      const c3 = await app.call("/api/results/tags", { method: "POST", token: tB, body: { name } }); // other user: fine
      const ren = await app.call(`/api/results/tags/${c1.body.id}`, { method: "PATCH", token: tA, body: { name: name + "x" } });
      return c1.status === 201 && c2.status === 409 && c3.status === 201 && ren.status === 200 && ren.body.name === name + "x";
    }, 10);

  // B-RES-006(b)(c)(d): assignment idempotency, intersection filter exactness,
  // delete-cascade — over a random 4x3 assignment matrix.
  await asyncProp("B-RES-006",
    fc.tuple(fc.array(fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }), { minLength: 4, maxLength: 4 }),
             fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 1, maxLength: 3 })),
    async ([matrix, filterIdxRaw]) => {
      const t = await app.signup(w2name("tgM"));
      const tags = [];
      for (let i = 0; i < 3; i++) {
        const c = await app.call("/api/results/tags", { method: "POST", token: t, body: { name: `m${i}-${Math.random().toString(36).slice(2, 6)}` } });
        tags.push(c.body.id);
      }
      const rids = [];
      for (let j = 0; j < 4; j++) {
        const p = await app.call("/api/results", { method: "POST", token: t,
          body: makeEvent({ wpm: 60 + j, timestamp: 1752300000000 + j * 1000 }) });
        rids.push(p.body.id);
        for (let i = 0; i < 3; i++) if (matrix[j][i]) {
          await app.call(`/api/results/${p.body.id}/tags`, { method: "POST", token: t, body: { tagId: tags[i] } });
          const again = await app.call(`/api/results/${p.body.id}/tags`, { method: "POST", token: t, body: { tagId: tags[i] } });
          if (again.body.tags.filter((x) => x === tags[i]).length !== 1) return false; // assign idempotent
        }
      }
      // (c) intersection exactness for a random non-empty filter
      const filterIdx = [...new Set(filterIdxRaw)];
      const qs = filterIdx.map((i) => tags[i]).join(",");
      const got = (await app.call(`/api/results?tags=${qs}`, { token: t })).body.results.map((r) => r.id);
      const want = rids.filter((_, j) => filterIdx.every((i) => matrix[j][i]));
      if (JSON.stringify([...got].sort()) !== JSON.stringify([...want].sort())) return false;
      // (d) delete-cascade on tag 0
      const del = await app.call(`/api/results/tags/${tags[0]}`, { method: "DELETE", token: t });
      const after = (await app.call("/api/results", { token: t })).body.results;
      return del.status === 200 && after.length === 4 && after.every((r) => !(r.tags ?? []).includes(tags[0]));
    }, 8);

  // B-RES-006(e): tag-scoped PB read equals the read-time derivation over
  // tagged results (flagged excluded); global isPb flags never mutate.
  await asyncProp("B-RES-006", fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }), async (mask) => {
    const t = await app.signup(w2name("tgP"));
    const tag = await app.call("/api/results/tags", { method: "POST", token: t, body: { name: "pb" + Math.random().toString(36).slice(2, 6) } });
    const tagId = tag.body.id;
    const wpms = [80, 120, 100, 200]; // same tuple; the 200 is flagged (excluded)
    const ids = [];
    for (let j = 0; j < 4; j++) {
      const p = await app.call("/api/results", { method: "POST", token: t,
        body: makeEvent({ wpm: wpms[j], minThresholdFailed: j === 3, timestamp: 1752400000000 + j * 1000 }) });
      ids.push(p.body.id);
      if (mask[j]) await app.call(`/api/results/${p.body.id}/tags`, { method: "POST", token: t, body: { tagId } });
    }
    const before = (await app.call("/api/results/pbs", { token: t })).body.pbs.map((r) => r.id);
    const scoped = (await app.call(`/api/results/pbs?tags=${tagId}`, { token: t })).body.pbs;
    const after = (await app.call("/api/results/pbs", { token: t })).body.pbs.map((r) => r.id);
    // validator-side derivation: best (max wpm, tie -> earlier ts) among tagged + eligible
    let wantId = null, wantWpm = -1;
    for (let j = 0; j < 4; j++) {
      if (!mask[j] || j === 3) continue; // untagged or flagged
      if (wpms[j] > wantWpm) { wantWpm = wpms[j]; wantId = ids[j]; }
    }
    const scopedOk = wantId === null ? scoped.length === 0
                                     : scoped.length === 1 && scoped[0].id === wantId;
    return scopedOk && JSON.stringify(before) === JSON.stringify(after);
  }, 8);

  // ---------- result-stats v1.0.0 (NEW bundle) ----------
  // B-STS-001: identical store state -> byte-identical read responses.
  await asyncProp("B-STS-001", fc.integer({ min: 0, max: 3 }), async (extra) => {
    const t = await app.signup(w2name("sd"));
    for (let i = 0; i <= extra; i++) {
      await app.call("/api/results", { method: "POST", token: t,
        body: makeEvent({ wpm: 70 + i, timestamp: 1752500000000 + i * 5000 }) });
    }
    for (const route of ["aggregates", "pbs", "wpm-series", "activity"]) {
      const r1 = await fetch(app.base + "/api/stats/" + route, { headers: { authorization: "Bearer " + t } });
      const r2 = await fetch(app.base + "/api/stats/" + route, { headers: { authorization: "Bearer " + t } });
      if ((await r1.text()) !== (await r2.text())) return false;
    }
    return true;
  }, 6);

  // B-STS-002: recompute-consistency — every served value equals the documented
  // recomputation formula over the stored set (validator-side recompute).
  const utcDay = (ts) => new Date(ts).toISOString().slice(0, 10);
  await asyncProp("B-STS-002", fc.array(fc.record({
    pair: fc.constantFrom(["time", "15"], ["time", "60"], ["words", "10"]),
    wpm: fc.double({ min: 40, max: 200, noNaN: true }),
    acc: fc.double({ min: 80, max: 100, noNaN: true }),
    testDuration: fc.integer({ min: 5, max: 60 }),
    day: fc.integer({ min: 0, max: 2 }),
    flagged: fc.boolean(),
    bailed: fc.boolean(),
  }), { minLength: 1, maxLength: 7 }), async (fx) => {
    const t = await app.signup(w2name("sr"));
    for (let i = 0; i < fx.length; i++) {
      const r = fx[i];
      const D = r.testDuration;
      const posted = await app.call("/api/results", { method: "POST", token: t,
        body: makeEvent({ mode: r.pair[0], mode2: r.pair[1], wpm: r.wpm, acc: r.acc,
          testDuration: D, charTotal: 7 * D, charStats: [7 * D, 0, 0, 0], rawWpm: 84, // anticheat-consistent
          minThresholdFailed: r.flagged, bailedOut: r.bailed,
          timestamp: 1752600000000 + r.day * 86400000 + i * 1000 }) });
      if (posted.status !== 201) return false;
    }
    const mine = (await app.call("/api/results", { token: t })).body.results
      .sort((a, b) => a.timestamp - b.timestamp); // insertion order (GET is newest-first);
    // summation order matches the server's commit order => float-identical aggregates
    // aggregates: per (mode,mode2): count, duration sum (NO afk subtraction), means
    const byPair = new Map();
    for (const r of mine) {
      const k = r.mode + " " + r.mode2;
      const a = byPair.get(k) ?? { mode: r.mode, mode2: r.mode2, n: 0, dur: 0, w: 0, c: 0 };
      a.n++; a.dur += r.testDuration; a.w += r.wpm; a.c += r.acc; byPair.set(k, a);
    }
    const wantAgg = { modes: [...byPair.values()]
      .sort((x, y) => x.mode < y.mode ? -1 : x.mode > y.mode ? 1 : x.mode2 < y.mode2 ? -1 : x.mode2 > y.mode2 ? 1 : 0)
      .map((a) => ({ mode: a.mode, mode2: a.mode2, testsCompleted: a.n,
                     timeTypingSeconds: round2(a.dur), avgWpm: round2(a.w / a.n), avgAcc: round2(a.c / a.n) })) };
    const gotAgg = (await app.call("/api/stats/aggregates", { token: t })).body;
    if (JSON.stringify(gotAgg) !== JSON.stringify(wantAgg)) return false;
    // pb-table: stored isPb flags (single authority), flagged/bailed excluded, tuple-sorted
    const wantPbs = { pbs: mine.filter((r) => r.isPb === true && !r.bailedOut && r.minThresholdFailed !== true)
      .map((r) => ({ mode: r.mode, mode2: r.mode2, language: r.language, punctuation: !!r.punctuation,
                     numbers: !!r.numbers, wpm: r.wpm, acc: r.acc, timestamp: r.timestamp,
                     _k: [r.mode, r.mode2, r.language, !!r.punctuation, !!r.numbers].join(" ") }))
      .sort((x, y) => (x._k < y._k ? -1 : x._k > y._k ? 1 : 0)).map(({ _k, ...rest }) => rest) };
    const gotPbs = (await app.call("/api/stats/pbs", { token: t })).body;
    if (JSON.stringify(gotPbs) !== JSON.stringify(wantPbs)) return false;
    // activity: UTC-day buckets, counts + duration sums, ascending
    const byDay = new Map();
    for (const r of mine) {
      const d = utcDay(r.timestamp);
      const a = byDay.get(d) ?? { date: d, testsCompleted: 0, timeTypingSeconds: 0 };
      a.testsCompleted++; a.timeTypingSeconds += r.testDuration; byDay.set(d, a);
    }
    const wantAct = { days: [...byDay.values()].sort((x, y) => (x.date < y.date ? -1 : 1))
      .map((a) => ({ date: a.date, testsCompleted: a.testsCompleted, timeTypingSeconds: round2(a.timeTypingSeconds) })) };
    const gotAct = (await app.call("/api/stats/activity", { token: t })).body;
    if (JSON.stringify(gotAct) !== JSON.stringify(wantAct)) return false;
    // wpm-series: (timestamp, wpm, acc) chronological ascending
    const wantSer = { series: mine.map((r) => ({ timestamp: r.timestamp, wpm: r.wpm, acc: r.acc }))
      .sort((x, y) => x.timestamp - y.timestamp) };
    const gotSer = (await app.call("/api/stats/wpm-series", { token: t })).body;
    return JSON.stringify(gotSer) === JSON.stringify(wantSer);
  }, 10);

  // ---------- wordlists v1.0.0 (NEW bundle) ----------
  const wlFiles = readdirSync(WORDLIST_ASSETS_DIR).filter((f) => f.endsWith(".json") && f !== "registry.json")
    .map((f) => f.replace(/\.json$/, ""));
  const wlRegistry = JSON.parse(readFileSync(join(WORDLIST_ASSETS_DIR, "registry.json"), "utf8"));
  const wlAssets = wlFiles.map((id) => ({ id, parsed: readWordlistAsset(id) }));
  // B-WL-001: boot admission fail-closed — the exact gate createApp runs at boot
  // (implementation/src/server/app.js throws on !ok). Positive control first.
  rec("B-WL-001", admitCatalog(wlRegistry, wlAssets).ok === true,
      `shipped catalog admitted (${wlFiles.length} assets, ${wlRegistry.lists.length} entries)`);
  await prop("B-WL-001", fc.array(fc.constantFrom(
    "dropEntry", "dropAsset", "emptyWords", "nonStringWord", "emptyWord",
    "missingLang", "langMismatch", "dupEntry", "emptyRegistry", "extraTopKey",
  ), { minLength: 1, maxLength: 3 }), (faults) => {
    const regC = JSON.parse(JSON.stringify(wlRegistry));
    const asC = wlAssets.map((a) => ({ id: a.id, parsed: JSON.parse(JSON.stringify(a.parsed)) }));
    for (const f of faults) {
      if (f === "dropEntry") regC.lists.splice(1, 1);
      if (f === "dropAsset") asC.splice(0, 1);
      if (f === "emptyWords") asC[0].parsed.words = [];
      if (f === "nonStringWord") asC[0].parsed.words = ["ok", 7];
      if (f === "emptyWord") asC[0].parsed.words = ["ok", ""];
      if (f === "missingLang") delete asC[0].parsed.language;
      if (f === "langMismatch") asC[0].parsed.language = "zz-mismatch";
      if (f === "dupEntry") regC.lists.push({ ...regC.lists[0] });
      if (f === "emptyRegistry") regC.lists = [];
      if (f === "extraTopKey") regC.extraTop = true;
    }
    return admitCatalog(regC, asC).ok === false; // exists invalid asset => admission fails
  });
  // B-WL-002: within-deploy byte determinism — repeat reads identical, and a
  // second booted instance of the same deploy serves identical bytes.
  await asyncProp("B-WL-002", fc.constantFrom(...wlFiles, "registry"), async (id) => {
    const p = id === "registry" ? "/wordlists/registry.json" : `/wordlists/${id}.json`;
    const a = await (await fetch(app.base + p)).text();
    const b = await (await fetch(app.base + p)).text();
    return a === b && a.length > 0;
  }, 8);
  {
    const app2 = await bootApp();
    try {
      let ok = true;
      for (const p of ["/wordlists/registry.json", ...wlFiles.map((id) => `/wordlists/${id}.json`)]) {
        const a = await (await fetch(app.base + p)).text();
        const b = await (await fetch(app2.base + p)).text();
        ok = ok && a === b;
      }
      rec("B-WL-002", ok, `registry + ${wlFiles.length} assets byte-identical across two booted instances`);
    } finally { app2.close(); }
  }

  // ---------- quote-library v1.1.0 ----------
  const allQuotes = async (params = "") => {
    const out = [];
    for (let page = 0; ; page++) {
      const r = await app.call(`/api/quotes?page=${page}${params}`);
      out.push(...(r.body?.quotes ?? []));
      if (out.length >= (r.body?.total ?? 0)) return out;
    }
  };
  // B-QT-006 (composite) — full tri-state lifecycle scenario over the API:
  // pending never served -> moderator approve (idempotent) -> served ->
  // refuse (idempotent, note persisted) -> persisted but never served again.
  // ONE moderator account for the whole suite (signup("moderator") yields the
  // implementation's moderator flag; a second signup would 409).
  const w2modReal = await app.signup("moderator");
  {
    const mod = w2modReal;
    const tU = await app.signup(w2name("qt6"));
    const text = "Wave two moderation lifecycle " + Math.random().toString(36).slice(2, 8);
    const sub = await app.call("/api/quotes", { method: "POST", token: tU, body: { text, source: "harness", language: "english" } });
    const qid = sub.body?.id;
    const pendingOk = sub.status === 201 && sub.body.state === "pending" && sub.body.approved === false;
    // (d) pending never served: random (seed sweep), search, favorites list
    await app.call("/api/quotes/favorites", { method: "POST", token: tU, body: { quoteId: qid } });
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const randPending = [];
    for (const s of seeds) randPending.push((await app.call(`/api/quotes/random?seed=${s}`)).body?.id);
    const searchPending = (await allQuotes()).map((q) => q.id);
    const favsPending = (await app.call("/api/quotes/favorites", { token: tU })).body.quotes.map((q) => q.id);
    const pendingNeverServed = !randPending.includes(qid) && !searchPending.includes(qid) && !favsPending.includes(qid);
    // (b) moderator-only transitions; non-moderator 403
    const forbidden = await app.call(`/api/quotes/${qid}/approve`, { method: "POST", token: tU, body: {} });
    const ap1 = await app.call(`/api/quotes/${qid}/approve`, { method: "POST", token: mod, body: {} });
    const ap2 = await app.call(`/api/quotes/${qid}/approve`, { method: "POST", token: mod, body: {} });
    const approveOk = forbidden.status === 403 &&
      ap1.status === 200 && ap1.body.state === "approved" && ap1.body.approved === true &&
      ap2.status === 200 && ap2.body.state === "approved"; // idempotent
    const servedNow = (await allQuotes()).map((q) => q.id).includes(qid);
    // (c) refuse: persisted WITH moderation metadata; never served again
    const rf1 = await app.call(`/api/quotes/${qid}/refuse`, { method: "POST", token: mod, body: { moderationNote: "off-topic" } });
    const rf2 = await app.call(`/api/quotes/${qid}/refuse`, { method: "POST", token: mod, body: {} });
    const refuseOk = rf1.status === 200 && rf1.body.state === "refused" && rf1.body.approved === false &&
      rf1.body.moderationNote === "off-topic" && rf2.status === 200 && rf2.body.state === "refused";
    const dupe = await app.call("/api/quotes", { method: "POST", token: tU, body: { text, source: "harness", language: "english" } });
    const persistedOk = dupe.status === 200 && dupe.body.id === qid && dupe.body.state === "refused"; // not deleted
    const randRefused = [];
    for (const s of seeds) randRefused.push((await app.call(`/api/quotes/random?seed=${s}`)).body?.id);
    const searchRefused = (await allQuotes()).map((q) => q.id);
    const favsRefused = (await app.call("/api/quotes/favorites", { token: tU })).body.quotes.map((q) => q.id);
    const refusedNeverServed = !randRefused.includes(qid) && !searchRefused.includes(qid) && !favsRefused.includes(qid);
    rec("B-QT-006", pendingOk && pendingNeverServed && approveOk && servedNow && refuseOk && persistedOk && refusedNeverServed,
        `pending:${pendingOk}/${pendingNeverServed} approve:${approveOk}/${servedNow} refuse:${refuseOk}/${persistedOk}/${refusedNeverServed}`);
  }
  // B-QT-006 property: under random moderation assignments, the served set
  // (search = every read path's shared derivation) is exactly the approved set;
  // pending/refused ids never appear in search or seeded random fetches.
  await asyncProp("B-QT-006", fc.array(fc.boolean(), { minLength: 2, maxLength: 3 }), async (approveMask) => {
    const t = await app.signup(w2name("qt6p"));
    const ids = [];
    for (let i = 0; i < approveMask.length; i++) {
      const s = await app.call("/api/quotes", { method: "POST", token: t,
        body: { text: `Tri-state ${Math.random().toString(36).slice(2, 10)} specimen ${i}`, source: "harness", language: "english" } });
      ids.push(s.body.id);
      const target = approveMask[i] ? "approve" : "refuse";
      const m = await app.call(`/api/quotes/${ids[i]}/${target}`, { method: "POST", token: w2modReal, body: {} });
      if (m.status !== 200) return false;
      // (a) approved <=> state==approved on every served object
      if ((m.body.approved === true) !== (m.body.state === "approved")) return false;
    }
    const served = new Set((await allQuotes()).map((q) => q.id));
    const seedPick = (await app.call("/api/quotes/random?seed=7")).body?.id;
    return approveMask.every((ap, i) => ap ? served.has(ids[i]) : !served.has(ids[i])) &&
           (seedPick === undefined || ids.every((id, i) => approveMask[i] || seedPick !== id));
  }, 6);

  // B-QT-007: rating-weighted selection — weight monotonic non-decreasing in the
  // rating average (documented default 2.5 for unrated), seeded reproducibility.
  prop("B-QT-007", fc.tuple(
    fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 0, maxLength: 5 }),
    fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 0, maxLength: 5 }),
  ), ([ra, rb]) => {
    const qa = { ratings: Object.fromEntries(ra.map((v, i) => ["u" + i, v])) };
    const qb = { ratings: Object.fromEntries(rb.map((v, i) => ["u" + i, v])) };
    const avg = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    const [aa, ab] = [avg(ra), avg(rb)];
    // documented weight function: average when rated, 2.5 default otherwise
    const wa = ratingWeight(qa), wb = ratingWeight(qb);
    const formulaOk = wa === (aa ?? 2.5) && wb === (ab ?? 2.5);
    return formulaOk && (aa === null || ab === null || (aa >= ab) === (wa >= wb) || aa === ab);
  });
  prop("B-QT-007", fc.tuple(fc.integer({ min: 1, max: 8 }), fc.integer({ min: 1, max: 2 ** 31 })), ([n, seed]) => {
    const pool = Array.from({ length: n }, (_, i) => ({ ratings: i % 2 ? { a: (i % 5) + 1 } : {} }));
    return weightedPickIndex(pool, seededRand(seed)) === weightedPickIndex(pool, seededRand(seed)); // reproducible
  });
  { // higher weight wins the MAJORITY of a deterministic seed sweep (no flake: fixed seeds)
    const pool = [{ ratings: { a: 5 } }, { ratings: { a: 1 } }];
    let hi = 0;
    for (let s = 1; s <= 300; s++) if (weightedPickIndex(pool, seededRand(s)) === 0) hi++;
    rec("B-QT-007", hi > 150, `rating-5 quote picked ${hi}/300 seeded draws (>50% vs rating-1)`);
  }
  { // HTTP end-to-end: served pick equals the validator-side weighted traversal
    const tR = await app.signup(w2name("qtr"));
    await app.call("/api/quotes/q1/rate", { method: "POST", token: tR, body: { rating: 5 } });
    await app.call("/api/quotes/q2/rate", { method: "POST", token: tR, body: { rating: 1 } });
    const pool = (await allQuotes("&language=english"));
    const weights = pool.map((q) => q.rating?.average ?? 2.5);
    let ok = pool.length >= 2;
    for (const s of [1, 2, 3, 5, 8, 13, 21, 34]) {
      const served = await app.call(`/api/quotes/random?seed=${s}`);
      const served2 = await app.call(`/api/quotes/random?seed=${s}`);
      if (served.body?.id !== served2.body?.id) { ok = false; break; } // same seed => same quote
      const rnd = seededRand(s);
      let r = rnd() * weights.reduce((a, b) => a + b, 0), idx = pool.length - 1;
      for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r < 0) { idx = i; break; } }
      if (served.body?.id !== pool[idx].id) { ok = false; break; }
    }
    rec("B-QT-007", ok, `seeded picks match validator-side weighted traversal over ${pool.length} approved quotes`);
  }

  // B-QT-008: favorites — idempotent add, approved-only list, per-user,
  // removal never deletes the quote.
  await asyncProp("B-QT-008", fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 3 }), async (rawIdx) => {
    const pool = await allQuotes("&language=english");
    if (pool.length < 2) return false;
    const t = await app.signup(w2name("fav"));
    const tOther = await app.signup(w2name("fav"));
    const picks = [...new Set(rawIdx.map((i) => pool[i % pool.length].id))];
    for (const id of picks) {
      await app.call("/api/quotes/favorites", { method: "POST", token: t, body: { quoteId: id } });
      await app.call("/api/quotes/favorites", { method: "POST", token: t, body: { quoteId: id } }); // idempotent
    }
    const list1 = (await app.call("/api/quotes/favorites", { token: t })).body.quotes.map((q) => q.id);
    const unknown = await app.call("/api/quotes/favorites", { method: "POST", token: t, body: { quoteId: "nope" } });
    const otherList = (await app.call("/api/quotes/favorites", { token: tOther })).body.quotes;
    if (!(list1.length === picks.length && picks.every((id) => list1.includes(id)))) return false;
    if (!(unknown.status === 404 && otherList.length === 0)) return false;
    // removal: quote gone from favorites but never deleted from the library
    await app.call(`/api/quotes/favorites/${picks[0]}`, { method: "DELETE", token: t });
    const list2 = (await app.call("/api/quotes/favorites", { token: t })).body.quotes.map((q) => q.id);
    const stillThere = (await allQuotes("&language=english")).map((q) => q.id).includes(picks[0]);
    return !list2.includes(picks[0]) && list2.length === picks.length - 1 && stillThere;
  }, 8);

  // B-QT-009: search/browse — approved-only subset matching both filters,
  // stable ordering across reads, documented pagination.
  await asyncProp("B-QT-009", fc.tuple(
    fc.constantFrom("the", "practice", "wave", "specimen", "zzz-no-match"),
    fc.constantFrom(undefined, "english"),
  ), async ([q, lang]) => {
    const params = `${lang ? "&language=" + lang : ""}${q ? "&q=" + encodeURIComponent(q) : ""}`;
    const r1 = await allQuotes(params);
    const r2 = await allQuotes(params); // stable across reads
    const needle = q.toLowerCase();
    return JSON.stringify(r1.map((x) => x.id)) === JSON.stringify(r2.map((x) => x.id)) &&
           r1.every((x) => x.state === "approved" && x.approved === true) &&
           r1.every((x) => x.text.toLowerCase().includes(needle)) &&
           (lang === undefined || r1.every((x) => x.language === lang));
  }, 8);
  { // pagination-total proof: push the approved pool past one page (50)
    const t = await app.signup(w2name("qtp"));
    const need = QUOTE_PAGE_SIZE + 5;
    let submitted = 0;
    for (let i = 0; i < need; i++) {
      const s = await app.call("/api/quotes", { method: "POST", token: t,
        body: { text: `Pagination specimen ${i} ${Math.random().toString(36).slice(2, 10)}`, source: "harness", language: "english" } });
      if (s.status === 201) { submitted++; await app.call(`/api/quotes/${s.body.id}/approve`, { method: "POST", token: w2modReal, body: {} }); }
    }
    const page0 = await app.call("/api/quotes?language=english&page=0");
    const page1 = await app.call("/api/quotes?language=english&page=1");
    const page2 = await app.call("/api/quotes?language=english&page=2");
    const badPage = await app.call("/api/quotes?page=abc");
    const ids0 = page0.body.quotes.map((q) => q.id), ids1 = page1.body.quotes.map((q) => q.id);
    const total = page0.body.total;
    const full = await allQuotes("&language=english");
    rec("B-QT-009",
        page0.body.quotes.length === QUOTE_PAGE_SIZE && page0.body.pageSize === QUOTE_PAGE_SIZE &&
        ids0.length + ids1.length + page2.body.quotes.length === total &&
        new Set([...ids0, ...ids1]).size === ids0.length + ids1.length && // disjoint
        JSON.stringify([...ids0, ...ids1, ...page2.body.quotes.map((q) => q.id)]) ===
          JSON.stringify(full.map((q) => q.id)) &&                        // pages concatenate to the stable full order
        total === full.length && badPage.status === 422,
        `submitted+approved ${submitted}; page0=50,page1=${ids1.length},page2=${page2.body.quotes.length},total=${total}; stable concat; bad page 422`);
  }

  // ---------- leaderboards v1.1.0 ----------
  // B-LB-001 (amended): eligibility chain — admit AND !bailedOut AND
  // !minThresholdFailed; one entry per user (their best eligible result).
  await asyncProp("B-LB-001", fc.tuple(
    fc.double({ min: 60, max: 150, noNaN: true }),
    fc.double({ min: 151, max: 240, noNaN: true }),
    fc.double({ min: 60, max: 150, noNaN: true }),
  ), async ([clean, flagged, bailed]) => {
    const name = w2name("lbe");
    const t = await app.signup(name);
    const now = Date.now();
    const posts = [
      await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ wpm: clean, timestamp: now - 3000 }) }),
      await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ wpm: flagged, minThresholdFailed: true, timestamp: now - 2000 }) }),
      await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ wpm: bailed, bailedOut: true, timestamp: now - 1000 }) }),
    ];
    if (posts.some((p) => p.status !== 201)) return false;
    const b = await app.call("/api/leaderboards/15");
    const mine = b.body.entries.filter((e) => e.name === name);
    return mine.length === 1 && mine[0].wpm === clean; // flagged/bailed higher wpms excluded
  }, 8);

  // B-LB-005: rolling-24h window edges under an injected clock — (T-24h, T].
  prop("B-LB-005", fc.tuple(
    fc.integer({ min: 10 ** 12, max: 2 * 10 ** 12 }),
    fc.integer({ min: -2 * DAILY_WINDOW_MS, max: 2 * DAILY_WINDOW_MS }),
  ), ([now, off]) => {
    const r = { timestamp: now - DAILY_WINDOW_MS + off };
    const want = r.timestamp > now - DAILY_WINDOW_MS && r.timestamp <= now;
    return inWindow(r, "daily", now) === want && inWindow(r, "alltime", now) === true;
  });
  { // explicit edge examples: exactly-24h-ago excluded; 1ms inside, at-T included; future excluded
    const now = 1753000000000;
    const mkR = (ts) => ({ timestamp: ts });
    rec("B-LB-005",
        inWindow(mkR(now - DAILY_WINDOW_MS), "daily", now) === false &&      // exactly 24h ago: excluded
        inWindow(mkR(now - DAILY_WINDOW_MS + 1), "daily", now) === true &&   // 1ms inside: included
        inWindow(mkR(now), "daily", now) === true &&                         // at T: included
        inWindow(mkR(now + 1), "daily", now) === false,                      // beyond T: excluded
        "(T-24h, T] edges exact under injected clock");
  }
  prop("B-LB-005", fc.array(fc.integer({ min: -2 * DAILY_WINDOW_MS, max: 2 * DAILY_WINDOW_MS }), { minLength: 1, maxLength: 12 }),
    (offs) => {
      const now = 1753000000000;
      const results = offs.map((off, i) => ({ mode: "time", mode2: "15", language: "english", uid: "u" + i, name: "n" + i,
        wpm: 100, rawWpm: 100, acc: 95, consistency: 80, testDuration: 15,
        anticheat: { decision: "admit" }, bailedOut: false, minThresholdFailed: false,
        timestamp: now - DAILY_WINDOW_MS + off }));
      const daily = computeBoard(results, { mode2: "15", language: "english", timeWindow: "daily", now });
      const alltime = computeBoard(results, { mode2: "15", language: "english", timeWindow: "alltime", now });
      const wantDaily = results.filter((r) => r.timestamp > now - DAILY_WINDOW_MS && r.timestamp <= now).length;
      return daily.entries.length === wantDaily && alltime.entries.length === results.length;
    });

  // B-LB-006: percentile = 100 * rank / totalEligibleUsers on every entry.
  prop("B-LB-006", fc.array(fc.tuple(fc.double({ min: 40, max: 200, noNaN: true }), fc.integer({ min: 0, max: 10 ** 12 })),
    { minLength: 1, maxLength: 25 }), (users) => {
    const now = 1753000000000;
    const results = users.map(([wpm, ts], i) => ({ mode: "time", mode2: "15", language: "english", uid: "u" + i, name: "n" + i,
      wpm, rawWpm: wpm, acc: 95, consistency: 80, testDuration: 15,
      anticheat: { decision: "admit" }, bailedOut: false, minThresholdFailed: false, timestamp: ts }));
    const { entries, totalEligibleUsers } = computeBoard(results, { mode2: "15", language: "english", timeWindow: "alltime", now });
    return totalEligibleUsers === users.length &&
           entries.every((e) => e.percentile === round2((100 * e.rank) / users.length)) &&
           (users.length !== 1 || entries[0].percentile === 100);
  });
  mutationSanity("B-LB-006",
    fc.integer({ min: 1, max: 50 }),
    (rank) => percentileOf(rank, 50) === round2((100 * rank) / 50),
    (rank) => percentileOf(rank, 50) === round2((100 * (rank - 1)) / 50)); // mutant: 0-based rank

  // B-LB-007: xp = documented deterministic function of (wpm, acc, testDuration);
  // read-time derivation, same result => same xp, monotonic non-decreasing.
  prop("B-LB-007", fc.tuple(
    fc.double({ min: 0, max: 300, noNaN: true }),
    fc.double({ min: 0, max: 100, noNaN: true }),
    fc.double({ min: 0, max: 600, noNaN: true }),
    fc.double({ min: 0, max: 50, noNaN: true }),
  ), ([wpm, acc, dur, delta]) => {
    const xp1 = xpOf({ wpm, acc, testDuration: dur });
    const xp2 = xpOf({ wpm, acc, testDuration: dur });
    const formula = xp1 === round2(wpm * (acc / 100) * (dur / 60));
    const mono = xpOf({ wpm: wpm + delta, acc, testDuration: dur }) >= xp1 &&
                 xpOf({ wpm, acc: Math.min(100, acc + delta), testDuration: dur }) >= xp1 &&
                 xpOf({ wpm, acc, testDuration: dur + delta }) >= xp1;
    return formula && xp1 === xp2 && mono; // same result => same xp
  });

  // ==================== wave-3 bundles (stage-3 extension) ====================
  // ---------- user-profile v1.0.0: module-level streak/level/edit properties ----------
  // Validator-side recompute of the sealed streak rules (B-PRO-002), written
  // from the invariant statement — the comparison target for computeStreaks.
  const streakRecompute = (days, now) => {
    const active = [...new Set((days ?? []).filter((d) => d.testsCompleted >= 1).map((d) => d.date))].sort();
    if (active.length === 0) return { current: 0, max: 0 };
    const ms = (d) => Date.parse(d + "T00:00:00.000Z");
    let max = 1, run = 1;
    for (let i = 1; i < active.length; i++) {
      run = ms(active[i]) - ms(active[i - 1]) === DAY_MS ? run + 1 : 1;
      if (run > max) max = run;
    }
    const last = active[active.length - 1];
    const alive = last === utcDay(now) || last === utcDay(now - DAY_MS);
    let cur = 0;
    if (alive) {
      cur = 1;
      for (let i = active.length - 1; i > 0 && ms(active[i]) - ms(active[i - 1]) === DAY_MS; i--) cur++;
    }
    return { current: cur, max };
  };
  // B-PRO-002: UTC-day boundary fuzz over random series × random instants
  prop("B-PRO-002", fc.tuple(
    fc.array(fc.tuple(fc.integer({ min: 0, max: 13 }), fc.integer({ min: 0, max: 3 })), { minLength: 0, maxLength: 10 }),
    fc.integer({ min: 0, max: 13 }), fc.integer({ min: 0, max: 86399999 }),
  ), ([entries, nowDay, nowFrac]) => {
    const base = Date.parse("2026-07-10T00:00:00.000Z");
    const dayStr = (d) => new Date(base + d * DAY_MS).toISOString().slice(0, 10);
    const series = entries.map(([d, n]) => ({ date: dayStr(d), testsCompleted: n, timeTypingSeconds: n * 15 }));
    const now = base + nowDay * DAY_MS + nowFrac;
    return JSON.stringify(computeStreaks(series, now)) === JSON.stringify(streakRecompute(series, now));
  });
  { // promoted edge corpus: midnight rollover, 1ms-before, dead-after-2-days, gaps
    const D = (n, c = 1) => ({ date: n, testsCompleted: c, timeTypingSeconds: 15 });
    const base = Date.parse("2026-07-10T00:00:00.000Z");
    const off = (d) => new Date(base + d * DAY_MS).toISOString().slice(0, 10);
    const series = (...os) => os.map((o) => D(off(o)));
    const now = Date.parse("2026-07-20T12:00:00.000Z");
    const midnight = Date.parse("2026-07-20T00:00:00.000Z");
    const cases = [
      [series(7, 8, 9), now, { current: 3, max: 3 }],
      [series(9, 10), now, { current: 2, max: 2 }],
      [series(7, 8), now, { current: 0, max: 2 }],               // dead: current 0, max stands
      [series(1, 2, 3, 6, 8, 9, 10), now, { current: 3, max: 3 }], // gap breaks current
      [[], now, { current: 0, max: 0 }],
      [[D(off(9), 0)], now, { current: 0, max: 0 }],              // testsCompleted 0 = inactive
      [series(9), midnight, { current: 1, max: 1 }],              // yesterday alive at midnight
      [series(8), midnight, { current: 0, max: 1 }],              // day-before dead at midnight
      [series(9), midnight - 1, { current: 1, max: 1 }],          // 1ms before: still "today"
    ];
    const bad = cases.filter(([s, n, want]) => JSON.stringify(computeStreaks(s, n)) !== JSON.stringify(want));
    rec("B-PRO-002", bad.length === 0, `${cases.length - bad.length}/${cases.length} edge cases exact (midnight/aliveness/gaps)`);
  }
  // B-PRO-003: level = documented monotonic curve over total xp, recomputed
  prop("B-PRO-003", fc.tuple(fc.double({ min: 0, max: 1e6, noNaN: true }), fc.double({ min: 0, max: 1e6, noNaN: true })),
    ([a, b]) => {
      const [x, y] = a >= b ? [a, b] : [b, a];
      const lx = levelFor(x), ly = levelFor(y);
      return lx >= ly && Number.isInteger(lx) && lx >= 0 && levelFor(x) === lx &&
             lx === Math.floor(Math.sqrt(x / XP_PER_LEVEL_SQ)); // documented delegated curve
    });
  rec("B-PRO-003",
      levelFor(0) === 0 && levelFor(XP_PER_LEVEL_SQ - 0.01) === 0 && levelFor(XP_PER_LEVEL_SQ) === 1 &&
      levelFor(4 * XP_PER_LEVEL_SQ) === 2 && levelFor(100 * XP_PER_LEVEL_SQ) === 10,
      "curve anchors: level n requires xp >= 10*n^2 (0,1,2,10)");
  // B-PRO-004: strict edit validation — any single fault poisons the whole update
  await prop("B-PRO-004", fc.tuple(
    fc.constantFrom("bio", "avatarUrl", "website", "twitter", "isPublic", "unknownKey", "valid"),
    fc.boolean(),
  ), ([field, corrupt]) => {
    const patch = { bio: "ok", avatarUrl: "https://cdn.example.com/a.png",
                    socials: { website: "https://me.example.com", twitter: "@t" }, isPublic: true };
    if (corrupt) {
      if (field === "bio") patch.bio = "x".repeat(501);
      if (field === "avatarUrl") patch.avatarUrl = "http://insecure.example.com";
      if (field === "website") patch.socials.website = "http://nope";
      if (field === "twitter") patch.socials.twitter = "t".repeat(201);
      if (field === "isPublic") patch.isPublic = "yes";
      if (field === "unknownKey") patch.role = "admin";
      if (field === "valid") patch.bio = "still fine";
    }
    if (field === "valid") return validateProfileUpdate(patch).ok === true; // control: valid always passes
    return validateProfileUpdate(patch).ok === !corrupt;
  });

  // ---------- public-api v1.0.0: module-level key/limiter properties ----------
  prop("B-API-001", fc.constant(null), () => {
    const m = mintApeKey();
    return /^pdd_[0-9a-f]{32}$/.test(m.plaintext) && /^[0-9a-f]{32}$/.test(m.salt) &&
           m.hash === hashKey(m.salt, m.plaintext) && m.hash.length === 64;
  });
  // B-API-002: correctness over random positions + constant-time statistical gate
  const authRecs = Array.from({ length: 50 }, (_, i) => {
    const m = mintApeKey();
    return { id: "k" + i, hash: m.hash, salt: m.salt, enabled: i % 7 !== 0, plaintext: m.plaintext };
  });
  prop("B-API-002", fc.tuple(fc.integer({ min: 0, max: 49 }), fc.constantFrom("hit", "miss", "disabled-hit")),
    ([pos, kind]) => {
      const rec = { ...authRecs[pos] };
      const presented = kind === "miss" ? rec.plaintext.slice(0, -1) + (rec.plaintext.endsWith("0") ? "1" : "0")
                                        : rec.plaintext;
      const recs = authRecs.map((r) => (r.id === rec.id ? { ...r, enabled: kind !== "disabled-hit" } : r));
      const got = authenticateApeKey(recs, presented);
      return kind === "hit" ? got?.id === rec.id : got === null; // miss and revoked => no auth
    });
  { // statistical gate (validator-owned band): median(match@first) and
    // median(match@last) within 3x of median(miss) over N=200 stored keys —
    // an early-exit implementation diverges >50x on the first-position match.
    const N = 200;
    const recs = Array.from({ length: N }, (_, i) => { const m = mintApeKey(); return { id: "k" + i, hash: m.hash, salt: m.salt, enabled: true, plaintext: m.plaintext }; });
    const med = (presented) => {
      const xs = [];
      for (let i = 0; i < 30; i++) {
        const t0 = process.hrtime.bigint();
        authenticateApeKey(recs, presented);
        xs.push(Number(process.hrtime.bigint() - t0));
      }
      xs.sort((a, b) => a - b);
      return xs[Math.floor(xs.length / 2)];
    };
    const miss = med(APEKEY_PREFIX + "f".repeat(32));
    const first = med(recs[0].plaintext), last = med(recs[N - 1].plaintext);
    rec("B-API-002", first >= miss / 3 && first <= miss * 3 && last >= miss / 3 && last <= miss * 3,
        `medians over 30 reps, N=200: miss=${miss}ns first=${first}ns last=${last}ns (3x band; early-exit would be >50x)`);
  }
  // B-API-005 module: fixed-window accounting vs a validator-side model
  await prop("B-API-005", fc.array(fc.tuple(
    fc.constantFrom("key", "ip"), fc.constantFrom("a", "b", "c"), fc.integer({ min: 0, max: 1200 }),
  ), { minLength: 1, maxLength: 40 }), (ops) => {
    const lim = createRateLimiter({ windowMs: 1000, keyLimit: 3, ipLimit: 5 });
    let now = 10000, swept = null;
    const counts = new Map();
    for (const [dim, id, dt] of ops) {
      now += dt;
      const w = Math.floor(now / 1000);
      if (swept !== w) { for (const k of [...counts.keys()]) if (!k.endsWith(":" + w)) counts.delete(k); swept = w; }
      const ck = `${dim}:${id}:${w}`;
      const n = (counts.get(ck) ?? 0) + 1;
      counts.set(ck, n);
      const limit = dim === "ip" ? 5 : 3;
      const got = lim.consume(dim, id, now);
      if (got.allowed !== (n <= limit) || got.limit !== limit) return false;
      if (got.resetMs !== (w + 1) * 1000 || got.retryAfterMs !== Math.max(0, (w + 1) * 1000 - now)) return false;
    }
    return true;
  });
  rec("B-API-005",
      RATE_IP_LIMIT >= RATE_KEY_LIMIT && RATE_WINDOW_MS === 60000,
      `documented constants: ${RATE_KEY_LIMIT}/key + ${RATE_IP_LIMIT}/ip per ${RATE_WINDOW_MS}ms (ip >= key)`);

  // ---------- user-profile v1.0.0: HTTP composition properties ----------
  // B-PRO-001: served derived values equal their sealed sources, recomputed per read
  await asyncProp("B-PRO-001", fc.array(fc.record({
    pair: fc.constantFrom(["time", "15"], ["time", "60"], ["words", "10"]),
    wpm: fc.double({ min: 40, max: 200, noNaN: true }),
    acc: fc.double({ min: 80, max: 100, noNaN: true }),
    testDuration: fc.integer({ min: 5, max: 60 }),
    day: fc.integer({ min: 0, max: 1 }),
    flagged: fc.boolean(), bailed: fc.boolean(),
  }), { minLength: 1, maxLength: 5 }), async (fx) => {
    const t = await app.signup(w2name("pro"));
    const base = Date.now() - 2 * 86400000;
    for (let i = 0; i < fx.length; i++) {
      const r = fx[i], D = r.testDuration;
      const p = await app.call("/api/results", { method: "POST", token: t,
        body: makeEvent({ mode: r.pair[0], mode2: r.pair[1], wpm: r.wpm, acc: r.acc, testDuration: D,
          charTotal: 7 * D, charStats: [7 * D, 0, 0, 0], rawWpm: 84,
          minThresholdFailed: r.flagged, bailedOut: r.bailed, timestamp: base + r.day * 86400000 + i * 1000 }) });
      if (p.status !== 201) return false;
    }
    const [prof, accP, pbs, agg, hist, act] = await Promise.all([
      app.call("/api/profile", { token: t }), app.call("/api/account/profile", { token: t }),
      app.call("/api/stats/pbs", { token: t }), app.call("/api/stats/aggregates", { token: t }),
      app.call("/api/results", { token: t }), app.call("/api/stats/activity", { token: t }),
    ]);
    const b = prof.body;
    const wantXp = round2(hist.body.results.reduce((s, r) => s + round2(r.wpm * (r.acc / 100) * (r.testDuration / 60)), 0));
    const composed = b.name === accP.body.name && b.addedAt === accP.body.addedAt &&
      JSON.stringify(b.pbs) === JSON.stringify(pbs.body) &&
      JSON.stringify(b.aggregates) === JSON.stringify(agg.body) &&
      b.xp === wantXp && b.level === Math.floor(Math.sqrt(wantXp / XP_PER_LEVEL_SQ)) &&
      JSON.stringify(b.streaks) === JSON.stringify(streakRecompute(act.body.days, Date.now()));
    if (!composed) return false;
    // no cached derived state: a source change is reflected on the NEXT read
    const extra = makeEvent({ wpm: 66, timestamp: Date.now() });
    await app.call("/api/results", { method: "POST", token: t, body: extra });
    const prof2 = (await app.call("/api/profile", { token: t })).body;
    return prof2.xp === round2(wantXp + round2(66 * (extra.acc / 100) * (extra.testDuration / 60)));
  }, 6);

  // B-PRO-002: HTTP streak derivation under an INJECTED clock (activity series
  // is the single source of truth)
  {
    const T0 = Date.parse("2026-07-20T12:00:00.000Z");
    const stkApp = await bootApp({ clockMs: T0 });
    try {
      const t = await stkApp.signup(w2name("stk"));
      for (const [d, i] of [["2026-07-17", 1], ["2026-07-18", 2], ["2026-07-19", 3]]) {
        await stkApp.call("/api/results", { method: "POST", token: t,
          body: makeEvent({ wpm: 70, timestamp: Date.parse(d + "T08:00:00.000Z") }) });
      }
      const p1 = (await stkApp.call("/api/profile", { token: t })).body;
      stkApp.setNow(T0 + 2 * DAY_MS); // two days later: streak dead
      const p2 = (await stkApp.call("/api/profile", { token: t })).body;
      await stkApp.call("/api/results", { method: "POST", token: t,
        body: makeEvent({ wpm: 71, timestamp: T0 + 2 * DAY_MS }) }); // revive on the new today
      const p3 = (await stkApp.call("/api/profile", { token: t })).body;
      const act = (await stkApp.call("/api/stats/activity", { token: t })).body;
      rec("B-PRO-002",
          JSON.stringify(p1.streaks) === '{"current":3,"max":3}' &&
          JSON.stringify(p2.streaks) === '{"current":0,"max":3}' &&
          JSON.stringify(p3.streaks) === '{"current":1,"max":3}' &&
          JSON.stringify(p3.streaks) === JSON.stringify(streakRecompute(act.days, stkApp.getNow())),
          "alive@yesterday {3,3} -> +2d dead {0,3} -> revive {1,3}; equals activity-series derivation");
    } finally { stkApp.close(); }
  }

  // B-PRO-004 HTTP: all-or-nothing — invalid updates write ZERO fields
  await asyncProp("B-PRO-004", fc.constantFrom("bio", "avatarUrl", "website", "twitter", "isPublic", "unknownKey", "valid"),
    async (field) => {
      const t = await app.signup(w2name("edt"));
      const patch = { bio: "ok" };
      if (field === "bio") patch.bio = "x".repeat(501);
      if (field === "avatarUrl") patch.avatarUrl = "http://insecure.example.com";
      if (field === "website") patch.socials = { website: "http://nope" };
      if (field === "twitter") patch.socials = { twitter: "t".repeat(201) };
      if (field === "isPublic") patch.isPublic = 1;
      if (field === "unknownKey") { patch.bio = "fine"; patch.role = "admin"; }
      if (field === "valid") patch.bio = "legit " + w2name("");
      const before = (await app.call("/api/profile", { token: t })).body.publicFields;
      const r = await app.call("/api/profile", { method: "PATCH", token: t, body: patch });
      const after = (await app.call("/api/profile", { token: t })).body.publicFields;
      return field === "valid"
        ? r.status === 200 && after.bio === patch.bio
        : r.status === 422 && JSON.stringify(after) === JSON.stringify(before); // zero written
    }, 14);

  // B-PRO-005: public read shape + private ≡ unknown (modulo correlation_id)
  {
    const name = w2name("vis");
    const t = await app.signup(name);
    await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ wpm: 77, timestamp: Date.now() }) });
    const pub = await app.call("/api/profile/" + name.toUpperCase()); // case-insensitive
    const flat = JSON.stringify(pub.body ?? {});
    const leakKeys = ["uid", "pw", "password", "email", "token", "moderator", "isPublic", "scopes"];
    const shapeOk = pub.status === 200 && leakKeys.every((k) => !(k in pub.body) && !(k in (pub.body.publicFields ?? {}))) &&
                    !flat.includes("scrypt") && !flat.includes('"hash"') && !flat.includes("pdd_");
    const unknown = await app.call("/api/profile/nope-" + w2name(""));
    await app.call("/api/profile", { method: "PATCH", token: t, body: { isPublic: false } });
    const priv = await app.call("/api/profile/" + name);
    const strip = (r) => { const c = JSON.parse(JSON.stringify(r.body ?? {})); delete c?.error?.correlation_id; return c; };
    const indistinguishable = priv.status === 404 && unknown.status === 404 &&
      priv.body.error.code === unknown.body.error.code &&
      priv.body.error.message === unknown.body.error.message &&
      JSON.stringify(strip(priv)) === JSON.stringify(strip(unknown));
    const own = await app.call("/api/profile", { token: t });
    await app.call("/api/profile", { method: "PATCH", token: t, body: { isPublic: true } });
    const backAgain = await app.call("/api/profile/" + name);
    rec("B-PRO-005", shapeOk && indistinguishable && own.status === 200 && backAgain.status === 200,
        `public shape clean (${shapeOk}); private≡unknown modulo correlation_id (${indistinguishable}); owner read unaffected`);
  }

  // ---------- public-api v1.0.0: HTTP lifecycle / scope / parity (dedicated app) ----------
  // Dedicated instance: API-surface rate budgets are finite per key+IP — the
  // checks below mint fresh keys and use per-cluster x-forwarded-for isolation.
  const apiApp = await bootApp();
  try {
    // B-API-001: format, show-once, salted hash at rest, NO plaintext anywhere on disk
    {
      const t = await apiApp.signup(w2name("key"));
      const c = await apiApp.call("/api/apekeys", { method: "POST", token: t, body: { name: "ci", scopes: ["results:read"] } });
      const key = c.body.key;
      const list = await apiApp.call("/api/apekeys", { token: t });
      const files = readdirSync(apiApp.dataDir);
      const diskLeaks = files.filter((f) => readFileSync(join(apiApp.dataDir, f), "utf8").includes(key));
      const stored = JSON.parse(readFileSync(join(apiApp.dataDir, "apekeys.json"), "utf8")).apekeys[0];
      rec("B-API-001",
          /^pdd_[0-9a-f]{32}$/.test(key) && c.status === 201 &&
          !JSON.stringify(list.body).includes(key) &&          // show-once: list never carries it
          diskLeaks.length === 0 &&                            // plaintext persisted NOWHERE
          stored.hash === hashKey(stored.salt, key) &&         // salted hash verifies at rest
          !("plaintext" in stored) && !("key" in stored),
          `format ok; show-once; 0/${files.length} store files carry plaintext; salted sha256 at rest`);
      // revoke: idempotent + fail-closed; revoked ≡ unknown; foreign 404
      const d1 = await apiApp.call(`/api/apekeys/${stored.id}`, { method: "DELETE", token: t });
      const d2 = await apiApp.call(`/api/apekeys/${stored.id}`, { method: "DELETE", token: t });
      const after = await apiApp.call("/api/public/results", { token: key, headers: { "x-forwarded-for": "10.7.0.1" } });
      const unknownK = await apiApp.call("/api/public/results", { token: APEKEY_PREFIX + "0".repeat(32), headers: { "x-forwarded-for": "10.7.0.2" } });
      const t2 = await apiApp.signup(w2name("key"));
      const foreign = await apiApp.call(`/api/apekeys/${stored.id}`, { method: "DELETE", token: t2 });
      rec("B-API-001", d1.status === 200 && d1.body.enabled === false && d2.status === 200 &&
          after.status === 401 && after.body.error.code === unknownK.body.error.code && foreign.status === 404,
          "revoke idempotent; revoked key ≡ unknown key (401); foreign revoke 404");
    }
    // B-API-002: domain separation — neither domain accepts the other's credential
    {
      const t = await apiApp.signup(w2name("dom"));
      const key = (await apiApp.call("/api/apekeys", { method: "POST", token: t, body: { name: "k", scopes: SCOPES } })).body.key;
      const onApi = await apiApp.call("/api/public/results", { token: t, headers: { "x-forwarded-for": "10.7.1.1" } });
      const onSession = [];
      for (const p of ["/api/results", "/api/config", "/api/stats/aggregates", "/api/profile", "/api/apekeys"]) {
        onSession.push(await apiApp.call(p, { token: key }));
      }
      rec("B-API-002", onApi.status === 401 && onSession.every((r) => r.status === 401),
          `session token on API surface -> 401; ApeKey on 5 session-gated routes -> 401`);
    }
    // B-API-003: scope enforcement fail-closed over the full surface matrix.
    // Per-run XFF isolation must be GUARANTEED-distinct (the per-IP window is
    // 120/60s on this wall-clock app; random subnets collide often enough to
    // flake) — a suite-local counter gives every run its own /16.
    let xffSeq = 0;
    const runXff = () => ({ "x-forwarded-for": `10.${16 + Math.floor(xffSeq / 250)}.${xffSeq++ % 250}.1` });
    await asyncProp("B-API-003", fc.subarray(SCOPES, { minLength: 1 }), async (scopes) => {
      const t = await apiApp.signup(w2name("scp"));
      const key = (await apiApp.call("/api/apekeys", { method: "POST", token: t, body: { name: "n", scopes } })).body.key;
      const xff = runXff();
      const SURFACE = { "results:read": ["/api/public/results", "/api/public/results/pbs"],
        "stats:read": ["/api/public/stats/aggregates", "/api/public/stats/activity"],
        "profile:read": ["/api/public/profile"], "quotes:read": ["/api/public/quotes", "/api/public/quotes/random"] };
      for (const [scope, eps] of Object.entries(SURFACE)) {
        for (const ep of eps) {
          const r = await apiApp.call(ep, { token: key, headers: xff });
          if (scopes.includes(scope) ? r.status !== 200 : r.status !== 403 || r.body?.error?.code !== "forbidden") return false;
        }
      }
      return true;
    }, 8);
    // B-API-004: mirror parity — recompute-equality vs the source surfaces over
    // a fixture matrix incl. zen (absent), flagged (persisted, excluded from PBs),
    // bailed, and the tag-filter ride-along
    await asyncProp("B-API-004", fc.array(fc.record({
      pair: fc.constantFrom(["time", "15"], ["time", "60"], ["words", "10"]),
      wpm: fc.double({ min: 40, max: 200, noNaN: true }),
      kind: fc.constantFrom("clean", "flagged", "bailed", "zen"),
      day: fc.integer({ min: 0, max: 1 }),
    }), { minLength: 2, maxLength: 6 }), async (fx) => {
      const t = await apiApp.signup(w2name("par"));
      const base = Date.now() - 2 * 86400000;
      for (let i = 0; i < fx.length; i++) {
        const r = fx[i];
        const ev = r.kind === "zen"
          ? makeEvent({ mode: "zen", mode2: "", bailedOut: true, timestamp: base + i * 1000 })
          : makeEvent({ mode: r.pair[0], mode2: r.pair[1], wpm: r.wpm,
              minThresholdFailed: r.kind === "flagged", bailedOut: r.kind === "bailed",
              timestamp: base + r.day * 86400000 + i * 1000 });
        await apiApp.call("/api/results", { method: "POST", token: t, body: ev });
      }
      const key = (await apiApp.call("/api/apekeys", { method: "POST", token: t, body: { name: "f", scopes: SCOPES } })).body.key;
      const xff = runXff();
      const eps = ["/results", "/results/pbs", "/stats/aggregates", "/stats/pbs", "/stats/activity",
                   "/stats/wpm-series", "/profile"];
      for (const ep of eps) {
        const viaSession = await apiApp.call("/api" + ep, { token: t });
        const viaKey = await apiApp.call("/api/public" + ep, { token: key, headers: xff });
        if (viaKey.status !== 200 || JSON.stringify(viaKey.body) !== JSON.stringify(viaSession.body)) return false;
      }
      const qs = await apiApp.call("/api/quotes?language=english", { token: t });
      const qk = await apiApp.call("/api/public/quotes?language=english", { token: key, headers: xff });
      const rs = await apiApp.call("/api/quotes/random?seed=42");
      const rk = await apiApp.call("/api/public/quotes/random?seed=42", { token: key, headers: xff });
      if (JSON.stringify(qk.body) !== JSON.stringify(qs.body) || JSON.stringify(rk.body) !== JSON.stringify(rs.body)) return false;
      const hist = (await apiApp.call("/api/public/results", { token: key, headers: xff })).body.results;
      if (hist.some((r) => r.mode === "zen") || hist.length !== fx.filter((r) => r.kind !== "zen").length) return false;
      const tag = await apiApp.call("/api/results/tags", { method: "POST", token: t, body: { name: "T" + w2name("") } });
      await apiApp.call(`/api/results/${hist[0].id}/tags`, { method: "POST", token: t, body: { tagId: tag.body.id } });
      const fs = await apiApp.call("/api/results?tags=" + tag.body.id, { token: t });
      const fk = await apiApp.call("/api/public/results?tags=" + tag.body.id, { token: key, headers: xff });
      return JSON.stringify(fk.body) === JSON.stringify(fs.body);
    }, 6);

    // B-API-005: per-key fixed window over HTTP under the injected clock —
    // 429 envelope + retry metadata; window-edge reset; keys independent
    {
      const T0 = Date.parse("2026-07-20T12:00:00.000Z");
      const rlApp = await bootApp({ clockMs: T0 });
      try {
        const t = await rlApp.signup(w2name("rl"));
        const key = (await rlApp.call("/api/apekeys", { method: "POST", token: t, body: { name: "k", scopes: SCOPES } })).body.key;
        let pass = 0;
        for (let i = 0; i < RATE_KEY_LIMIT; i++) {
          const r = await rlApp.call("/api/public/quotes?x=" + i, { token: key });
          if (r.status === 200) pass++;
        }
        const over = await rlApp.call("/api/public/quotes", { token: key });
        const retryAfter = Number(over.headers.get("retry-after"));
        const meta = over.status === 429 && over.body?.error?.code === "rate_limited" &&
          retryAfter >= 1 && retryAfter <= RATE_WINDOW_MS / 1000 &&
          over.headers.get("x-ratelimit-limit") === String(RATE_KEY_LIMIT) &&
          over.headers.get("x-ratelimit-remaining") === "0" &&
          Number(over.headers.get("x-ratelimit-reset")) > T0 / 1000;
        rlApp.setNow(T0 + 1000); // same window: still limited
        const still = await rlApp.call("/api/public/quotes", { token: key });
        const key2 = (await rlApp.call("/api/apekeys", { method: "POST", token: t, body: { name: "k2", scopes: SCOPES } })).body.key;
        const otherKey = await rlApp.call("/api/public/quotes", { token: key2 });
        rlApp.setNow(T0 - (T0 % RATE_WINDOW_MS) + RATE_WINDOW_MS + 1); // next window +1ms
        const reset = await rlApp.call("/api/public/quotes", { token: key });
        rec("B-API-005",
            pass === RATE_KEY_LIMIT && meta && still.status === 429 && otherKey.status === 200 && reset.status === 200,
            `${pass}/${RATE_KEY_LIMIT} pass -> 429 (Retry-After=${retryAfter}s, limit header, reset epoch); same-window 429; 2nd key ok; window-edge reset`);
      } finally { rlApp.close(); }
    }
  } finally { apiApp.close(); }
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
