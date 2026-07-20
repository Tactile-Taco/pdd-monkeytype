// TypingSession — event-sourced typing test engine (typing-test-engine protocol v2.0.0).
// Deterministic given (words, config, keystroke stream, injected clock) — B-ENG-006.
// No I/O, no timers, no network (O-ENG-001/003/004). All data injected.
//
// v2.0.0 (MAJOR, brownfield roadmap D1): config-driven input-rule mode matrix
// (B-ENG-008), generation decoration consumed via decorated targets (B-ENG-009),
// min-threshold failure flag (B-ENG-010), custom-mode unit echo (B-ENG-007),
// abstract wordlist handshake with fail-closed injection (S-ENG-004).
// Backward compatibility: with default config (all v2 flags off) the observable
// behavior reproduces v1.1.0 exactly.
import { round2, calculateWpm, consistencyOf } from "../shared/stats.js";
import { countChars } from "./countChars.js";
import { charsEqual, wordMatches } from "./lazy.js";
import { validateWordlist } from "./wordlist.js";

const CHART_CAP = 122; // S-ENG-001
const AFK_GAP_MS = 5000;
const MODES = ["time", "words", "quote", "zen", "custom"]; // S-ENG-003

export class TypingSession {
  constructor({ mode, mode2, words, wordlist, config = {}, now = () => Date.now(), seed = 1 }) {
    // S-ENG-004: injected word lists conform to the wordlist handshake; a
    // non-conforming list is rejected before the first keystroke (fail-closed).
    // `wordlist` is the handshake path (abstract provider); the legacy `words`
    // array is the internal default provider's output and is held to the same
    // non-empty-string rule.
    if (wordlist !== undefined) {
      const errs = validateWordlist(wordlist);
      if (errs.length) throw new Error("wordlist rejected: " + errs.join("; "));
      words = wordlist.words;
      if (config.language === undefined) config = { language: wordlist.language, ...config };
    }
    if (!Array.isArray(words) || words.length === 0) throw new Error("words required");
    if (words.some((w) => typeof w !== "string" || w.length < 1)) throw new Error("words must be non-empty strings");
    if (!MODES.includes(mode)) throw new Error("mode must be one of " + MODES.join("|")); // S-ENG-003
    this.mode = mode;
    this.mode2 = String(mode2);
    this.words = words.slice();
    this.config = { punctuation: false, numbers: false, blindMode: false,
                    stopOnError: "off", lazyMode: false, language: "english",
                    confidenceMode: false, freedomMode: false, strictSpace: false,
                    minWpm: 0, minAcc: 0, unit: undefined, ...config };
    // B-ENG-008(g): confidenceMode=true with stopOnError!=off is an invalid
    // session configuration — the engine refuses to start the session.
    if (this.config.confidenceMode && this.config.stopOnError !== "off") {
      throw new Error("invalid session configuration: confidenceMode requires stopOnError=off (B-ENG-008(g))");
    }
    // S-ENG-003 / B-ENG-007: custom mode carries a positive-integer target plus
    // an explicit unit (seconds|words) as test-start config.
    if (this.mode === "custom") {
      const target = Number(this.mode2);
      if (!Number.isInteger(target) || target <= 0) throw new Error("custom mode2 must be a positive integer target (S-ENG-003)");
      if (!["seconds", "words"].includes(this.config.unit)) throw new Error("custom mode requires unit: seconds|words (B-ENG-007)");
    }
    this.now = now;
    this.restartCount = 0;
    this._reset();
  }

  _reset() {
    this.wordIndex = 0;
    this.caret = 0;                        // char index within current word's input
    this.inputs = [""];                    // typed text per word
    this.events = [];                      // accepted keystroke events
    this.keyTimes = [];                    // timestamps of char keydowns (spacing)
    this.keyDurations = [];                // optional caller-provided dwell times
    this.completed = false;
    this.bailedOut = false;
    this.incompleteTests = [];
    this.startT = null;
    this.endT = null;
  }

