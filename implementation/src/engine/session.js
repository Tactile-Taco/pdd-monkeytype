// TypingSession — event-sourced typing test engine (typing-test-engine protocol).
// Deterministic given (words, config, keystroke stream, injected clock) — B-ENG-006.
// No I/O, no timers, no network (O-ENG-001/003/004). All data injected.
import { round2, calculateWpm, consistencyOf } from "../shared/stats.js";
import { countChars } from "./countChars.js";

const CHART_CAP = 122; // S-ENG-001
const AFK_GAP_MS = 5000;

export class TypingSession {
  constructor({ mode, mode2, words, config = {}, now = () => Date.now(), seed = 1 }) {
    if (!Array.isArray(words) || words.length === 0) throw new Error("words required");
    this.mode = mode;                      // time|words|quote|zen|custom (S-ENG-003)
    this.mode2 = String(mode2);
    this.words = words.slice();
    this.config = { punctuation: false, numbers: false, blindMode: false,
                    stopOnError: "off", lazyMode: false, language: "english", ...config };
    this.now = now;
    this.restartCount = 0;
    this._reset();
  }

  _reset() {
    this.wordIndex = 0;
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

  // Feed one keystroke event {t, type: char|backspace|space|restart, value?} (S-ENG-002)
  feed(ev) {
    if (!ev || typeof ev.t !== "number" || ev.t < 0) return this; // out-of-contract: ignore
    if (this.completed) return this;
    const { t, type, value } = ev;
    if (type === "restart") { this.restart(t); return this; }
    if (this.startT === null && (type === "char" || type === "space")) this.startT = t;

    if (type === "char" && typeof value === "string" && value.length === 1 && value !== " ") {
      if (this.config.stopOnError === "letter" && this._currentHasError()) return this;
      this.inputs[this.wordIndex] += value;
      this.keyTimes.push(t);
      this.events.push(ev);
    } else if (type === "backspace") {
      const cur = this.inputs[this.wordIndex];
      if (cur.length > 0) {                       // B-ENG-005: never before word start
        this.inputs[this.wordIndex] = cur.slice(0, -1);
        this.events.push(ev);
      }
    } else if (type === "space") {
      if (this.mode === "zen") { this.inputs[this.wordIndex] += " "; this.events.push(ev); return this; }
      if (this.inputs[this.wordIndex].length === 0) return this; // no empty commits
      this._commitWord();
      this.events.push(ev);
    }
    this._maybeComplete(t);
    return this;
  }

  provideKeyDurations(arr) { if (Array.isArray(arr)) this.keyDurations = arr.filter((x) => x >= 0); }

  _commitWord() {
    if (this.wordIndex < this.words.length - 1) {
      this.wordIndex += 1;
      this.inputs[this.wordIndex] = this.inputs[this.wordIndex] ?? "";
    } else {
      this._complete(this._lastT());
    }
  }

  _lastT() { return this.events.length ? this.events[this.events.length - 1].t : 0; }

  _currentHasError() {
    const typed = this.inputs[this.wordIndex];
    const target = this.words[this.wordIndex] ?? "";
    for (let i = 0; i < typed.length; i++) if (typed[i] !== target[i]) return true;
    return false;
  }

  _maybeComplete(t) {
    if (this.mode === "time") {
      const limit = parseFloat(this.mode2) * 1000;
      if (this.startT !== null && t - this.startT >= limit) this._complete(this.startT + limit);
    } else if (this.mode === "words" || this.mode === "quote" || this.mode === "custom") {
      const last = this.words.length - 1;
      if (this.wordIndex === last && this.inputs[last] === this.words[last]) this._complete(t);
    }
    // zen never self-completes (B-ENG-007)
  }

  bail(t) {                                   // user ends early (also zen exit)
    if (this.completed) return this;
    this.bailedOut = true;
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
    const isTimed = this.mode === "time";
    for (let wi = 0; wi <= this.wordIndex && wi < this.words.length; wi++) {
      const last = wi === this.wordIndex;
      const creditPartial = last && (isTimed || this.bailedOut);
      const target = this.mode === "zen" ? this.inputs[wi] : this.words[wi];
      const c = countChars(this.inputs[wi] ?? "", target, creditPartial);
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
    return {
      wpm: round2(calculateWpm(chars.correctWord, duration)),
      rawWpm: round2(calculateWpm(charTotal, duration)),
      acc,
      charStats: [chars.correctWord, chars.incorrect, chars.extra, chars.missed],
      charTotal,
      mode: this.mode,
      mode2: this.mode2,
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
      hash,
      incompleteTests: this.incompleteTests,
    };
  }
}
