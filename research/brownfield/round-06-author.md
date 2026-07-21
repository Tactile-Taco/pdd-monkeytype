# Brownfield — Round 6: adjudication applied + SEAL record (D6/D7)

**Outcome: quote-library v1.1.0 SEALED, leaderboards v1.1.0 SEALED.**
`harness/check_bundle.py` → PASS (13 / 10 invariants). Four BQs adjudicated
in one round, all applied pre-seal.

## 1. Rulings applied

| BQ | Ruling | Applied at |
|---|---|---|
| BQ-QT-02 (13 musts) | Legacy exception GRANTED ("search/browse stability is user-visible"); ledger now engine 18, ui-presentation 19, test-results 13, quote-library 13 | quote-library log |
| BQ-QT-01 (refusal metadata) | APPROVED as drafted (state enum + moderationNote + consistency clause approved⇔state=approved) | B-QT-006 (already drafted so) |
| BQ-LB-01 (XP placement) | KEEP in leaderboards v1.1.0 — XP derives from result/board-eligibility rules living here; user-profile consumes sealed fields; deliberate override of r1 | B-LB-007 rationale + log |
| BQ-LB-02 (daily top-N) | Same as all-time (parity; single limit constant N≤100/default 50 — sealed text already) | log |

## 2. Final sealed ledgers

### quote-library v1.1.0 (MINOR, D6) — 13 musts (exception-listed)
B-QT-006 tri-state moderation composite (additive state enum, consistency
clause, refused persisted+never-served, boolean retained for v1.0.0 consumer
compatibility) · B-QT-007 rating-weighted selection (weight monotonicity +
seeded reproducibility — deterministic validator, no statistical flake) ·
B-QT-008 favorites (own-data-only, idempotent) · B-QT-009 search/browse
(approved-only, stable order, documented pagination [verify]). Schemas:
quote +state/+moderationNote; favorite-request NEW. Capability:
+data/favorites.json. Registry-binding of the language filter deliberately
deferred (quote languages may exceed wordlist languages).

### leaderboards v1.1.0 (MINOR, D7) — 10 musts
B-LB-001 eligibility +minThresholdFailed exclusion (C6 chain closed) ·
S-LB-001 board key (time, 15|60, registry-validated language, timeWindow)
with new consumes language-registry: wordlists · B-LB-005 daily rolling
(T-24h, T] per C4 [verify UTC-day divergence] · B-LB-006 percentile =
100·rank/totalEligible · B-LB-007 per-result XP read-time derivation
(inputs sealed wpm/acc/testDuration; coefficients at implementation;
zero writes). Read-time recomputation (B-LB-003) preserved across windows.

## 3. Version-event ledger (program cumulative: 12 events; 2 majors, 2 patches)
11. quote-library 1.0.0→1.1.0 minor · 12. leaderboards 1.0.0→1.1.0 minor
(details in §1). Blocking questions this round: 4, all one-round. Critical
ambiguities: 0 new. Exception ledger: 4 bundles (engine 18, ui 19,
test-results 13, quote-library 13); all new bundles ≤12.

## 4. Hand-off notes
- quote-library 1.1.0: state field + moderation branch, weight function,
  favorites store, search endpoint. Validator delta: cheap (+~10s).
- leaderboards 1.1.0: window filter (injected clock), registry validation,
  percentile + xp fields (pure derivations). Cheap–moderate (+~20s).
- Remaining domains: D8 user-profile (NEW), D9 public-api (NEW) — drafts
  authored in this same round cycle, awaiting adjudication.
