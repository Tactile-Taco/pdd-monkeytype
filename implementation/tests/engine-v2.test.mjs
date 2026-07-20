// Focused unit/property tests for typing-test-engine v2.0.0 semantics.
// Every test carries invariant lineage. Run: node --test implementation/tests/
// (The formal validator-suite extension for v2 invariants is a later stage;
// these are the candidate's own cheap checks.)
import test from "node:test";
import assert from "node:assert/strict";
import { TypingSession } from "../src/engine/session.js";
import { countChars } from "../src/engine/countChars.js";
import { mulberry32, generateWords, decorateWords } from "../src/engine/words.js";
import { validateWordlist, internalWordlist, isValidWordlist } from "../src/engine/wordlist.js";
import { charsEqual, wordMatches, stripDiacritics } from "../src/engine/lazy.js";

// helpers
const typeWord = (s, word, t0 = 1000, dt = 100) => {
  let t = t0;
  for (const ch of word) { s.feed({ t, type: "char", value: ch }); t += dt; }
  return t;
};
const completeWordsSession = (words, config = {}) => {
  const s = new TypingSession({ mode: "words", mode2: String(words.length), words, config, now: () => 0 });
  let t = 1000;
  for (const w of words) { t = typeWord(s, w, t); s.feed({ t, type: "space" }); t += 100; }
  return s;
};

// ---------- S-ENG-004: abstract wordlist handshake (fail-closed injection) ----------
test("S-ENG-004: conforming injected wordlist starts; language echoed", () => {
  const wl = { id: "test/1", language: "klingon", words: ["qa", "mey"] };
  assert.deepEqual(validateWordlist(wl), []);
  const s = new TypingSession({ mode: "words", mode2: "2", wordlist: wl });
  assert.deepEqual(s.words, ["qa", "mey"]);
  assert.equal(s.config.language, "klingon"); // adopted from the provider unless overridden
});
test("S-ENG-004: non-conforming lists rejected before the first keystroke", () => {
  const bad = [
    null, {}, { language: "" }, { language: "en" },
    { language: "en", words: [] }, { language: "en", words: ["ok", ""] },
    { language: "en", words: ["ok"], id: "x".repeat(101) },
    { language: "en", words: ["ok"], ordered: "yes" },
  ];
  for (const wl of bad) {
    assert.ok(!isValidWordlist(wl), JSON.stringify(wl));
    assert.throws(() => new TypingSession({ mode: "words", mode2: "1", wordlist: wl }), /wordlist rejected/);
  }
  // `undefined` = handshake path not taken (legacy words path) -> still refuses to start
  assert.throws(() => new TypingSession({ mode: "words", mode2: "1", wordlist: undefined }));
});
test("S-ENG-004: internal default provider emits conforming lists (deterministic)", () => {
  const a = internalWordlist({ language: "english", count: 25, seed: 42 });
  const b = internalWordlist({ language: "english", count: 25, seed: 42 });
  assert.ok(isValidWordlist(a));
  assert.equal(a.words.length, 25);
  assert.deepEqual(a, b); // B-ENG-006 determinism
});

// ---------- S-ENG-003: custom-mode start config ----------
test("S-ENG-003: custom target must be a positive integer; unit required", () => {
  assert.throws(() => new TypingSession({ mode: "custom", mode2: "0", config: { unit: "seconds" } }));
  assert.throws(() => new TypingSession({ mode: "custom", mode2: "-3", config: { unit: "words" } }));
  assert.throws(() => new TypingSession({ mode: "custom", mode2: "1.5", config: { unit: "seconds" } }));
  assert.throws(() => new TypingSession({ mode: "custom", mode2: "10" })); // no unit
  assert.throws(() => new TypingSession({ mode: "custom", mode2: "10", config: { unit: "minutes" } }));
  assert.doesNotThrow(() => new TypingSession({ mode: "custom", mode2: "10", words: ["a"], config: { unit: "seconds" } }));
});

