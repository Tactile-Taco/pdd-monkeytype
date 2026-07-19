// Engine-state oracle for UI fidelity checks (B-UI-001/002, S-UI-003).
// Tracks the DOM-relevant projection of TypingSession state: wordIndex, inputs,
// completed — for keystroke streams the validator scripts into the real page.
//
// semantics "v1.1" (default): sealed typing-test-engine v1.1.0 — backspace at an
//   empty current word retreats into the previous committed word IFF it contains
//   an error; fully-correct committed words are sealed (B-ENG-005 v1.1).
// semantics "v1.0": pre-CA-001 engine served by the v2.2 live origin — backspace
//   at word start is a no-op. Used ONLY for smoke runs against the v2.2 replica;
//   documented in research/metrics/validator-authoring.md.
//
// Equivalence of v1.1 mode with the repo engine (implementation/src/engine/session.js)
// is enforced by selfTestOracle() over randomized streams (see run.mjs --selftest).

export class SessionOracle {
  constructor(words, { mode = "words", semantics = "v1.1" } = {}) {
    if (!Array.isArray(words) || words.length === 0) throw new Error("oracle needs words");
    this.words = words.slice();
    this.mode = mode;
    this.semantics = semantics;
    this.reset();
  }
  reset() {
    this.wordIndex = 0;
    this.inputs = [""];
    this.completed = false;
  }
  // Feed one logical keystroke {type: "char"|"backspace"|"space"|"restart", value?}.
  // Returns true when the event was accepted (state may have changed).
  feed(ev) {
    if (this.completed) return false;
    const { type, value } = ev;
    if (type === "restart") { this.reset(); return true; }
    if (type === "char" && typeof value === "string" && value.length === 1 && value !== " ") {
      this.inputs[this.wordIndex] += value;
      this._maybeComplete();
      return true;
    }
    if (type === "backspace") {
      const cur = this.inputs[this.wordIndex];
      if (cur.length > 0) {
        this.inputs[this.wordIndex] = cur.slice(0, -1);
        return true;
      }
      if (this.semantics === "v1.1" && this.wordIndex > 0 &&
          this.inputs[this.wordIndex - 1] !== this.words[this.wordIndex - 1]) {
        this.wordIndex -= 1; // retreat into erroneous committed word (v1.1 only)
        return true;
      }
      return false;
    }
    if (type === "space") {
      if (this.mode === "zen") { this.inputs[this.wordIndex] += " "; return true; }
      if (this.inputs[this.wordIndex].length === 0) return false; // no empty commits
      if (this.wordIndex < this.words.length - 1) {
        this.wordIndex += 1;
        this.inputs[this.wordIndex] = this.inputs[this.wordIndex] ?? "";
      } else {
        this.completed = true; // committed final word
      }
      this._maybeComplete();
      return true;
    }
    return false;
  }
  _maybeComplete() {
    if (this.mode === "words" || this.mode === "quote" || this.mode === "custom") {
      const last = this.words.length - 1;
      if (this.wordIndex === last && this.inputs[last] === this.words[last]) this.completed = true;
    }
  }
  // Expected DOM state for word wi: [{char, state}] with state in
  // {correct, incorrect, extra, untyped(null)} per B-UI-002 accounting.
  expectedWord(wi) {
    const target = this.words[wi] ?? "";
    const typed = this.inputs[wi] ?? "";
    const n = Math.max(target.length, typed.length);
    const out = [];
    for (let i = 0; i < n; i++) {
      const tc = target[i], ic = typed[i];
      let state = null;
      if (ic !== undefined) state = ic === tc ? "correct" : tc === undefined ? "extra" : "incorrect";
      out.push({ char: tc ?? ic, state });
    }
    return out;
  }
}

// Cross-check oracle (v1.1) against the repo engine over a randomized stream.
// Used by the suite self-test so oracle drift is caught before any page opens.
export async function selfTestOracle() {
  const { TypingSession } = await import("../../../../implementation/src/engine/session.js");
  const { mulberry32 } = await import("../../../../implementation/src/engine/words.js");
  const words = ["abc", "de", "fghi", "j", "klmno"];
  for (let seed = 1; seed <= 25; seed++) {
    const rnd = mulberry32(seed);
    const eng = new TypingSession({ mode: "words", mode2: String(words.length), words, now: () => 0 });
    const orc = new SessionOracle(words, { mode: "words", semantics: "v1.1" });
    let t = 0;
    for (let k = 0; k < 120; k++) {
      const r = rnd();
      const ev = r < 0.55 ? { t: ++t, type: "char", value: "abcdefgh"[Math.floor(rnd() * 8)] }
               : r < 0.75 ? { t: ++t, type: "backspace" }
               : { t: ++t, type: "space" };
      eng.feed(ev); orc.feed(ev);
      if (eng.wordIndex !== orc.wordIndex ||
          eng.inputs.slice(0, eng.wordIndex + 1).join("") !== orc.inputs.slice(0, orc.wordIndex + 1).join("") ||
          eng.completed !== orc.completed) {
        return { ok: false, seed, step: k,
                 engine: { wordIndex: eng.wordIndex, inputs: eng.inputs, completed: eng.completed },
                 oracle: { wordIndex: orc.wordIndex, inputs: orc.inputs, completed: orc.completed } };
      }
    }
  }
  return { ok: true, seeds: 25 };
}
