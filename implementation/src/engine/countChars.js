// Per-word character accounting — reference-faithful semantics (B-ENG-004).
// Positions: equal -> allCorrect (correctWord only when whole word correct, or
// partial credit on the active word); input missing -> missed (unless partial);
// target missing -> extra; else -> incorrect.
// v2.0.0: optional `lazy` flag — a target char carrying diacritics accepts the
// unaccented base char as correct-equivalent (B-ENG-009(c), see lazy.js).
// Default false reproduces v1.1.0 accounting exactly.
import { charsEqual, wordMatches, wordPrefixMatches } from "./lazy.js";

export function countChars(inputWord, targetWord, creditPartial = false, lazy = false) {
  let allCorrect = 0, correctWord = 0, incorrect = 0, extra = 0, missed = 0;
  const wordCorrect = wordMatches(inputWord, targetWord, lazy);
  const wordPartiallyCorrect = wordPrefixMatches(inputWord, targetWord, lazy);
  const n = Math.max(inputWord.length, targetWord.length);
  for (let i = 0; i < n; i++) {
    const ic = inputWord[i];
    const tc = targetWord[i];
    if (ic === tc || (lazy && ic !== undefined && tc !== undefined && charsEqual(ic, tc, true))) {
      allCorrect += 1;
      if (wordCorrect || (creditPartial && wordPartiallyCorrect)) correctWord += 1;
    } else if (ic === undefined) {
      if (!creditPartial) missed += 1;
    } else if (tc === undefined) {
      extra += 1;
    } else {
      incorrect += 1;
    }
  }
  return { allCorrect, correctWord, incorrect, extra, missed };
}