  restart(t) {
    this.restartCount += 1;
    const acc = this._accuracySoFar();
    if (this.startT !== null && t > this.startT) {
      this.incompleteTests.push({ acc, seconds: round2((t - this.startT) / 1000) });
    }
    this._reset();
    this.restartCount = this.restartCount; // preserved across reset
  }

  // Feed one keystroke event (S-ENG-002). Contract: keystroke-event.schema.json
  // — {t, type: char|backspace|space|restart|navigate, value?, wordIndex?,
  // charIndex?, shift?}. Out-of-contract events are ignored without corrupting
  // session state. The optional shift field is evidence plumbing only: a char
  // event is admitted identically with or without it (B-ENG-008(d); opposite-shift
  // enforcement is delegated to the input layer per BQ-ENG-03).
  feed(ev) {
    if (!ev || typeof ev.t !== "number" || ev.t < 0) return this; // out-of-contract: ignore
    if (this.completed) return this;
    const { t, type, value } = ev;
    if (type === "restart") { this.restart(t); return this; }
    if (type === "navigate") { this._navigate(ev); return this; }
    if (this.startT === null && (type === "char" || type === "space")) this.startT = t;

    if (type === "char" && typeof value === "string" && value.length === 1 && value !== " ") {
      // B-ENG-008(a): stopOnError=letter — while the last committed character of
      // the current input is incorrect, subsequent char events are inert.
      if (this.config.stopOnError === "letter" && this._lastCharIncorrect()) return this;
      const cur = this.inputs[this.wordIndex];
      // Non-freedom caret always sits at end-of-input => identical to v1.1.0 append.
      this.inputs[this.wordIndex] = cur.slice(0, this.caret) + value + cur.slice(this.caret);
      this.caret += 1;
      this.keyTimes.push(t);
      this.events.push(ev);
    } else if (type === "backspace") {
      this._backspace(ev);
    } else if (type === "space") {
      if (this.mode === "zen") {
        const cur = this.inputs[this.wordIndex]; // freeform: space is ordinary input
        this.inputs[this.wordIndex] = cur.slice(0, this.caret) + " " + cur.slice(this.caret);
        this.caret += 1; this.events.push(ev); return this;
      }
      const cur = this.inputs[this.wordIndex];
      const target = this.words[this.wordIndex] ?? "";
      // B-ENG-008(c): strictSpace — space while the current word is incomplete is
      // inert (no skip-ahead). Revealing test: type half a word, press space,
      // wordIndex unchanged and nothing accounted.
      if (this.config.strictSpace && cur.length < target.length) return this;
      // B-ENG-008(a): letter stop also gates space events.
      if (this.config.stopOnError === "letter" && this._lastCharIncorrect()) return this;
      // B-ENG-008(b): stopOnError=word — commit refused until the current word is
      // completed correctly (input equals target; lazy-aware). Caret stays.
      if (this.config.stopOnError === "word" && !wordMatches(cur, target, this.config.lazyMode)) return this;
      if (cur.length === 0) return this; // no empty commits (v1 rule, unchanged)
      this._commitWord();
      this.events.push(ev);
    }
    this._maybeComplete(t);
    return this;
  }

  // B-ENG-005 v2.0.0 mode gates.
  _backspace(ev) {
    // confidenceMode=true: backspace/delete inert once a character is committed
    // to input (correction impossible by design).
    if (this.config.confidenceMode) return;
    const cur = this.inputs[this.wordIndex];
    if (this.caret > 0) {                       // delete within current word
      this.inputs[this.wordIndex] = cur.slice(0, this.caret - 1) + cur.slice(this.caret);
      this.caret -= 1;
      this.events.push(ev);
      return;
    }
    if (this.wordIndex === 0) return;           // never before the first word
    if (this.config.freedomMode) {
      // freedomMode: the sealed-word rule does not apply to navigated positions —
      // retreat is always allowed; caret lands at end of that word's input.
      this.wordIndex -= 1;
      this.caret = this.inputs[this.wordIndex].length;
      this.events.push(ev);
      return;
    }
    // Default (v1.1.0): retreat into the immediately previous committed word IFF
    // it contains an error (lazy-aware); a fully correct committed word is sealed.
    if (!wordMatches(this.inputs[this.wordIndex - 1], this.words[this.wordIndex - 1], this.config.lazyMode)) {
      this.wordIndex -= 1;
      this.caret = this.inputs[this.wordIndex].length;
      this.events.push(ev);
    }
  }

