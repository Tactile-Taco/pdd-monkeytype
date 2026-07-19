// Validator: dom-mutation-confinement (validator-set 0.1.0, behavioral layer)
// Covers B-UI-003: per keystroke, DOM mutations are confined to the word
// element(s) active immediately before/after that keystroke, plus the caret and
// the live-stats region. Committed words are not re-rendered by later
// keystrokes. Full re-render is permitted only on restart/new-test (session
// boundary) and the completing keystroke ends the session (results boundary).
export function evaluateMutationConfinement(ctx) {
  const { scenarios } = ctx;
  const violations = [];
  let stepsWithMutations = 0, recordsSeen = 0;

  const evalTrace = (trace, tag) => {
    for (const step of trace) {
      if (step.after.completed) continue; // completion boundary: results transition allowed
      const allowedWords = new Set([step.before.wordIndex, step.after.wordIndex]);
      let own = 0;
      for (const m of step.mutations ?? []) {
        if (m.changed === false) { recordsSeen++; continue; } // no-op attribute/characterData set: not re-classing
        recordsSeen++;
        if (m.region === "word") {
          if (!allowedWords.has(m.word)) {
            violations.push(`${tag}k${step.k}: mutation on committed/inactive word ${m.word} (allowed ${[...allowedWords].join(",")})`);
          } else own++;
        } else if (m.region === "stats" || m.region === "caret") {
          own++; // explicitly allowed regions
        } else if (m.region === "wordstream") {
          if (m.type === "childList" && (m.added > 0 || m.removed > 0))
            violations.push(`${tag}k${step.k}: word-stream container re-render (childList +${m.added}/-${m.removed}) mid-session`);
        } else {
          violations.push(`${tag}k${step.k}: mutation outside allowed regions (${m.region}, ${m.type}${m.attr ? " " + m.attr : ""})`);
        }
      }
      if (own > 0) stepsWithMutations++;
    }
  };

  evalTrace(scenarios.scripted.trace, "scripted");
  for (const step of scenarios.fuzz?.trace ?? []) evalTrace([step], `${step.label}`);

  return [{ invariant_id: "B-UI-003", layer: "behavioral", severity: "must",
    outcome: violations.length === 0 ? "pass" : "fail",
    evidence: violations.length ? [...new Set(violations)].slice(0, 5).join(" | ")
      : `${recordsSeen} mutation records across scripted+fuzz keystrokes all confined to {active_before, active_after, caret, stats}` }];
}
