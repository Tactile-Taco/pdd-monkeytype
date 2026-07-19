// Session driver: scripts keystroke streams into the real page via CDP keyboard
// events and, after every keystroke, captures a trace row (DOM scan, drained
// mutations, oracle state). Shared by the structural, behavioral, mutation-
// confinement and caret checks so one scripted session serves many invariants.
import { scanWordStream, settle } from "./dom.mjs";
import { SessionOracle } from "./oracle.mjs";
import { mulberry32 } from "../../../../implementation/src/engine/words.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function scan(page, selectors) {
  return page.evaluate(scanWordStream, selectors);
}

// Read the fresh word-stream targets from the DOM (the engine word list is
// client-generated; the DOM is the validator's read of it).
export async function readTargets(page, selectors) {
  const s = await scan(page, selectors);
  if (!s.containerFound || s.words.length === 0) throw new Error("word stream not found");
  return { targets: s.words.map((w) => w.text), scan: s };
}

// Switch the candidate to a short words-mode session (deterministic length).
export async function setWordsMode(page, selectors) {
  const wm = selectors.wordsMode;
  await page.select(selectors.modeSelect, wm.mode);
  await page.select(selectors.mode2Select, wm.mode2);
  await sleep(120);
}

export async function focusWords(page, selectors) {
  await page.click(selectors.wordStream).catch(() => {});
  await page.evaluate((s) => { const el = document.querySelector(s.wordStream); el && el.focus(); }, selectors);
}

// Map a logical oracle event to a physical keystroke.
async function pressFor(page, ev) {
  if (ev.type === "char") return page.keyboard.press(ev.value);
  if (ev.type === "space") return page.keyboard.press("Space");
  if (ev.type === "backspace") return page.keyboard.press("Backspace");
  throw new Error("no key mapping for " + ev.type);
}

// Replay a stream of logical events {type, value?}; after each accepted
// keystroke capture a trace row. Stops at completion (results view takes over).
export async function replayStream(page, selectors, oracle, stream, {
  perStep = true, settleMs = 0, label = "scripted",
} = {}) {
  const trace = [];
  for (let k = 0; k < stream.length; k++) {
    const ev = stream[k];
    if (oracle.completed) break;
    const before = { wordIndex: oracle.wordIndex, n: oracle.inputs[oracle.wordIndex].length };
    await pressFor(page, ev);
    const accepted = oracle.feed(ev);
    if (settleMs) await sleep(settleMs); else await page.evaluate(settle);
    const mutations = await page.evaluate(() => window.__mutDrain());
    const dom = perStep ? await scan(page, selectors) : null;
    trace.push({ k, ev, accepted, before,
                 after: { wordIndex: oracle.wordIndex, n: oracle.inputs[oracle.wordIndex]?.length ?? 0,
                          completed: oracle.completed },
                 snapshot: { wordIndex: oracle.wordIndex, inputs: oracle.inputs.slice(),
                             completed: oracle.completed },
                 mutations, dom, label });
    if (oracle.completed) break;
  }
  return trace;
}

// Seeded keystroke-stream generator (B-UI-002 fuzz). Deterministic given
// (targets, seed, ops). Buckets: 55% correct char, 15% wrong char, 10% extra
// char, 12% backspace, 8% space — state-aware so extras/backspaces/retreats
// actually occur. Equivalent seeded property loop to fast-check (plan allows
// "fast-check or an equivalent seeded property loop"); reproducible via --seed.
export function genStream(targets, seed, maxOps = 60, semantics = "v1.1") {
  const rnd = mulberry32(seed);
  const probe = new SessionOracle(targets, { mode: "words", semantics });
  const stream = [];
  const letters = "abcdefghijklmnopqrstuvwxyz";
  for (let k = 0; k < maxOps && !probe.completed; k++) {
    const wi = probe.wordIndex;
    const target = targets[wi] ?? "";
    const typed = probe.inputs[wi] ?? "";
    const r = rnd();
    let ev;
    if (r < 0.55) {
      ev = typed.length < target.length
        ? { type: "char", value: target[typed.length] }
        : { type: "char", value: letters[Math.floor(rnd() * 26)] };
    } else if (r < 0.70) { // wrong char (or extra when target exhausted)
      let ch = letters[Math.floor(rnd() * 26)];
      if (typed.length < target.length && ch === target[typed.length])
        ch = ch === "z" ? "a" : String.fromCharCode(ch.charCodeAt(0) + 1);
      ev = { type: "char", value: ch };
    } else if (r < 0.80) { // push past target length -> extras
      ev = { type: "char", value: letters[Math.floor(rnd() * 26)] };
      if (typed.length < target.length) { k--; stream.push({ type: "char", value: target[typed.length] }); probe.feed(stream[stream.length - 1]); continue; }
    } else if (r < 0.92) {
      ev = { type: "backspace" };
    } else {
      ev = { type: "space" };
    }
    stream.push(ev);
    probe.feed(ev);
  }
  return stream;
}