  // freedomMode navigate events (BQ-ENG-02 shape: absolute wordIndex/charIndex).
  // Out-of-freedom or out-of-range navigates are inert (S-ENG-002).
  _navigate(ev) {
    if (!this.config.freedomMode) return;
    const { wordIndex, charIndex } = ev;
    if (!Number.isInteger(wordIndex) || !Number.isInteger(charIndex)) return;
    if (wordIndex < 0 || wordIndex >= this.words.length || charIndex < 0) return;
    this.wordIndex = wordIndex;
    this.inputs[wordIndex] = this.inputs[wordIndex] ?? ""; // materialize unvisited words
    const target = this.words[wordIndex] ?? "";
    this.caret = Math.min(charIndex, Math.max(target.length, this.inputs[wordIndex].length));
    this.events.push(ev);
  }

  provideKeyDurations(arr) { if (Array.isArray(arr)) this.keyDurations = arr.filter((x) => x >= 0); }

  _commitWord() {
    if (this.wordIndex < this.words.length - 1) {
      this.wordIndex += 1;
      this.inputs[this.wordIndex] = this.inputs[this.wordIndex] ?? "";
      this.caret = this.inputs[this.wordIndex].length;
    } else {
      this._complete(this._lastT());
    }
  }

  _lastT() { return this.events.length ? this.events[this.events.length - 1].t : 0; }

  // B-ENG-008(a): is the last committed character of the current input incorrect
  // (wrong char, or extra beyond the target)?
  _lastCharIncorrect() {
    const typed = this.inputs[this.wordIndex];
    if (typed.length === 0) return false;
    const i = typed.length - 1;
    const tc = this.words[this.wordIndex]?.[i];
    if (tc === undefined) return true; // extra character
    return !charsEqual(typed[i], tc, this.config.lazyMode);
  }

  _maybeComplete(t) {
    const timed = this.mode === "time" || (this.mode === "custom" && this.config.unit === "seconds");
    if (timed) {
      // B-ENG-007: time completes at timer expiry; custom with a seconds target
      // completes per the same rule.
      const limit = parseFloat(this.mode2) * 1000;
      if (this.startT !== null && t - this.startT >= limit) this._complete(this.startT + limit);
    } else if (this.mode === "words" || this.mode === "quote" || this.mode === "custom") {
      // words/quote/custom-words: complete when the final word is committed
      // (lazy-aware match, B-ENG-009(c)).
      const last = this.words.length - 1;
      if (this.wordIndex === last && wordMatches(this.inputs[last], this.words[last], this.config.lazyMode)) this._complete(t);
    }
    // zen never self-completes (B-ENG-007): manual end only, via bail().
  }

  bail(t) {                                   // user ends early (also zen manual end)
    if (this.completed) return this;
    this.bailedOut = true;                    // B-ENG-007: zen manual end records bailedOut=true
    this._complete(t ?? this._lastT());
    return this;
  }

  _accuracySoFar() {
    const c = this._charCounts();
    const denom = c.allCorrect + c.incorrect + c.extra;
    return denom === 0 ? 0 : round2((c.allCorrect / denom) * 100);
  }

