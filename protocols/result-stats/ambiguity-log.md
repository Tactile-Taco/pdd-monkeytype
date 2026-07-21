# Ambiguity log — result-stats

## v1.0.0 (NEW bundle — brownfield D5b; SEALED 2026-07-20)

## Round-5 ruling record
- BQ-STS-01 → time-typing = sum(testDuration) RULED [verify at
  implementation; afkDuration subtraction would be a one-line formula
  amendment].
- BQ-STS-02 → per-(mode, mode2) dimension APPROVED and applied
  (aggregates.schema.json gains required mode2; B-STS-002 formulas keyed
  per pair).
- Open at sealing: none.

Topology adjudicated (roadmap-author-r1 D5 split, accepted r2): write path
stays in test-results; this bundle is pure read-only derivation over the
stored-result handshake. Validator cost discipline: no browser, no production
data — determinism + fixture-based recompute-consistency only.

## Resolved assumptions
- Derivation formulas are DOCUMENTED IN B-STS-002 and are the contract
  (counts, sums, means, UTC day buckets, chronological series; empty-set → 0).
  [author; cosmetic until reference ground truth says otherwise]
- Activity buckets are UTC calendar days (no user-timezone surface this
  iteration). [assumption; verify reference at implementation]
- PB table derives from the stored isPb flags (maintained by test-results
  per B-RES-003), never recomputed from raw max — single authority for PB
  transitions. Zen results never appear (never stored per test-results
  v1.2.0). [author]
- bailedOut / minThresholdFailed results: INCLUDED in aggregates/activity/
  series (they are real typing activity), EXCLUDED from the PB table (no
  isPb flag possible). Reference inclusion rules [verify at implementation];
  any exclusion = formula amendment, never silent filtering. [author]
- Storage mechanism (in-process reader call vs shared store file) is a
  candidate concern; the contract is the handshake. Capability manifest
  permits reading the shared results store. [author]
- Rolling 10/100-test averages, accuracy histogram, tag-filtered stats:
  later additive minors (need reference ground truth on exact reference
  formulas first). [feature-inventory; deferred deliberately]