// ---------- B-ENG-007: custom completion + echo; zen manual end ----------
test("B-ENG-007: custom/seconds completes at timer expiry and echoes unit", () => {
  const s = new TypingSession({ mode: "custom", mode2: "5", words: generateWords(50, 3),
                                config: { unit: "seconds" }, now: () => 0 });
  s.feed({ t: 0, type: "char", value: "a" });
  s.feed({ t: 4999, type: "char", value: "b" });
  assert.equal(s.completed, false);
  s.feed({ t: 5000, type: "char", value: "c" });
  assert.equal(s.completed, true);
  const ev = s.completionEvent({ timestamp: 1 });
  assert.equal(ev.mode, "custom");
  assert.equal(ev.mode2, "5");
  assert.equal(ev.unit, "seconds"); // BQ-ENG-01 echo
  assert.equal(ev.bailedOut, false);
});
test("B-ENG-007: custom/words completes on final word commit and echoes unit", () => {
  const words = ["ab", "cd"];
  const s = new TypingSession({ mode: "custom", mode2: "2", words, config: { unit: "words" }, now: () => 0 });
  let t = typeWord(s, "ab", 1000);
  s.feed({ t, type: "space" }); t += 100;
  assert.equal(s.completed, false);
  t = typeWord(s, "cd", t);
  assert.equal(s.completed, true); // final word committed (no trailing space needed)
  const ev = s.completionEvent({ timestamp: 1 });
  assert.equal(ev.unit, "words");
});
test("B-ENG-007: zen never self-completes; manual end records bailedOut=true", () => {
  const s = new TypingSession({ mode: "zen", mode2: "", words: [" ".repeat(50)], now: () => 0 });
  let t = typeWord(s, "hello world zen", 1000);
  s.feed({ t, type: "space" });
  assert.equal(s.completed, false);
  s.bail(t + 100); // manual end (esc/enter routed client-side)
  assert.equal(s.completed, true);
  const ev = s.completionEvent({ timestamp: 1 });
  assert.equal(ev.mode, "zen");
  assert.equal(ev.bailedOut, true); // BQ-ENG-06
});
test("B-ENG-007: custom event without unit field on non-custom modes", () => {
  const s = completeWordsSession(["ab"]);
  assert.ok(!("unit" in s.completionEvent({ timestamp: 1 })));
});

// ---------- B-ENG-008(a): stopOnError=letter ----------
test("B-ENG-008(a): letter stop — inert while last committed char is incorrect", () => {
  const s = new TypingSession({ mode: "words", mode2: "2", words: ["abc", "def"],
                                config: { stopOnError: "letter" } });
  let t = typeWord(s, "ax", 1000); // 'x' incorrect at pos 1
  const before = s.inputs[0];
  s.feed({ t, type: "char", value: "c" }); t += 100; // inert: last char 'x' wrong
  s.feed({ t, type: "space" }); t += 100;            // space also inert (clause a)
  assert.equal(s.inputs[0], before);
  assert.equal(s.wordIndex, 0);
  s.feed({ t, type: "backspace" }); t += 100;        // delete the error
  s.feed({ t, type: "char", value: "b" }); t += 100; // corrected: registers again
  s.feed({ t, type: "char", value: "c" }); t += 100;
  assert.equal(s.inputs[0], "abc");
  s.feed({ t, type: "space" });
  assert.equal(s.wordIndex, 1); // commit resumes
});
test("B-ENG-008(a): last-char rule — an earlier error with correct last char does not gate", () => {
  // Sealed text gates on the LAST committed character only. In append-only typing
  // the two readings (last-char vs any-error) coincide; freedom navigation is the
  // revealing construction: insert an error mid-word, keep the last char correct.
  const s = new TypingSession({ mode: "words", mode2: "1", words: ["acc"],
                                config: { stopOnError: "letter", freedomMode: true } });
  let t = typeWord(s, "ac", 1000);                      // both correct so far
  s.feed({ t, type: "navigate", wordIndex: 0, charIndex: 1 }); t += 100;
  s.feed({ t, type: "char", value: "x" }); t += 100;    // insert error mid-word -> "axc"
  assert.equal(s.inputs[0], "axc");
  s.feed({ t, type: "char", value: "d" }); t += 100;    // last char 'c' correct -> admitted
  assert.equal(s.inputs[0], "axdc");                    // inserted at caret; any-error gate would have blocked
});

