# Ambiguity log — test-results
## Resolved assumptions
- Idempotency keyed on client hash field per reference behavior [orchestrator, REF].
- PB tuple: (mode, mode2, language, punctuation, numbers) [orchestrator, REF].
- chartData/key arrays may be elided in list responses ('toolong' elision in reference) [orchestrator, REF]; v1 stores them, elides in history list.

## v1.2.0 (additive MINOR — brownfield D5a; SEALED 2026-07-20)

## Round-5 ruling record
- BQ-RES-01 → legacy-bundle exception GRANTED: test-results holds 13 musts
  (B-RES-006(e) stays must — "filter integrity is user-visible correctness").
  Exception ledger: engine 18, ui-presentation 19, test-results 13.
- Open at sealing: none.

- **Zen persistence (RULED by orchestrator, BQ-ENG-06 follow-through).**
  Sealed: zen submissions are NOT persisted — admitted verdict returned with
  a non-stored indicator, no record written, history never contains mode=zen.
  Reference [verify]: zen results are not saved to history by default; if an
  opt-in override exists in the reference it arrives later as an additive
  user-config key (batch 3+) with a gated amendment here. Non-stored response
  shape (field name/HTTP code) specified at implementation from the existing
  envelope helper — cosmetic, logged then. [criticality: behavior-changing;
  orchestrator-ruled pre-seal]
- **minThresholdFailed adoption (C6).** Flag persisted on the stored record
  (schema extended additively), visible in history, never PB (B-RES-003
  exclusion), excluded from PB reads. Leaderboard exclusion is consumer-side
  — leaderboards 1.1.0 amends B-LB-001 eligibility; recorded there-to-come.
- **PB tuple sealed explicitly (C7).** Unchanged behavior; the explicit seal
  forecloses drift. Tag interaction [verify at implementation]: tag-scoped
  PB sealed as READ-TIME derivation (B-RES-006(e)), never a second keying;
  reference divergence here is behavior-changing → back to negotiation.
- **Tags (B-RES-006 composite).** CRUD + assign + filter + delete-cascade +
  scoped PB read. Tag names unique per user case-insensitively [verify];
  multi-tag filter = intersection [verify]. tags.json added to capability
  write list (same-file storage would need no manifest change; separate file
  pre-authorized to avoid an implementation-time capability patch).
- **completed-event local copy:** optional unit + minThresholdFailed fields
  documented for parity with engine v2 (additionalProperties true already
  admitted them; documentation, not a rule change).
- **Must count:** 13 after this event (12 legacy + B-RES-006). Over the ≤12
  new-bundle budget as a legacy bundle — BQ-RES-01 to orchestrator: grant
  the exception (engine 18 / ui-presentation 19 precedent) or demote
  B-RES-006(e) tag-scoped PB to should (→12 exactly).
## Open questions
- Result deletion/gdpr flows remain deferred (out of scope).
