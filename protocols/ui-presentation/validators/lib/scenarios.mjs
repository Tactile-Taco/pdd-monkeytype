// Shared browser scenarios. Each scenario runs once per suite invocation; the
// captured traces are then evaluated by the check modules (one browser session
// amortized across checks, per the mission's substrate directive).
import { openSessionPage } from "./browser.mjs";
import { readTargets, replayStream, setWordsMode, focusWords, genStream, scan } from "./driver.mjs";
import { SessionOracle } from "./oracle.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hand-built scripted stream (B-UI-002 statement: "scripted streams (chars,
// errors, extras, backspaces, word commits, backspace retreats)"). Constructed
// against an oracle probe so it is agnostic to the actual word targets and to
// engine-semantics mode (the retreat segment exists only under v1.1).
export function buildScriptedStream(targets, semantics) {
  const probe = new SessionOracle(targets, { mode: "words", semantics });
  const stream = [];
  const push = (ev) => { stream.push(ev); probe.feed(ev); };
  const typeWord = (wi, { wrongAt = -1, extras = 0 } = {}) => {
    const t = targets[wi];
    for (let i = 0; i < t.length; i++) {
      let ch = t[i];
      if (i === wrongAt) ch = ch === "z" ? "a" : String.fromCharCode(ch.charCodeAt(0) + 1);
      push({ type: "char", value: ch });
    }
    for (let e = 0; e < extras; e++) push({ type: "char", value: "xq"[e % 2] });
  };
  // word 0: perfect + commit
  typeWord(0); push({ type: "space" });
  // word 1: one error, backspace-fix, commit
  typeWord(1, { wrongAt: Math.min(1, targets[1].length - 1) });
  push({ type: "backspace" });
  push({ type: "char", value: targets[1][Math.min(1, targets[1].length - 1)] });
  push({ type: "space" });
  // word 2: perfect + 2 extras, commit (word now committed-with-error)
  typeWord(2, { extras: 2 }); push({ type: "space" });
  // retreat segment (v1.1 semantics only; under v1.0 these would be no-ops)
  if (semantics === "v1.1") {
    push({ type: "backspace" }); // retreat into word 2 (committed with error)
    push({ type: "backspace" }); // delete one extra
    push({ type: "space" });     // re-commit word 2
  }
  // remaining words: perfect + commit (final word completes on last char)
  for (let wi = 3; wi < targets.length; wi++) {
    typeWord(wi);
    if (wi < targets.length - 1) push({ type: "space" });
  }
  return stream;
}

// Scenario A: fresh structural scan + scripted stream trace.
export async function scenarioScripted(ctx) {
  const { browser, origin, selectors, options } = ctx;
  const sp = await openSessionPage(browser, origin, { seed: options.seed * 31 + 7, selectors, initScript: options.initScript });
  try {
    const freshScan = await scan(sp.page, selectors);          // S-UI-001/002 fresh, pre-typing
    await setWordsMode(sp.page, selectors);
    await focusWords(sp.page, selectors);
    // session boundary: discard setup mutations so per-keystroke buckets are clean (B-UI-003)
    await sp.page.evaluate(() => window.__mutDrain());
    const { targets, scan: sessionScan } = await readTargets(sp.page, selectors);
    const oracle = new SessionOracle(targets, { mode: "words", semantics: options.engineSemantics });
    const stream = buildScriptedStream(targets, options.engineSemantics);
    const trace = await replayStream(sp.page, selectors, oracle, stream, { label: "scripted" });
    const feedLog = await sp.page.evaluate(() => window.__feedLog);
    // B-UI-002 mutation-sanity self-test: corrupt a committed word's letter class
    // and require the fidelity comparator to detect it (mutation-suspect guard).
    const corruption = await sp.page.evaluate((sel) => {
      const w = document.querySelector(`${sel.wordStream} ${sel.word}[data-wi="0"]`) ||
                document.querySelector(`${sel.wordStream} ${sel.word}`);
      const c = w && w.children[0];
      if (!c || !c.classList.contains("correct")) return { ok: false, reason: "no correct letter to corrupt" };
      c.classList.remove("correct");
      return { ok: true };
    }, selectors);
    const corruptedScan = await scan(sp.page, selectors);
    return { page: sp, freshScan, sessionScan, targets, oracle, stream, trace, feedLog,
             corruption, corruptedScan, meta: sp.meta };
  } finally {
    // page kept open until checks have consumed the trace; caller closes
  }
}

// Scenario B: seeded property loop (B-UI-002 fuzz) — `runs` independent sessions,
// each a fresh word list and a seeded keystroke stream, checked after EVERY
// keystroke. Also piggybacks S-UI-003 active-index and B-UI-003 confinement.
export async function scenarioFuzz(ctx) {
  const { browser, origin, selectors, options } = ctx;
  const runs = options.runs;
  const sp = await openSessionPage(browser, origin, { seed: options.seed * 131 + 3, selectors, initScript: options.initScript });
  try {
    await setWordsMode(sp.page, selectors);
    const runsMeta = [];
    const traceRows = [];
    for (let r = 0; r < runs; r++) {
      await sp.page.click(selectors.restartButton).catch(() => {});
      await sleep(80);
      await focusWords(sp.page, selectors);
      // session boundary: restart/new-test re-render is permitted (B-UI-003); discard it
      await sp.page.evaluate(() => window.__mutDrain());
      const { targets } = await readTargets(sp.page, selectors);
      const oracle = new SessionOracle(targets, { mode: "words", semantics: options.engineSemantics });
      const stream = genStream(targets, options.seed + r, 40, options.engineSemantics);
      const trace = await replayStream(sp.page, selectors, oracle, stream, { label: `fuzz#${r}` });
      runsMeta.push({ run: r, seed: options.seed + r, words: targets.length, ops: trace.length,
                      completed: oracle.completed, targets });
      traceRows.push(...trace);
    }
    return { page: sp, runsMeta, trace: traceRows, meta: sp.meta };
  } finally {
  }
}
