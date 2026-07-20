// Validator: caret-tracking (validator-set 0.2.0, behavioral layer)
// Covers B-UI-001: single caret element; rect tracks logical caret position
// (wordIndex, n = inputs[wordIndex].length) within 2px horizontally of the
// letter boundary, vertically overlapping the active word's line box; visible
// in >= 1 of 3 samples 250ms apart (blink-phase tolerance; blink/shape delegated).
// B-UI-001 drift clause evaluates ADV-UI-IMPL-01 (no positional slide on the
// tracked edge under the sealed default smoothCaret=true).
// Covers B-UI-008 (v2.0.0 must): tapeMode — caret viewport-x fixed (+-2px across
// keystrokes) while the stream translates; single-line layout; reading order.
import { openSessionPage, ensureConfigToken } from "../lib/browser.mjs";
import { scan, readTargets, setWordsMode, focusWords } from "../lib/driver.mjs";
import { buildScriptedStream } from "../lib/scenarios.mjs";
import { SessionOracle } from "../lib/oracle.mjs";

const POS_TOL = 2;    // validation-plan tolerances.caret_position_px
const VIS = { samples: 3, intervalMs: 250, minVisible: 1, minArea: 4, minOpacity: 0.5 }; // plan tolerances.caret_visibility

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function caretHorizontalOk(caretRect, boundaryX) {
  // caret x position: any of left/center/right within tolerance of the boundary
  const xs = [caretRect.left, caretRect.left + caretRect.width / 2, caretRect.right];
  return xs.some((x) => Math.abs(x - boundaryX) <= POS_TOL);
}

export async function evaluateCaretTracking(ctx) {
  const { scenarios, selectors, browser, origin, options } = ctx;
  const { trace } = scenarios.scripted;
  const failures = [];
  let checked = 0;

  // presence: exactly one caret element whenever the test view is active
  const firstWithDom = trace.find((s) => s.dom);
  if (!firstWithDom || firstWithDom.dom.caretCount !== 1) {
    return [{ invariant_id: "B-UI-001", layer: "behavioral", severity: "must", outcome: "fail",
      evidence: `caret element not found / not unique (count=${firstWithDom?.dom?.caretCount ?? 0}; discovery ${selectors.caret.join(", ")}). v2.2 is pre-caret by design (ambiguity log Q1); a conforming candidate must add it` }];
  }

  // rect tracking after every accepted scripted keystroke (active session only)
  for (const step of trace) {
    if (!step.dom || step.after.completed || !step.accepted) continue;
    const dom = step.dom;
    if (!dom.caret) { failures.push(`k${step.k}: caret missing`); continue; }
    const letters = dom.activeLetterRects ?? [];
    const n = step.after.n;
    if (letters.length === 0) { failures.push(`k${step.k}: active word has no letters`); continue; }
    const boundary = n === 0 ? letters[0].left : (letters[n - 1] ?? letters[letters.length - 1]).right;
    if (!caretHorizontalOk(dom.caret.rect, boundary))
      failures.push(`k${step.k}: caret x [${dom.caret.rect.left.toFixed(1)}..${dom.caret.rect.right.toFixed(1)}] vs boundary ${boundary.toFixed(1)} (n=${n})`);
    const line = dom.activeWordLine;
    if (line && !(dom.caret.rect.bottom > line.top && dom.caret.rect.top < line.bottom))
      failures.push(`k${step.k}: caret does not overlap active line box vertically`);
    checked++;
  }

  // visibility: 3 samples 250ms apart during an active session (own page)
  const sp = await openSessionPage(browser, origin, { seed: options.seed * 43 + 1, selectors, initScript: options.initScript });
  try {
    await setWordsMode(sp.page, selectors);
    await focusWords(sp.page, selectors);
    const { targets } = await readTargets(sp.page, selectors);
    for (const ch of targets[0].slice(0, 2)) await sp.page.keyboard.press(ch);
    const samples = [];
    for (let i = 0; i < VIS.samples; i++) {
      const s = await scan(sp.page, selectors);
      if (s.caret) samples.push(s.caret);
      if (i < VIS.samples - 1) await sleep(VIS.intervalMs);
    }
    const visibleCount = samples.filter((c) =>
      c.display !== "none" && c.visibility !== "hidden" && c.area >= VIS.minArea && c.opacity >= VIS.minOpacity).length;
    if (visibleCount < VIS.minVisible)
      failures.push(`visibility: ${visibleCount}/${samples.length} samples visible (need >=${VIS.minVisible}; area>=${VIS.minArea}px^2 opacity>=${VIS.minOpacity})`);
    // ADV-UI-IMPL-01 evaluation: the tracked edge must not slide positionally
    // after a keystroke (smoothCaret ships opacity fade, not positional slide)
    const d0 = (await scan(sp.page, selectors)).caret?.rect;
    await sleep(220);
    const d1 = (await scan(sp.page, selectors)).caret?.rect;
    if (d0 && d1 && Math.abs(d1.left - d0.left) > POS_TOL)
      failures.push(`drift: caret x moved ${Math.abs(d1.left - d0.left).toFixed(2)}px post-keystroke (positional slide on tracked edge, tol ${POS_TOL}px)`);
  } finally {
    await sp.close();
    ctx.artifactMetas.push(sp.meta);
  }

  const results = [{ invariant_id: "B-UI-001", layer: "behavioral", severity: "must",
    outcome: failures.length === 0 ? "pass" : "fail",
    evidence: failures.length ? [...new Set(failures)].slice(0, 5).join(" | ")
      : `caret tracked over ${checked} keystrokes (2px tol); visibility 3-sample check OK; no positional slide post-keystroke (ADV-UI-IMPL-01)` }];
  results.push(...await evaluateTapeMode(ctx));
  return results;
}