  _charCounts() {
    const acc = { allCorrect: 0, correctWord: 0, incorrect: 0, extra: 0, missed: 0 };
    const isTimed = this.mode === "time" || (this.mode === "custom" && this.config.unit === "seconds");
    for (let wi = 0; wi <= this.wordIndex && wi < this.words.length; wi++) {
      const last = wi === this.wordIndex;
      const creditPartial = last && (isTimed || this.bailedOut);
      const target = this.mode === "zen" ? this.inputs[wi] : this.words[wi];
      const c = countChars(this.inputs[wi] ?? "", target, creditPartial, this.config.lazyMode);
      acc.allCorrect += c.allCorrect; acc.correctWord += c.correctWord;
      acc.incorrect += c.incorrect; acc.extra += c.extra; acc.missed += c.missed;
    }
    return acc;
  }

  _complete(t) {
    if (this.completed) return;
    this.completed = true;
    this.endT = t;
  }

  // Build the completion event (S-ENG-001). Injectable timestamp keeps replay deterministic.
  completionEvent({ timestamp, hash = "" } = {}) {
    if (!this.completed) throw new Error("session not complete");
    const chars = this._charCounts();
    const start = this.startT ?? 0;
    const duration = Math.max((this.endT - start) / 1000, 0.001); // schema: testDuration > 0
    // per-second sampling
    const buckets = new Map();
    for (const ev of this.events) {
      if (ev.type !== "char") continue;
      const s = Math.floor((ev.t - start) / 1000);
      buckets.set(s, (buckets.get(s) ?? 0) + 1);
    }
    const secs = Math.max(1, Math.ceil(duration));
    const burst = [], wpmHist = [], err = [];
    let cumChars = 0;
    for (let s = 0; s < secs && s < CHART_CAP; s++) {
      const b = buckets.get(s) ?? 0;
      burst.push(b);
      cumChars += b;
      wpmHist.push(round2(calculateWpm(cumChars, s + 1)));
      err.push(0);
    }
    const spacings = [];
    for (let i = 1; i < this.keyTimes.length; i++) spacings.push(this.keyTimes[i] - this.keyTimes[i - 1]);
    let afk = 0;
    for (const g of spacings) if (g > AFK_GAP_MS) afk += g / 1000;
    const keySpacingForConsistency = spacings.slice(0, Math.max(0, spacings.length - 1)); // drop last (B-ENG-002)
    const acc = this._accuracySoFar();
    const charTotal = chars.allCorrect + chars.incorrect + chars.extra;
    const wpm = round2(calculateWpm(chars.correctWord, duration));
    // B-ENG-010: min-threshold failure flag (0 = disabled). Flagging never
    // alters stat computation, completion, or accounting; exclusion is consumer-side.
    const minThresholdFailed =
      (this.config.minWpm > 0 && wpm < this.config.minWpm) ||
      (this.config.minAcc > 0 && acc < this.config.minAcc);
    return {
      wpm,
      rawWpm: round2(calculateWpm(charTotal, duration)),
      acc,
      charStats: [chars.correctWord, chars.incorrect, chars.extra, chars.missed],
      charTotal,
      mode: this.mode,
      mode2: this.mode2,
      // B-ENG-007 / BQ-ENG-01: custom mode echoes the unit so completion
      // consumers never need start-event lookup.
      ...(this.mode === "custom" ? { unit: this.config.unit } : {}),
      ...(this.mode === "quote" ? { quoteLength: this.config.quoteLength ?? 0 } : {}),
      testDuration: round2(duration),
      timestamp: timestamp ?? Math.floor(this.now()),
      consistency: consistencyOf(burst),
      keyConsistency: consistencyOf(keySpacingForConsistency),
      wpmConsistency: consistencyOf(wpmHist),
      chartData: { wpm: wpmHist, burst, err },
      keySpacing: spacings,
      keyDuration: this.keyDurations,
      restartCount: this.restartCount,
      afkDuration: round2(afk),
      bailedOut: this.bailedOut,
      language: this.config.language,
      punctuation: !!this.config.punctuation,
      numbers: !!this.config.numbers,
      blindMode: !!this.config.blindMode,
      stopOnLetter: this.config.stopOnError === "letter",
      minThresholdFailed,
      hash,
      incompleteTests: this.incompleteTests,
    };
  }
}
