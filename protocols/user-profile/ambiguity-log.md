# Ambiguity log — user-profile

## v1.0.0 (NEW bundle — brownfield D8; SEALED 2026-07-21)

## Round-7 ruling record
- BQ-PRO-01 → isPublic INCLUDED (default true [verify at implementation]);
  private profile => public reads return the identical 404-shaped envelope
  as unknown names (O-RES-004 precedent); owner reads unaffected. Applied:
  profile-update schema + B-PRO-004/B-PRO-005.
- BQ-PRO-02 → single source of truth: streaks derive ONLY from the
  result-stats activity series; this bundle never computes streaks
  independently. Applied: B-PRO-002 clause.
- Open at sealing: none.


Topology adjudicated (roadmap-author-r1 D8, accepted r2): compose-only over
sealed handshakes; user-account FROZEN (identity provider for every other
bundle — lowest blast radius wins; confirmed again in the D8 instruction).

## Resolved assumptions
- Composition map (B-PRO-001): identity ← user-account (frozen); pbs/
  aggregates ← result-stats; xp ← sealed per-result fields (leaderboards
  B-LB-007, placement confirmed round 6); streaks ← activity series.
  Pass-through payloads are opaque in this schema (validated at source),
  equality sealed by B-PRO-001 — cross-bundle $ref avoided deliberately
  (resolver fragility; fork-rule referencing is by handshake, not $ref).
- Streak rules sealed with [verify] (B-PRO-002): consecutive UTC-day active
  days; streak alive iff last active day is today or yesterday UTC; current
  vs max. Injected-clock boundary fuzz is the validator.
- Level (B-PRO-003): monotonicity + determinism sealed; curve coefficients
  delegated to implementation ground truth [verify] (B-QT-007 discipline).
- Editable fields: bio ≤500, avatar = https URL ONLY (no blob storage —
  capability discipline), socials website/twitter/github ≤200 (website
  https). All-or-nothing writes. [feature-inventory; verify field list —
  reference also shows keyboard/social handles beyond these three]
- Public read exposes the public shape only; private/own read adds nothing
  sensitive either (tokens/email never in this bundle). [author]
- DEFERRED deliberately (not in v1): badges, name-change history,
  opt-out-of-leaderboards flag, xp/level DISPLAY variants, profile
  privacy toggles (all-public vs private). [scope triage; future minor]

## Open questions
- BQ-PRO-01: does the reference gate public visibility behind a per-user
  privacy toggle (profile hidden by default)? If yes, a `public: boolean`
  field is additive here — request ground truth before sealing B-PRO-005's
  "unknown or non-public name" clause.
- BQ-PRO-02: streaks and "time typing" display — reference shows hours
  rounded; derivation is covered by result-stats aggregates; confirm no
  separate streak-vs-activity divergence (B-PRO-002 assumes activity series
  is the single source).
