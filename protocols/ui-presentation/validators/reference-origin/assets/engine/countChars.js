// Per-word character accounting — reference-faithful semantics (B-ENG-004).
// Positions: equal -> allCorrect (correctWord only when whole word correct, or
// partial credit on the active word); input missing -> missed (unless partial);
// target missing -> extra; else -> incorrect.
export function countChars(inputWord, targetWord, creditPartial = false) {
  let allCorrect = 0, correctWord = 0, incorrect = 0, extra = 0, missed = 0;
  const wordCorrect = inputWord === targetWord;
  const wordPartiallyCorrect = targetWord.startsWith(inputWord);
  const n = Math.max(inputWord.length, targetWord.length);
  for (let i = 0; i < n; i++) {
    const ic = inputWord[i];
    const tc = targetWord[i];
    if (ic === tc) {
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