// ---------- B-ENG-008(b): stopOnError=word ----------
test("B-ENG-008(b): word stop — commit refused until word completed correctly", () => {
  const s = new TypingSession({ mode: "words", mode2: "2", words: ["abc", "def"],
                                config: { stopOnError: "word" } });
  let t = typeWord(s, "axc", 1000); // error at pos 1
  s.feed({ t, type: "space" }); t += 100; // refused: contains an error
  assert.equal(s.wordIndex, 0);
  // chars still flow (only commit is gated)
  s.feed({ t, type: "char", value: "d" }); t += 100;
  assert.equal(s.inputs[0], "axcd");
  // fix: backspace x3, retype correctly
  for (let i = 0; i < 4; i++) { s.feed({ t, type: "backspace" }); t += 100; }
  t = typeWord(s, "abc", t);
  s.feed({ t, type: "space" });
  assert.equal(s.wordIndex, 1); // completed correctly -> commit registers
});
test("B-ENG-008(b): word stop — incomplete (error-free) input cannot commit either", () => {
  // Chosen reading of "caret stays on the current word until it is completed
  // correctly" (invariant + annex, twice). Revealing test for adjudicators.
  const s = new TypingSession({ mode: "words", mode2: "2", words: ["abc", "def"],
                                config: { stopOnError: "word" } });
  let t = typeWord(s, "ab", 1000); // correct prefix, incomplete
  s.feed({ t, type: "space" });
  assert.equal(s.wordIndex, 0); // refused
});

// ---------- B-ENG-008(c): strictSpace ----------
test("B-ENG-008(c): strictSpace — space mid-word inert (sealed revealing test)", () => {
  const s = new TypingSession({ mode: "words", mode2: "2", words: ["abc", "def"],
                                config: { strictSpace: true } });
  let t = typeWord(s, "ab", 1000); // half the word
  const preSpace = JSON.stringify([s.wordIndex, s.inputs, s.caret]);
  s.feed({ t, type: "space" }); t += 100;
  assert.equal(JSON.stringify([s.wordIndex, s.inputs, s.caret]), preSpace); // space accounted nothing
  assert.equal(s.wordIndex, 0);          // unchanged
  assert.equal(s.inputs[0], "ab");
  // the typed prefix is still ordinary active-word accounting; the inert space added nothing
  assert.deepEqual(s._charCounts(), { allCorrect: 2, correctWord: 0, incorrect: 0, extra: 0, missed: 1 });
  t = typeWord(s, "c", t);               // complete the word
  s.feed({ t, type: "space" });
  assert.equal(s.wordIndex, 1);          // full word commits
});

// ---------- B-ENG-008(d): shift field is evidence plumbing only ----------
test("B-ENG-008(d): char admitted identically with/without shift field", () => {
  const run = (withShift) => {
    const s = new TypingSession({ mode: "words", mode2: "1", words: ["Abc"] });
    let t = 1000;
    for (const ch of "Abc") {
      s.feed(withShift ? { t, type: "char", value: ch, shift: "right" } : { t, type: "char", value: ch });
      t += 100;
    }
    return s;
  };
  const a = run(true), b = run(false);
  assert.deepEqual(a.inputs, b.inputs);
  assert.equal(a.completed, b.completed);
  assert.deepEqual(a.completionEvent({ timestamp: 1 }).charStats, b.completionEvent({ timestamp: 1 }).charStats);
});

// ---------- B-ENG-008(e): blind accounting unchanged ----------
test("B-ENG-008(e): blindMode leaves accounting identical", () => {
  const words = ["abc", "xef"];
  const mk = (blind) => {
    const s = new TypingSession({ mode: "words", mode2: "2", words, config: { blindMode: blind }, now: () => 0 });
    let t = typeWord(s, "axc", 1000); s.feed({ t: t, type: "space" });
    t = typeWord(s, "xef", t + 100); s.feed({ t: t + 100, type: "space" });
    return s.completionEvent({ timestamp: 1 });
  };
  const on = mk(true), off = mk(false);
  assert.deepEqual(on.charStats, off.charStats);
  assert.equal(on.wpm, off.wpm);
  assert.equal(on.acc, off.acc);
  assert.equal(on.blindMode, true);
});

