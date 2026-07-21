// Result-stats v1.0.0 — read-only derivations over a user's stored results.
// Isomorphic, zero deps, zero writes (O-STS-001). Every served value equals its
// documented recomputation formula (B-STS-002); identical store state produces
// byte-identical responses (B-STS-001 — explicit stable orderings below).
// Inclusion rule (B-STS-002, sealed): bailedOut and minThresholdFailed results
// are INCLUDED in aggregates/activity/series (real typing activity), EXCLUDED
// from the PB table (they can never carry isPb — test-results B-RES-003/004).
import { round2 } from "./stats.js";

const tupleKey = (r) => [r.mode, r.mode2, r.language, !!r.punctuation, !!r.numbers].join("");

// Per-(mode, mode2) aggregates (B-STS-002):
//   testsCompleted = count; timeTypingSeconds = sum(testDuration) (round-5 ruling
//   BQ-STS-01: afkDuration is NOT subtracted); avgWpm/avgAcc = mean (0 when empty).
// Rows are emitted for exactly the pairs present in the input, sorted (mode, mode2).
export function computeAggregates(mine) {
  const byPair = new Map();
  for (const r of mine) {
    const k = r.mode + "" + r.mode2;
    const a = byPair.get(k) ?? { mode: r.mode, mode2: r.mode2, testsCompleted: 0, timeTypingSeconds: 0, wpmSum: 0, accSum: 0 };
    a.testsCompleted += 1;
    a.timeTypingSeconds += r.testDuration;
    a.wpmSum += r.wpm;
    a.accSum += r.acc;
    byPair.set(k, a);
  }
  const modes = [...byPair.values()]
    .sort((x, y) => x.mode < y.mode ? -1 : x.mode > y.mode ? 1 : x.mode2 < y.mode2 ? -1 : x.mode2 > y.mode2 ? 1 : 0)
    .map((a) => ({
      mode: a.mode, mode2: a.mode2,
      testsCompleted: a.testsCompleted,
      timeTypingSeconds: round2(a.timeTypingSeconds),
      avgWpm: a.testsCompleted ? round2(a.wpmSum / a.testsCompleted) : 0,
      avgAcc: a.testsCompleted ? round2(a.accSum / a.testsCompleted) : 0,
    }));
  return { modes };
}

// PB table (B-STS-002): exactly one entry per sealed C7 tuple = the stored
// result flagged isPb for that tuple (single authority: the isPb flags
// maintained by test-results; never recomputed from raw max). Sorted by tuple.
export function computePbTable(mine) {
  const pbs = mine
    .filter((r) => r.isPb === true && !r.bailedOut && r.minThresholdFailed !== true)
    .map((r) => ({ mode: r.mode, mode2: r.mode2, language: r.language,
                    punctuation: !!r.punctuation, numbers: !!r.numbers,
                    wpm: r.wpm, acc: r.acc, timestamp: r.timestamp, _k: tupleKey(r) }))
    .sort((x, y) => (x._k < y._k ? -1 : x._k > y._k ? 1 : 0))
    .map(({ _k, ...rest }) => rest);
  return { pbs };
}

// Activity series (B-STS-002): results bucketed by UTC calendar day of
// timestamp; counts + duration sums; ascending by date.
export function utcDay(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}
export function computeActivity(mine) {
  const byDay = new Map();
  for (const r of mine) {
    const d = utcDay(r.timestamp);
    const a = byDay.get(d) ?? { date: d, testsCompleted: 0, timeTypingSeconds: 0 };
    a.testsCompleted += 1;
    a.timeTypingSeconds += r.testDuration;
    byDay.set(d, a);
  }
  const days = [...byDay.values()]
    .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
    .map((a) => ({ date: a.date, testsCompleted: a.testsCompleted, timeTypingSeconds: round2(a.timeTypingSeconds) }));
  return { days };
}

// wpm-over-time series (B-STS-002): (timestamp, wpm, acc) chronological ascending.
export function computeWpmSeries(mine) {
  const series = mine
    .map((r) => ({ timestamp: r.timestamp, wpm: r.wpm, acc: r.acc }))
    .sort((x, y) => x.timestamp - y.timestamp);
  return { series };
}