// B-UI-008 (v2.0.0 must): tapeMode — caret viewport-x stays fixed (+-2px across
// keystrokes) while the stream translates under it; single-line layout; reading
// order preserved; tracking + mutation confinement hold under tape.
async function evaluateTapeMode(ctx) {
  const { selectors, browser, origin, options } = ctx;
  const clauses = [];
  const token = await ensureConfigToken(ctx);
  const sp = await openSessionPage(browser, origin, {
    seed: options.seed * 17 + 5, selectors, initScript: options.initScript,
    pinnedConfig: { tapeMode: true }, sessionToken: token });
  try {
    await setWordsMode(sp.page, selectors);
    await focusWords(sp.page, selectors);
    await sp.page.evaluate(() => window.__mutDrain()); // session boundary (B-UI-003)
    const { targets } = await readTargets(sp.page, selectors);
    // single-line layout + reading order on the fresh tape render
    const fresh = await scan(sp.page, selectors);
    const tops = fresh.words.map((w) => w.rect.top);
    clauses.push(`${Math.max(...tops) - Math.min(...tops) <= 2 ? "pass" : "fail"}: tape renders the stream as one line (word-top spread ${(Math.max(...tops) - Math.min(...tops)).toFixed(2)}px)`);
    let ordered = true;
    for (let i = 1; i < fresh.words.length; i++)
      if (fresh.words[i].rect.left < fresh.words[i - 1].rect.left - 2) ordered = false;
    clauses.push(`${ordered ? "pass" : "fail"}: reading order left-to-right preserved (S-UI-001 row-major)`);
    // scripted keystrokes: caret viewport x per keystroke + scroll engagement
    const oracle = new SessionOracle(targets, { mode: "words", semantics: options.engineSemantics });
    const stream = buildScriptedStream(targets, options.engineSemantics);
    const caretXs = [];
    let maxScroll = 0, leaks = 0, trackChecked = 0, trackFails = 0;
    for (const ev of stream) {
      if (oracle.completed) break;
      const before = oracle.wordIndex;
      if (ev.type === "char") await sp.page.keyboard.press(ev.value);
      else if (ev.type === "space") await sp.page.keyboard.press("Space");
      else if (ev.type === "backspace") await sp.page.keyboard.press("Backspace");
      oracle.feed(ev);
      await sp.page.evaluate(settle0);
      const muts = await sp.page.evaluate(() => window.__mutDrain());
      for (const m of muts) if (m.region === "word" && m.word !== before && m.word !== oracle.wordIndex) leaks++;
      const s = await scan(sp.page, selectors);
      if (s.caret) caretXs.push(s.caret.rect.left);
      // tracking (B-UI-001) under tape, evaluated on every active (non-completed) step
      if (!oracle.completed && s.caret && (s.activeLetterRects ?? []).length > 0) {
        const n = oracle.inputs[oracle.wordIndex]?.length ?? 0;
        const boundary = n === 0 ? s.activeLetterRects[0].left
          : (s.activeLetterRects[n - 1] ?? s.activeLetterRects[s.activeLetterRects.length - 1]).right;
        if (!caretHorizontalOk(s.caret.rect, boundary)) trackFails++;
        trackChecked++;
      }
      const sl = await sp.page.evaluate((sel) => document.querySelector(sel.wordStream)?.scrollLeft ?? 0, selectors);
      if (sl > maxScroll) maxScroll = sl;
    }
    let maxDelta = 0;
    for (let i = 1; i < caretXs.length; i++) maxDelta = Math.max(maxDelta, Math.abs(caretXs[i] - caretXs[i - 1]));
    clauses.push(`${caretXs.length >= 2 && maxDelta <= POS_TOL ? "pass" : "fail"}: caret viewport x fixed across ${caretXs.length} keystrokes (max |delta|=${maxDelta.toFixed(2)}px, tol ${POS_TOL}px)`);
    clauses.push(`${maxScroll > 0 ? "pass" : "fail"}: stream translates under the anchor (scrollLeft max ${maxScroll.toFixed(1)}px)`);
    clauses.push(`${trackFails === 0 && trackChecked > 0 ? "pass" : "fail"}: caret still tracks the active letter boundary under tape over ${trackChecked} keystrokes (${trackFails} misses, B-UI-001)`);
    clauses.push(`${leaks === 0 ? "pass" : "fail"}: mutation confinement holds under tape (${leaks} leaks)`);
  } finally {
    await sp.close();
    ctx.artifactMetas.push(sp.meta);
  }
  return [{ invariant_id: "B-UI-008", layer: "behavioral", severity: "must",
    outcome: clauses.every((c) => c.startsWith("pass")) ? "pass" : "fail",
    evidence: clauses.join(" | ") }];
}
// self-contained settle (serialized into page.evaluate)
function settle0() {
  return new Promise((r) => setTimeout(() => requestAnimationFrame(() => r()), 0));
}
