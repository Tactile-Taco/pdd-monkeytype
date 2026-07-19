// Shared pure statistics — protocol-critical formulas (typing-test-engine B-ENG-001/002/003).
// Zero dependencies (O-ENG-003). Used by engine, anticheat, and harness.
export function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

export function mean(xs) {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdDev(xs) {
  if (xs.length === 0) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

// B-ENG-002: kogasa(cov) = 100 * (1 - tanh(cov + cov^3/3 + cov^5/5))
export function kogasa(cov) {
  return 100 * (1 - Math.tanh(cov + Math.pow(cov, 3) / 3 + Math.pow(cov, 5) / 5));
}

// B-ENG-001: wpm = (charCount / 5) / (seconds / 60); duration <= 0 => 0
export function calculateWpm(charCount, durationSeconds) {
  if (durationSeconds <= 0) return 0;
  return charCount / 5 / (durationSeconds / 60);
}

// Consistency family: kogasa(stddev/mean); NaN/invalid => 0 (B-ENG-002)
export function consistencyOf(samples) {
  if (!samples || samples.length === 0) return 0;
  const m = mean(samples);
  const sd = stdDev(samples);
  const c = round2(kogasa(sd / m));
  return !c || Number.isNaN(c) ? 0 : c;
}
