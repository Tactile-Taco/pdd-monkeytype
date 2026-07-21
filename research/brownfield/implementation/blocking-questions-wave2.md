# Blocking questions — wave-2 implementation
## test-results v1.2.0 · result-stats v1.0.0 · wordlists v1.0.0 · quote-library v1.1.0 · leaderboards v1.1.0

**Status: NO BLOCKING QUESTIONS RAISED.** Every ambiguity encountered during
implementation was either pre-ruled in the sealed ambiguity logs or delegated
(cosmetic / data / coefficients) per CA-001 and settled locally with tests
(see `wave2-report.md` §7). This file records the disposition of each
`[verify at implementation]` tag so the research/reference pass can confirm or
convert any of them into a version amendment. None blocks the candidate.

---

## Disposition ledger (all NON-blocking; settled per sealed defaults)

| # | Bundle | Verify tag (source) | Disposition | Where tested |
|---|---|---|---|---|
| 1 | test-results | Zen persistence override? (BQ-ENG-06 follow-through; reference opt-in may exist) | Implemented **as ruled**: zen never persisted (verdict + `stored:false`). If the reference has an opt-in, it arrives as an additive user-config key (batch 3+) + gated amendment — the write path has a single disposition point ready for it. | wave2 `B-RES-001` test |
| 2 | test-results | Tag names unique per user case-insensitively [verify reference rule] | Implemented **as sealed** (case-insensitive; 409 `conflict`). | wave2 `B-RES-006(a)` |
| 3 | test-results | Multi-tag filter semantics [verify] | **Intersection** (sealed). | wave2 `B-RES-006(c)` |
| 4 | test-results | Tag-scoped PB: read-time derivation vs per-tag keying [verify — behavior-changing if keyed] | **Read-time derivation** (sealed, C7). isPb flags provably untouched by scoped reads. If the reference keys PBs per tag → back to negotiation (per the bundle's own note). | wave2 `B-RES-006(e)` |
| 5 | result-stats | afkDuration subtraction from time-typing? (BQ-STS-01) | **sum(testDuration), no subtraction** (ruled). One-line formula amendment if reference ground truth differs — isolated in `computeAggregates`. | wave2 `B-STS-002` fixture |
| 6 | result-stats | bailedOut/minThresholdFailed inclusion rules [verify reference] | **Included** in aggregates/activity/series, excluded from PB table (sealed default). Any exclusion would land as a formula amendment, never silent filtering. | wave2 `B-STS-002` fixture |
| 7 | result-stats | Activity buckets = UTC calendar days (no user timezone) [assumption] | Implemented UTC-day (`utcDay`). User-timezone bucketing would be an additive minor. | wave2 `B-STS-002` fixture |
| 8 | quote-library | Refusal metadata: free-text moderationNote sufficient? (BQ-QT-01, CLOSED at sealing — shape APPROVED) | `state` enum + optional `moderationNote` ≤500, persisted, never served. Schema is additive-ready for structured reasons later. | wave2 `B-QT-006` |
| 9 | quote-library | Reference weighting function [verify] | Documented delegation: `weight = rating average`; unrated default **2.5** (documented midpoint); monotonic non-decreasing (sealed property holds by construction). Seeded reproducibility via opt-in `?seed=` (mulberry32 — engine PRNG family). | wave2 `B-QT-007` module + HTTP |
| 10 | quote-library | Pagination + ordering [verify] | Submission (storage) order; fixed pageSize **50**; page 0-based; `{quotes,page,pageSize,total}`; invalid page ⇒ 422. Pagination-total proof over 120 fixtures. | wave2 `B-QT-009` ×2 |
| 11 | leaderboards | Daily window: rolling 24h vs UTC calendar days [verify — behavior-changing if calendar] | **Rolling (T-24h, T]** (C4 ruled pre-seal). Exact edges under injected clock. Calendar-day reference divergence would go back to negotiation per the bundle note. | wave2 `B-QT-005` ×2 |
| 12 | leaderboards | Daily top-N parity (BQ-LB-02, CLOSED at sealing) | Same N≤100/default 50 on both windows. | wave2 `S-LB-001/002` |
| 13 | leaderboards | XP formula + coefficients [verify reference] | Delegated to implementation per B-LB-007: **`xp = wpm · (acc/100) · (testDuration/60)`** (round2), documented in code + report §6.9. Inputs exactly the sealed three. If the reference publishes its accrual curve, coefficients are a one-line amendment in `xpOf`. | wave2 `B-LB-007` |
| 14 | wordlists | Registry fields (rtl/diacritics/bcp47) [verify at data import] | Minimal sealed shape (id/name/language + optional tier); `additionalProperties: true` on entries admits reference fields at the data-import task without a schema event. | wave2 `S-WL-001/002` |
| 15 | wordlists | ~6 starter languages [orchestrator instruction] | 6 lists shipped; english = retired internal list migrated verbatim (parity-tested). Full ~60-language import is the delegated DATA task. | wave2 `S-WL-001/002` |

## Advisory notes for the validator-extension stage (not questions)

1. **ADV-W2-01** — The engine v2 harness still imports the retired
   `internalWordlist` provider (S-ENG-004 checks). The export is kept
   deliberately (parity-pinned to the migrated asset); retirement completes
   when the engine validator migrates to the wordlists assets.
2. **ADV-W2-02** — New invariant IDs (B-RES-006, B-STS-001/002, S/B/O-WL-*,
   B-QT-006..009, B-LB-005..007) currently carry candidate-side evidence only
   (29 wave-2 unit tests + worker probes). Formal harness checks land in the
   stage-3 validator extension; the evidence keeper skips zero-result bundles
   by design (theme-catalog precedent).
3. **ADV-W2-03** — Zen non-stored response shape (200 `{verdict, stored:false,
   anticheat}`) was the ambiguity-log's reserved cosmetic; if the formal
   validator wants a schema for it, it belongs in the test-results bundle as
   an additive submission-response handshake.
