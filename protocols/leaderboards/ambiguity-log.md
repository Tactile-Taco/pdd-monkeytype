# Ambiguity log — leaderboards
## Resolved assumptions
- Read-time recomputation instead of materialized boards (simpler; B-LB-003 makes freshness an invariant) [team decision].
- Boards limited to time/15 and time/60 english in v1 [orchestrator, REF].
- Tie-break: earlier timestamp wins [orchestrator, REF].

## v1.1.0 (additive MINOR — brownfield D7; SEALED 2026-07-20)

## Round-6 ruling record
- BQ-LB-01 → XP STAYS in leaderboards v1.1.0 (derives from result/board-
  eligibility rules living here; user-profile consumes the sealed fields).
  Deliberate override of the r1 assignment; rationale recorded in B-LB-007.
- BQ-LB-02 → daily boards use the SAME top-N as all-time (parity; single
  limit constant: N<=100, default 50 — already the sealed protocol text).
- Open at sealing: none.

- **minThresholdFailed exclusion (B-LB-001 amendment).** Consumer-side clause
  recorded at test-results v1.2.0 lands here (engine B-ENG-010 → storage
  B-RES-001/003 → eligibility here). [C6 chain]
- **Daily boards (B-LB-005).** C4 ruled ROLLING 24h pre-seal; window explicit
  (T-24h, T], deterministic under injected clock. [verify at implementation:
  UTC-calendar-day reference divergence would be behavior-changing → back to
  negotiation]
- **Language boards (S-LB-001 amendment).** Language validated against the
  wordlists registry (new consumes). english-only restriction lifted via
  this event. [D7; round-5 cross-reference]
- **Percentile (B-LB-006).** 100 * rank / totalEligibleUsers, smaller =
  better; formula sealed, display delegated.
- **XP accrual (B-LB-007).** Per-result derivation, read-time, zero writes;
  inputs sealed (wpm, acc, testDuration), coefficients at implementation
  [verify]. Aggregate XP/level stays user-profile (D8).
- **Must count:** 10 (7 legacy + 3), inside ≤12.
## Open questions
- BQ-LB-01: XP placement — roadmap-r1 assigned XP accrual to D8
  (user-profile); round-5 instruction drafts per-result XP here. Drafted
  HERE per instruction (read-time derivation preserves both options:
  user-profile can consume these fields). Confirm placement or move.
- BQ-LB-02: daily board top-N limit — same N<=100/default 50 as alltime?
  [verify reference at implementation]
- Friends boards remain deferred (out of scope).
