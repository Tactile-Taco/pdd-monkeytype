// Deterministic word supply: seeded RNG (mulberry32) + static lists.
// Engine receives all data by injection — no I/O (O-ENG-001/O-ENG-003).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ENGLISH_200 = (
  "the of and to in is you that it he was for on are as with his they I " +
  "at be this have from or one had by word but not what all were we when " +
  "your can said there use an each which she do how their if will up other " +
  "about out many then them these so some her would make like him into time " +
  "has look two more write go see number no way could people my than first " +
  "water been call who oil its now find long down day did get come made may " +
  "part over new sound take only little work know place year live me back " +
  "give most very after thing our just name good sentence man think say great " +
  "where help through much before line right too mean old any same tell boy " +
  "follow came want show also around form three small set put end does another " +
  "well large must big even such because turn here why ask went men read need " +
  "land different home us move try kind hand picture again change off play " +
  "spell air away animal house point page letter mother answer found study " +
  "still learn should world high"
).split(" ");

export function generateWords(count, seed = 1, list = ENGLISH_200) {
  const rnd = mulberry32(seed);
  const out = [];
  for (let i = 0; i < count; i++) out.push(list[Math.floor(rnd() * list.length)]);
  return out;
}

// ---- generation decoration (B-ENG-009) ----
// Applied at word-stream generation; keystroke semantics unchanged — decorated
// characters are ordinary target characters for typing and accounting.
// Deterministic given (word list, config, stream position) via the injected rng
// (clause d); never produces empty target words (clause e).
// Injection fractions/table contents are delegated data (invariant rationale);
// the tables below are the settled local choices (english conventions):
//   numbers: 15% of words replaced by a 1–4 digit number token; number tokens
//            are not further punctuated.
//   punctuation: 8% sentence-start capitalization; 10% terminal mark from
//            . , ! ? ; :
const NUMBER_FRACTION = 0.15;
const CAPITALIZE_FRACTION = 0.08;
const TERMINAL_FRACTION = 0.10;
const TERMINAL_MARKS = [".", ",", ".", "!", "?", ";", ":"]; // '.' twice: period-weighted

export function decorateWords(words, rnd, { punctuation = false, numbers = false } = {}) {
  if (!punctuation && !numbers) return words; // identity — v1.1.0 stream unchanged
  return words.map((w) => {
    let out = w;
    if (numbers && rnd() < NUMBER_FRACTION) {
      const len = 1 + Math.floor(rnd() * 4);
      out = String(Math.floor(rnd() * 10 ** len)); // 1..len digits, never empty
      return out; // number tokens are not further punctuated (delegated choice)
    }
    if (punctuation) {
      if (rnd() < CAPITALIZE_FRACTION) out = out[0].toUpperCase() + out.slice(1);
      if (rnd() < TERMINAL_FRACTION) out = out + TERMINAL_MARKS[Math.floor(rnd() * TERMINAL_MARKS.length)];
    }
    return out.length > 0 ? out : w; // clause (e): never empty (defensive)
  });
}
