// Leaderboards v1.1.0 — read-time board derivation (isomorphic, zero deps,
// zero writes — O-LB-001). Board key: (mode=time, mode2 in {15,60}, language
// from the wordlists registry, timeWindow in {alltime, daily}) — S-LB-001.
import { round2 } from "./stats.js";

export const BOARD_MODE2 = ["15", "60"];
export const TIME_WINDOWS = ["alltime", "daily"];
export const DEFAULT_TOP_N = 50;
export const MAX_TOP_N = 100;
export const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000; // rolling 24h (C4 ruling)

// B-LB-001 eligibility: anticheat admit AND bailedOut=false AND
// minThresholdFailed !== true (v1.1.0 adoption of the C6 chain).
export function isEligible(r) {
  return r.anticheat?.decision === "admit" && !r.bailedOut && r.minThresholdFailed !== true;
}

// B-LB-005 daily window: (T-24h, T] under an injected clock (deterministic).
export function inWindow(r, timeWindow, now) {
  if (timeWindow === "daily") return r.timestamp > now - DAILY_WINDOW_MS && r.timestamp <= now;
  return true; // alltime: full history
}

// B-LB-006 percentile: 100 * rank / totalEligibleUsers (top-percentile;
// smaller is better — rank 1 of 200 => 0.5). totalEligibleUsers = distinct
// users with an eligible entry on the board at read time (one entry each).
export function percentileOf(rank, totalEligibleUsers) {
  return round2((100 * rank) / totalEligibleUsers);
}

// B-LB-007 XP accrual — documented deterministic per-result derivation,
// read-time, zero writes. Sealed inputs: wpm, acc, testDuration.
// Delegated coefficients (documented in the wave-2 implementation report):
//   xp = wpm * (acc / 100) * (testDuration / 60)
// i.e. one XP per "adjusted word": gross words (wpm x minutes) discounted by
// the accuracy fraction. Monotonic non-decreasing in each sealed input;
// same result => same xp. Aggregate XP/levels are user-profile (D8) scope.
export function xpOf({ wpm, acc, testDuration }) {
  return round2(wpm * (acc / 100) * (testDuration / 60));
}

// Full read-time recomputation (B-LB-003): no materialized boards, no cache.
// Returns { entries, totalEligibleUsers } — entries ranked (B-LB-002: wpm
// desc, ties by earlier timestamp asc; rank = 1-based position), each user
// contributing at most one entry (their best eligible result: higher wpm,
// tie -> earlier timestamp).
export function computeBoard(results, { mode2, language, timeWindow, now }) {
  const eligible = results.filter((r) =>
    r.mode === "time" && r.mode2 === mode2 && r.language === language &&
    isEligible(r) && inWindow(r, timeWindow, now));
  const bestByUser = new Map();
  for (const r of eligible) {
    const cur = bestByUser.get(r.uid);
    if (!cur || r.wpm > cur.wpm || (r.wpm === cur.wpm && r.timestamp < cur.timestamp)) bestByUser.set(r.uid, r);
  }
  const total = bestByUser.size;
  const entries = [...bestByUser.values()]
    .sort((x, y) => y.wpm - x.wpm || x.timestamp - y.timestamp) // B-LB-002
    .map((r, i) => ({
      rank: i + 1, uid: r.uid, name: r.name, wpm: r.wpm, rawWpm: r.rawWpm,
      acc: r.acc, consistency: r.consistency, timestamp: r.timestamp,
      percentile: percentileOf(i + 1, total), // B-LB-006
      xp: xpOf(r), // B-LB-007
    }));
  return { entries, totalEligibleUsers: total };
}
