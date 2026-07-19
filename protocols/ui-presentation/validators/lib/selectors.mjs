// Selector/discovery configuration. The bundle seals SEMANTICS (word-stream
// container, word elements, letter elements, state-class vocabulary, active
// class, caret element), not element IDs; these defaults match the reference
// lineage (v2.2 + candidate family) and every one is overridable via runner
// flags/env so the same suite can target a differently-shaped candidate.
export const DEFAULT_SELECTORS = {
  wordStream: "#words",            // word-stream container (S-UI-001)
  word: ".word",                   // word elements
  activeClass: "active",           // active-word class (sealed verbatim, P6)
  stateClasses: ["correct", "incorrect", "extra"], // sealed verbatim (S-UI-002, P6)
  caret: ["#caret", ".caret", "[data-caret]"],     // caret discovery (B-UI-001)
  liveStats: "#stats",             // live-stats region (B-UI-003 allowlist, Q3 delegated)
  testView: "#test",               // test view (hidden on completed_event, B-UI-004)
  resultView: "#result",           // results view (shown on completed_event)
  resultStats: "#resultStats",     // region presenting wpm/acc
  modeSelect: "#mode",             // mode control (validator sets words/10 for behavioral checks)
  mode2Select: "#mode2",
  restartButton: "#restart",
  wordsMode: { mode: "words", mode2: "15", expectedWords: 10 }, // v2.2 mapping 15->10 words
  indexBindingAttrs: ["data-wi", "data-index", "data-word-index"], // S-UI-001 index binding candidates
  engineModuleRe: "\\/engine\\/session\\.js(\\?|$)",               // S-UI-005 feed() capture rewrite target
  resultsPostRe: "\\/api\\/results(\\?|$)",                        // B-UI-004 POST interception target
};
