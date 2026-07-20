// Lazy-mode diacritic equivalence (typing-test-engine B-ENG-009(c)).
// A target character carrying diacritics accepts the unaccented base character
// as correct-equivalent. Equivalence table scope (delegated data — "verify
// equivalence table scope at authoring" settled here): Unicode NFD decomposition
// + stripping of combining diacritical marks (U+0300–U+036F). This covers the
// precomposed Latin ranges (á é ñ ç ü …). Letters WITHOUT an NFD decomposition
// (ø, ß, æ, ł, đ …) remain strict — they are not base+mark composites.
// Equivalence is directional: only the TARGET may carry the diacritic; an
// accented input for an unaccented target is not equivalent.
// Zero dependencies (O-ENG-003); pure computation.
export function stripDiacritics(ch) {
  return ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function carriesDiacritic(ch) {
  return stripDiacritics(ch) !== ch;
}

// One-position comparison. `lazy` enables the base-char equivalence.
export function charsEqual(input, target, lazy = false) {
  if (input === target) return true;
  if (!lazy || input === undefined || target === undefined) return false;
  return carriesDiacritic(target) && stripDiacritics(target) === input;
}

// Whole-word comparison (same length, every position equal).
export function wordMatches(input, target, lazy = false) {
  if (!lazy) return input === target;
  if (input.length !== target.length) return false;
  for (let i = 0; i < input.length; i++) if (!charsEqual(input[i], target[i], true)) return false;
  return true;
}

// Lazy-aware "input is a correct prefix of target" (partial-credit rule).
export function wordPrefixMatches(input, target, lazy = false) {
  if (!lazy) return target.startsWith(input);
  if (input.length > target.length) return false;
  for (let i = 0; i < input.length; i++) if (!charsEqual(input[i], target[i], true)) return false;
  return true;
}