// ---------- B-ENG-008(g): confidence × stop-on-error refuses start ----------
test("B-ENG-008(g): confidenceMode + stopOnError!=off refuses session start", () => {
  for (const soe of ["letter", "word"]) {
    assert.throws(() => new TypingSession({ mode: "words", mode2: "1", words: ["a"],
      config: { confidenceMode: true, stopOnError: soe } }), /B-ENG-008/);
  }
  assert.doesNotThrow(() => new TypingSession({ mode: "words", mode2: "1", words: ["a"],
    config: { confidenceMode: true, stopOnError: "off" } }));
});

// ---------- B-ENG-005: confidence gate (backspace inert) ----------
test("B-ENG-005: confidenceMode — backspace/delete inert once chars committed", () => {
  const s = new TypingSession({ mode: "words", mode2: "2", words: ["abc", "def"],
                                config: { confidenceMode: true } });
  let t = typeWord(s, "ax", 1000);
  s.feed({ t, type: "backspace" }); t += 100;
  assert.equal(s.inputs[0], "ax"); // nothing deleted
  s.feed({ t, type: "space" }); t += 100; // commit the erroneous word
  s.feed({ t, type: "backspace" }); t += 100;
  assert.equal(s.wordIndex, 1); // no retreat either
  assert.equal(s.inputs[0], "ax");
});

// ---------- B-ENG-005: freedom gates (navigate; seal lifted) ----------
test("B-ENG-005: freedomMode — navigate places caret; skipped positions fillable", () => {
  const s = new TypingSession({ mode: "words", mode2: "3", words: ["abc", "def", "ghi"],
                                config: { freedomMode: true } });
  let t = typeWord(s, "ab", 1000); // skip position 2
  s.feed({ t, type: "space" }); t += 100; // commit incomplete word
  assert.equal(s.wordIndex, 1);
  // navigate back to word 0, caret at skipped position 2, fill it
  s.feed({ t, type: "navigate", wordIndex: 0, charIndex: 2 }); t += 100;
  assert.equal(s.wordIndex, 0);
  assert.equal(s.caret, 2);
  s.feed({ t, type: "char", value: "c" }); t += 100;
  assert.equal(s.inputs[0], "abc"); // filled at the skipped position
  // accounting: word now fully correct
  const c = s._charCounts();
  assert.equal(c.missed, 0);
});
test("B-ENG-005: freedomMode — sealed-word rule lifted for navigated positions", () => {
  const s = new TypingSession({ mode: "words", mode2: "2", words: ["abc", "def"],
                                config: { freedomMode: true } });
  let t = typeWord(s, "abc", 1000);
  s.feed({ t, type: "space" }); t += 100; // committed fully correct (sealed in default mode)
  // default-mode backspace would be refused; freedom retreat is allowed
  s.feed({ t, type: "backspace" }); t += 100;
  assert.equal(s.wordIndex, 0);
  assert.equal(s.caret, 3);
  s.feed({ t, type: "backspace" }); t += 100; // edits the formerly sealed word
  assert.equal(s.inputs[0], "ab");
  // and navigate can target any position of any presented word
  s.feed({ t, type: "navigate", wordIndex: 0, charIndex: 1 }); t += 100;
  s.feed({ t, type: "char", value: "b" }); t += 100;
  assert.equal(s.inputs[0], "abb");
});
test("B-ENG-005: navigate inert without freedomMode; out-of-range navigate inert", () => {
  const s = new TypingSession({ mode: "words", mode2: "2", words: ["abc", "def"] });
  s.feed({ t: 1, type: "navigate", wordIndex: 1, charIndex: 0 });
  assert.equal(s.wordIndex, 0); // inert (S-ENG-002)
  const f = new TypingSession({ mode: "words", mode2: "2", words: ["abc", "def"], config: { freedomMode: true } });
  f.feed({ t: 1, type: "navigate", wordIndex: 5, charIndex: 0 });
  f.feed({ t: 2, type: "navigate", wordIndex: 0, charIndex: -1 });
  f.feed({ t: 3, type: "navigate", wordIndex: 0 });
  assert.equal(f.wordIndex, 0);
  assert.equal(f.caret, 0);
  // charIndex clamped to end of target
  f.feed({ t: 4, type: "navigate", wordIndex: 1, charIndex: 99 });
  assert.equal(f.wordIndex, 1);
  assert.equal(f.caret, 3);
});

