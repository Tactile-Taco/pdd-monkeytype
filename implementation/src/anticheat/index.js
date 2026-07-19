// result-anticheat protocol — pure admission function (O-AC-001: no I/O, no state).
import { calculateWpm, round2 } from "../shared/stats.js";

const REASONS = ["wpm_bound", "raw_bound", "acc_bound", "stat_mismatch",
                 "spacing_implausible", "duration_implausible", "malformed"];

function wpmBoundExceeded(wpm, mode, mode2) {
  if (wpm < 0) return true;
  const isWords10 = mode === "words" && mode2 === "10";
  return isWords10 ? wpm > 420 : wpm > 350;
}

// evaluate(request) -> verdict (S-AC-001/002, B-AC-001..006). Never throws (B-AC-005).
export function evaluate(req) {
  const reject = (reasons) => ({ decision: "reject", reasons, evaluated_at: req?.event?.timestamp ?? 0 });
  try {
    if (!req || typeof req !== "object") return reject(["malformed"]);
    const { event, keySpacingStats, keyDurationStats, lbOptOut } = req;
    if (!event || typeof event !== "object") return reject(["malformed"]);
    const reasons = [];
    const { wpm, rawWpm, acc, mode, mode2, charTotal, testDuration } = event;
    for (const v of [wpm, rawWpm, acc, charTotal, testDuration]) {
      if (typeof v !== "number" || Number.isNaN(v)) reasons.push("malformed");
    }
    if (reasons.length) return reject([...new Set(reasons)]);
    // B-AC-001
    if (wpmBoundExceeded(wpm, mode, mode2)) reasons.push("wpm_bound");
    if (wpmBoundExceeded(rawWpm, mode, mode2)) reasons.push("raw_bound");
    // B-AC-002
    const accFloor = lbOptOut === true ? 50 : 75;
    if (acc < accFloor || acc > 100) reasons.push("acc_bound");
    // B-AC-003: cross-check claimed wpm vs charTotal/testDuration (tolerance 1.0)
    if (testDuration > 0) {
      const recomputed = round2(calculateWpm(charTotal, testDuration));
      if (Math.abs(recomputed - rawWpm) > 1.0) reasons.push("stat_mismatch");
    } else {
      reasons.push("duration_implausible");
    }
    // B-AC-004: key timing plausibility over >=50 keystrokes
    const nKeys = Array.isArray(event.keySpacing) ? event.keySpacing.length + 1 : 0;
    if (nKeys >= 50) {
      if (!keySpacingStats || typeof keySpacingStats.average !== "number" ||
          typeof keySpacingStats.sd !== "number") {
        reasons.push("malformed");
      } else if (keySpacingStats.average < 20 || keySpacingStats.sd === 0) {
        reasons.push("spacing_implausible");
      }
    }
    if (reasons.length) return reject([...new Set(reasons)]);
    return { decision: "admit", reasons: [], evaluated_at: event.timestamp ?? 0 };
  } catch {
    return { decision: "reject", reasons: ["malformed"], evaluated_at: 0 }; // B-AC-005 fail closed
  }
}

export { REASONS };
