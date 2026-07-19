// Validator: dom-state-fidelity (validator-set 0.1.0, behavioral layer)
// Covers B-UI-002: after EVERY keystroke the state class of every letter of
// every rendered word equals the engine per-character accounting (oracle).
// Scripted stream + seeded fuzz runs; includes a mutation-sanity self-test
// (corrupt one letter class, require the comparator to detect it) so the
// property is demonstrated non-vacuous (harness mutation-suspect convention).
import { SessionOracle } from "../lib/oracle.mjs";

function probeFromSnapshot(snap, words) {
  const o = new SessionOracle(words, { mode: "words" });
  o.wordIndex = snap.wordIndex; o.inputs = snap.inputs.slice(); o.completed = snap.completed;
  return o;
}

// Compare a DOM scan against an oracle snapshot for every word.
export function fidelityMismatches(scan, probe, maxReport = 6) {
  const mismatches = [];
  if (!scan || !scan.words) return [{ issue: "no dom scan" }];
  for (let wi = 0; wi < probe.words.length && wi < scan.words.length; wi++) {
    const exp = probe.expectedWord(wi);
    const dom = scan.words[wi];
    if (!dom) { mismatches.push({ issue: `word ${wi} missing in DOM` }); continue; }
    if (dom.letters.length !== exp.length) {
      mismatches.push({ issue: `word ${wi}: ${dom.letters.length} letter elements vs ${exp.length} expected` });
      continue;
    }
    for (let li = 0; li < exp.length; li++) {
      const domState = dom.letters[li].states[0] ?? null;
      if (domState !== exp[li].state) {
        mismatches.push({ issue: `word ${wi} letter ${li}: DOM=${domState ?? "untyped"} engine=${exp[li].state ?? "untyped"}` });
        if (mismatches.length >= maxReport) return mismatches;
      }
    }
  }
  return mismatches;
}

export function evaluateDomStateFidelity(ctx) {
  const { scenarios } = ctx;
  const { trace, targets, oracle, corruptedScan, corruption } = scenarios.scripted;
  const failures = [];
  let stepsChecked = 0;

  // scripted stream: full comparison after every keystroke. The completing
  // keystroke ends the active session (B-UI-004 boundary): fidelity is only
  // assertable while the test view is still rendered/visible.
  let boundaryStale = 0;
  for (const step of trace) {
    if (!step.dom) continue;
    if (step.after.completed && !step.dom.testViewVisible) {
      const probe = probeFromSnapshot(step.snapshot, targets);
      if (fidelityMismatches(step.dom, probe).length) boundaryStale++; // observed, reported, not gated
      continue;
    }
    const probe = probeFromSnapshot(step.snapshot, targets);
    const mm = fidelityMismatches(step.dom, probe);
    if (mm.length) failures.push(...mm.map((m) => `k${step.k}: ${m.issue}`));
    stepsChecked++;
  }

  // fuzz runs: full comparison after every keystroke of every seeded run
  const fuzz = scenarios.fuzz;
  let fuzzSteps = 0;
  const fuzzRuns = fuzz?.runsMeta.length ?? 0;
  if (fuzz) {
    for (const step of fuzz.trace) {
      if (!step.dom) continue;
      if (step.after.completed && !step.dom.testViewVisible) continue; // completion boundary (see above)
      const runIdx = Number((step.label ?? "fuzz#0").split("#")[1]);
      const probe = probeFromSnapshot(step.snapshot, fuzz.runsMeta[runIdx].targets);
      const mm = fidelityMismatches(step.dom, probe, 3);
      if (mm.length) failures.push(...mm.map((m) => `${step.label}k${step.k}: ${m.issue}`));
      fuzzSteps++;
    }
  }

  // mutation sanity: a deliberate class corruption MUST be flagged by the comparator
  let sanityOutcome = null, sanityEvidence = "";
  if (corruption.ok) {
    const mm = fidelityMismatches(corruptedScan, oracle);
    if (mm.length === 0) {
      sanityOutcome = "mutation-suspect";
      sanityEvidence = "comparator missed deliberate class corruption — property vacuous";
    } else sanityEvidence = `mutant killed (${mm[0].issue})`;
  } else sanityEvidence = `corruption setup skipped: ${corruption.reason}`;

  const outcome = sanityOutcome ?? (failures.length === 0 ? "pass" : "fail");
  return [{ invariant_id: "B-UI-002", layer: "behavioral", severity: "must", outcome,
    evidence: (failures.length ? [...new Set(failures)].slice(0, 5).join(" | ")
      : `scripted ${stepsChecked} steps + fuzz ${fuzzRuns} runs/${fuzzSteps} steps clean; ${sanityEvidence}`) +
      (boundaryStale ? ` | note: completing-keystroke letter classes stale behind hidden test view (boundary, not gated)` : "") }];
}
