# Ambiguity log — quote-library
## Resolved assumptions
- Length groups fixed at [[1,100],[101,300],[301,600],[601,inf)] chars. [orchestrator: reference uses four configured ranges]
- Normalization for dedupe: trim + collapse whitespace + casefold. [assumption]

## v1.1.0 (additive MINOR — brownfield D6; SEALED 2026-07-20)

## Round-6 ruling record
- BQ-QT-02 → legacy exception GRANTED: 13 musts stand; B-QT-009 stays must
  ("search/browse stability is user-visible"). Ledger: engine 18,
  ui-presentation 19, test-results 13, quote-library 13.
- BQ-QT-01 → refusal metadata shape APPROVED as drafted (state enum +
  moderationNote + consistency clause approved⇔state=approved).
- Open at sealing: none.

- **C5 tri-state moderation (B-QT-006).** Additive `state` enum
  (pending/approved/refused) + optional moderationNote; `approved` boolean
  retained with the consistency clause approved=true ⇔ state=approved —
  orchestrator-approved path over a boolean→enum break (would have forced a
  major). Refused persisted with metadata, never served. [C5 ruling; verify
  metadata fields at implementation]
- **Rating-weight influence (B-QT-007).** Sealed as weight-function
  monotonicity + seeded reproducibility, NOT sampled-outcome statistics —
  deterministic validator, no flake budget. [D6; verify reference weighting]
- **Favorites (B-QT-008)** and **search/browse (B-QT-009)**: D6 residual.
  Pagination/ordering documented at implementation [verify].
- **Per-quote PB:** no work — already keyed via B-RES-003 (mode2=quote id);
  recorded in roadmap corrections.
- **Quote language filter vs wordlists registry:** deliberately NOT consumed
  in this minor — quote languages may exceed wordlist languages in the
  reference; registry alignment would be a should at best. Revisit with
  ground truth. [author; cross-bundle note]
- **Must count:** 13 (9 legacy + B-QT-006..009) — over ≤12 as a legacy
  bundle. BQ-QT-02: grant the exception (test-results-13 precedent) or
  demote B-QT-009 (search/browse) to should (→12).
## Open questions
- BQ-QT-01: refusal metadata — is a free-text moderationNote sufficient, or
  does the reference carry structured refusal reasons? [verify at
  implementation; schema is additive-ready either way]
- BQ-QT-02: 13 musts — legacy exception or demote B-QT-009 to should.
- Report/flag flow for bad quotes (deferred).
