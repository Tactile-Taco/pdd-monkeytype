// PDD Validator Loop — Layer 2: BEHAVIORAL (property-based tests + mutation sanity).
// Every test carries invariant lineage. Emits harness/out/behavioral.json.
import fc from "fast-check";
import { writeJson } from "./evidence.mjs";
import { bootApp, makeEvent, SEALED_CONFIG_DEFAULTS } from "./boot.mjs";
import { round2, calculateWpm, kogasa, consistencyOf, mean, stdDev } from "../implementation/src/shared/stats.js";
import { countChars } from "../implementation/src/engine/countChars.js";
import { TypingSession } from "../implementation/src/engine/session.js";
import { generateWords, decorateWords, mulberry32 } from "../implementation/src/engine/words.js";
import { internalWordlist } from "../implementation/src/engine/wordlist.js";
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
  const wl = internalWordlist({ language: "english", count: 8, seed, punctuation: p, numbers: n });
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
    const wl = internalWordlist({ language: "english", count: 6, seed, punctuation: cfg.punctuation, numbers: cfg.numbers });
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