// ---------- B-ENG-009: generation decoration ----------
test("B-ENG-009(a/b/d/e): punctuation+numbers deterministic, non-empty, some decorated", () => {
  const base = generateWords(400, 7);
  const a = decorateWords(base, mulberry32(99), { punctuation: true, numbers: true });
  const b = decorateWords(base, mulberry32(99), { punctuation: true, numbers: true });
  assert.deepEqual(a, b); // clause (d) determinism
  assert.ok(a.every((w) => w.length > 0)); // clause (e)
  assert.ok(a.some((w) => /[.,!?;:]$/.test(w)), "some punctuated words");
  assert.ok(a.some((w) => /^[A-Z]/.test(w)), "some capitalized words");
  assert.ok(a.some((w) => /^\d+$/.test(w)), "some number tokens");
  // flags off => identity (v1.1.0 stream unchanged)
  assert.equal(decorateWords(base, mulberry32(1), {}), base);
});
test("B-ENG-009(c): lazy equivalence — unaccented base accepted for diacritic targets", () => {
  assert.equal(stripDiacritics("é"), "e");
  assert.equal(charsEqual("e", "é", true), true);
  assert.equal(charsEqual("é", "e", true), false); // directional
  assert.equal(charsEqual("o", "ø", true), false); // no NFD decomposition -> strict
  assert.equal(wordMatches("cafe", "café", true), true);
  const c = countChars("cafe", "café", false, true);
  assert.deepEqual(c, { allCorrect: 4, correctWord: 4, incorrect: 0, extra: 0, missed: 0 });
  const strict = countChars("cafe", "café", false, false);
  assert.equal(strict.incorrect, 1);
  // session-level: words mode completes on a lazy match
  const s = new TypingSession({ mode: "words", mode2: "1", words: ["café"], config: { lazyMode: true }, now: () => 0 });
  typeWord(s, "cafe", 1000);
  assert.equal(s.completed, true);
  const ev = s.completionEvent({ timestamp: 1 });
  assert.deepEqual(ev.charStats, [4, 0, 0, 0]);
});
test("B-ENG-009(c): lazy equivalence holds in accounting conservation (B-ENG-004)", () => {
  const c = countChars("resume", "résume", false, true);
  assert.equal(c.allCorrect + c.incorrect + c.extra + c.missed, 6);
});

// ---------- B-ENG-010: min-threshold failure flag ----------
const completedEvent = (config, words = ["abc"], stream = null) => {
  const s = new TypingSession({ mode: "words", mode2: String(words.length), words, config, now: () => 0 });
  let t = 1000;
  for (const w of words) {
    for (const ch of (stream ?? w)) { s.feed({ t, type: "char", value: ch }); t += 100; }
    s.feed({ t, type: "space" }); t += 100;
  }
  return s.completionEvent({ timestamp: 1 });
};
test("B-ENG-010: flag set when an enabled threshold fails; 0 = disabled", () => {
  const ev = completedEvent({ minWpm: 0, minAcc: 0 });
  assert.equal(ev.minThresholdFailed, false); // disabled
  const hi = completedEvent({ minWpm: ev.wpm + 50, minAcc: 0 });
  assert.equal(hi.minThresholdFailed, true);  // wpm below threshold
  const accBad = completedEvent({ minWpm: 0, minAcc: 100 }, ["abc"], "axc");
  assert.equal(accBad.minThresholdFailed, true); // acc below threshold
  const ok = completedEvent({ minWpm: 1, minAcc: 50 });
  assert.equal(ok.minThresholdFailed, false); // thresholds met
});
test("B-ENG-010: flagging never alters stats (same stream, thresholds on/off)", () => {
  const a = completedEvent({ minWpm: 0, minAcc: 0 });
  const b = completedEvent({ minWpm: 99999, minAcc: 100 });
  assert.equal(a.wpm, b.wpm);
  assert.equal(a.acc, b.acc);
  assert.deepEqual(a.charStats, b.charStats);
  assert.equal(b.minThresholdFailed, true);
});

