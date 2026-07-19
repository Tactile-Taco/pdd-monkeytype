// Validator: caret-tracking (validator-set 0.1.0, behavioral layer)
// Covers B-UI-001: single caret element; rect tracks logical caret position
// (wordIndex, n = inputs[wordIndex].length) within 2px horizontally of the
// letter boundary, vertically overlapping the active word's line box; visible
// in >= 1 of 3 samples 250ms apart (blink-phase tolerance; blink/shape delegated).
import { openSessionPage } from "../lib/browser.mjs";
import { scan, readTargets, setWordsMode, focusWords } from "../lib/driver.mjs";

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
  } finally {
    await sp.close();
    ctx.artifactMetas.push(sp.meta);
  }

  return [{ invariant_id: "B-UI-001", layer: "behavioral", severity: "must",
    outcome: failures.length === 0 ? "pass" : "fail",
    evidence: failures.length ? [...new Set(failures)].slice(0, 5).join(" | ")
      : `caret tracked over ${checked} keystrokes (2px tol); visibility 3-sample check OK` }];
}
