// Validator: dom-structure (validator-set 0.1.0, structural layer)
// Covers S-UI-001 (stream structure/reading order/index binding), S-UI-002
// (per-letter elements + sealed state vocabulary), S-UI-003 (single active word
// tracking engine wordIndex), B-UI-006 (should: active word in scrollport).
const TOL = 2; // validation-plan tolerances.reading_order_px

function checkFreshStructure(scan) {
  const issues = [];
  if (!scan.containerFound) { issues.push("word-stream container not found"); return issues; }
  if (scan.words.length === 0) { issues.push("no word elements rendered"); return issues; }
  if (scan.indexBinding === null) issues.push("no data-attribute index binding on word elements");
  for (const w of scan.words) {
    if (w.binding !== null && w.wi !== w.i) issues.push(`word ${w.i}: index binding ${w.wi} != position`);
    const letterText = w.letters.map((l) => l.text).join("");
    if (letterText !== w.text) issues.push(`word ${w.i}: letter texts "${letterText}" != word text "${w.text}"`);
    if (w.text.length === 0) issues.push(`word ${w.i}: empty`);
    if (w.letters.length !== [...w.text].length)
      issues.push(`word ${w.i}: ${w.letters.length} letter elements for ${[...w.text].length} chars`);
  }
  // row-major non-decreasing reading order, 2px tolerance
  for (let i = 0; i + 1 < scan.words.length; i++) {
    const a = scan.words[i].rect, b = scan.words[i + 1].rect;
    const precedes = a.top < b.top - TOL || (Math.abs(a.top - b.top) <= TOL && a.left <= b.left + TOL);
    if (!precedes) issues.push(`reading order violated at words ${i}->${i + 1} (top ${a.top}->${b.top}, left ${a.left}->${b.left})`);
  }
  return issues;
}

function checkLetterVocabulary(scan, vocab, label, maxWords = Infinity) {
  const issues = [];
  const words = scan.words.slice(0, maxWords);
  for (const w of words) {
    if (w.bareText && w.bareText.trim().length > 0)
      issues.push(`${label} word ${w.i}: bare text "${w.bareText.slice(0, 12)}" — letters not element-wrapped`);
    for (let li = 0; li < w.letters.length; li++) {
      const L = w.letters[li];
      if (L.states.length > 1)
        issues.push(`${label} word ${w.i} letter ${li}: multiple state classes ${L.states.join("+")}`);
      for (const s of L.states) if (!vocab.includes(s))
        issues.push(`${label} word ${w.i} letter ${li}: out-of-vocabulary state class "${s}"`);
    }
  }
  return issues;
}

export function evaluateDomStructure(ctx) {
  const { scenarios, selectors } = ctx;
  const { freshScan, sessionScan, trace } = scenarios.scripted;
  const vocab = selectors.stateClasses;
  const results = [];

  // ---- S-UI-001 (fresh render, words-mode session) ----
  {
    const issues = checkFreshStructure(sessionScan.words.length ? sessionScan : freshScan);
    results.push({ invariant_id: "S-UI-001", layer: "structural", severity: "must",
      outcome: issues.length === 0 ? "pass" : "fail",
      evidence: issues.length ? issues.slice(0, 5).join(" | ")
        : `${sessionScan.words.length} words, binding=${sessionScan.indexBinding}, row-major order OK (2px tol)` });
  }
  // ---- S-UI-002 (fresh + every scripted/fuzz step sample) ----
  {
    let issues = checkLetterVocabulary(sessionScan, vocab, "fresh");
    for (const step of trace) if (step.dom) issues = issues.concat(checkLetterVocabulary(step.dom, vocab, `k${step.k}`, 12));
    const fuzzTrace = scenarios.fuzz?.trace ?? [];
    for (const step of fuzzTrace) if (step.dom && step.k % 7 === 0) issues = issues.concat(checkLetterVocabulary(step.dom, vocab, `${step.label}k${step.k}`, 12));
    results.push({ invariant_id: "S-UI-002", layer: "structural", severity: "must",
      outcome: issues.length === 0 ? "pass" : "fail",
      evidence: issues.length ? [...new Set(issues)].slice(0, 5).join(" | ")
        : `vocabulary ${vocab.join("/")} respected over ${trace.length}+${fuzzTrace.length} keystroke snapshots` });
  }
  // ---- S-UI-003 (fresh + after every keystroke, scripted and fuzz) ----
  {
    const issues = [];
    const checkStep = (scan, wiExpected, label) => {
      if (!scan) return;
      if (scan.activeIndices.length !== 1) { issues.push(`${label}: ${scan.activeIndices.length} active words (want 1)`); return; }
      if (scan.activeIndices[0] !== wiExpected) issues.push(`${label}: active index ${scan.activeIndices[0]} != engine wordIndex ${wiExpected}`);
    };
    checkStep(sessionScan, 0, "fresh");
    for (const step of trace) if (!step.after.completed) checkStep(step.dom, step.after.wordIndex, `k${step.k}`);
    for (const step of scenarios.fuzz?.trace ?? []) if (!step.after.completed) checkStep(step.dom, step.after.wordIndex, `${step.label}k${step.k}`);
    results.push({ invariant_id: "S-UI-003", layer: "structural", severity: "must",
      outcome: issues.length === 0 ? "pass" : "fail",
      evidence: issues.length ? [...new Set(issues)].slice(0, 5).join(" | ")
        : `exactly-one active word == wordIndex across ${trace.length}+${(scenarios.fuzz?.trace ?? []).length} keystrokes` });
  }
  // ---- B-UI-006 (should): active word within container visible scrollport ----
  {
    const issues = [];
    for (const step of trace) {
      if (!step.dom || step.after.completed) continue;
      const active = step.dom.words[step.after.wordIndex];
      if (!active) { issues.push(`k${step.k}: active word element missing`); continue; }
      const c = step.dom.containerRect, v = step.dom.viewport;
      const visTop = Math.max(c.top, 0), visBot = Math.min(c.bottom, v.height);
      const w = active.rect;
      const intersects = w.bottom > visTop && w.top < visBot && w.right > 0 && w.left < v.width;
      if (!intersects) issues.push(`k${step.k}: active word rect outside visible scrollport`);
    }
    results.push({ invariant_id: "B-UI-006", layer: "behavioral", severity: "should",
      outcome: issues.length === 0 ? "pass" : "fail",
      evidence: issues.length ? issues.slice(0, 4).join(" | ") : "active word visible after every scripted keystroke" });
  }
  return results;
}