// ---------- B-ENG-006: determinism over the full mode matrix ----------
test("B-ENG-006: replay with mode-matrix flags + decoration is deterministic", () => {
  const build = () => {
    const wl = internalWordlist({ language: "english", count: 12, seed: 5, punctuation: true, numbers: true });
    const s = new TypingSession({ mode: "words", mode2: "12", words: wl.words,
      config: { punctuation: true, numbers: true, stopOnError: "off", strictSpace: false, minWpm: 10 }, now: () => 42 });
    let t = 1000;
    const rnd = mulberry32(11);
    for (const w of s.words) {
      for (const ch of w) {
        if (rnd() < 0.1) s.feed({ t, type: "char", value: "z" }); // noise
        s.feed({ t, type: "char", value: ch, shift: "none" }); t += 100;
      }
      s.feed({ t, type: "space" }); t += 100;
    }
    return s.completionEvent({ timestamp: 42, hash: "det" });
  };
  assert.equal(JSON.stringify(build()), JSON.stringify(build()));
});

// ---------- S-ENG-002 + B-ENG-008(f): inert events never corrupt state ----------
test("B-ENG-008(f): inert events leave no trace in accounting (property, seeded streams)", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const rnd = mulberry32(seed);
    const words = ["abc", "de", "fghi"];
    const cfg = { stopOnError: "letter", strictSpace: true };
    const s = new TypingSession({ mode: "words", mode2: "3", words, config: cfg, now: () => 0 });
    const pre = JSON.stringify([s.wordIndex, s.inputs, s.caret]);
    // hammer inert triggers: space mid-word, char after an error, junk events
    s.feed({ t: 1, type: "char", value: "z" }); // wrong char -> letter-stop armed
    const armed = JSON.stringify([s.wordIndex, s.inputs, s.caret]);
    for (let k = 0; k < 20; k++) {
      const r = rnd();
      if (r < 0.4) s.feed({ t: 10 + k, type: "space" });         // inert (letter stop)
      else if (r < 0.7) s.feed({ t: 10 + k, type: "char", value: "q" }); // inert
      else s.feed({ t: 10 + k, type: "frobnicate", value: 1 });  // out of contract
      assert.equal(JSON.stringify([s.wordIndex, s.inputs, s.caret]), armed, `seed ${seed} step ${k}`);
    }
    assert.notEqual(armed, pre); // the arming char did register (sanity)
  }
});

// ---------- backward compatibility: default config == v1.1.0 ----------
test("compat: default backspace semantics unchanged (seal + retreat)", () => {
  const s = new TypingSession({ mode: "words", mode2: "3", words: ["abc", "def", "ghi"] });
  let t = typeWord(s, "abc", 1000);
  s.feed({ t, type: "space" }); t += 100; // correct commit -> sealed
  s.feed({ t, type: "backspace" }); t += 100;
  assert.equal(s.wordIndex, 1); // sealed: no retreat
  assert.equal(s.inputs[0], "abc");
  const s2 = new TypingSession({ mode: "words", mode2: "3", words: ["abc", "def", "ghi"] });
  t = typeWord(s2, "axc", 1000);
  s2.feed({ t, type: "space" }); t += 100; // erroneous commit
  s2.feed({ t, type: "backspace" }); t += 100;
  assert.equal(s2.wordIndex, 0); // retreat into erroneous word
  assert.equal(s2.inputs[0], "axc");
  s2.feed({ t, type: "backspace" });
  assert.equal(s2.inputs[0], "ax"); // then deletes within the word
});
test("compat: completion event shape superset — v1 fields unchanged", () => {
  const ev = completeWordsSession(["abc", "def"]).completionEvent({ timestamp: 1 });
  for (const k of ["wpm", "rawWpm", "acc", "charStats", "charTotal", "mode", "mode2",
                   "testDuration", "timestamp", "consistency", "keyConsistency", "wpmConsistency",
                   "chartData", "restartCount", "afkDuration", "bailedOut", "language",
                   "punctuation", "numbers", "hash", "incompleteTests"]) {
    assert.ok(k in ev, k);
  }
  assert.equal(ev.minThresholdFailed, false);
});
