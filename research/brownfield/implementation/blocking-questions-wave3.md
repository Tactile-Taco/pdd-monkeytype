# Blocking questions — wave-3 implementation
## user-profile v1.0.0 (NEW) · public-api v1.0.0 (NEW)

**Status: NO BLOCKING QUESTIONS RAISED for the two sealed bundles.** Every
ambiguity was either pre-ruled in the sealed ambiguity logs (round-7 rulings)
or delegated (cosmetic / coefficients / constants) per CA-001 and settled
locally with tests (`wave3-report.md` §4). One **VALIDATOR-surface** finding
was escalated to the lead mid-wave and fixed in-flight by its owner (§A).
This file records dispositions so the research/reference pass can confirm or
convert any of them into a version amendment. None blocks the candidate.

---

## A. Escalated finding (NOT a bundle question; resolved in-flight)

| # | Surface | Finding | Disposition |
|---|---|---|---|
| A1 | `harness/validate-behavioral.mjs` B-ACC-001 (Validator-owned) | Baseline `pdd:loop` was RED on the unmodified tree: the property drew usernames from `fc.integer({min:0,max:999999999})`, whose biased draws repeat within a 20-run window (measured 4/5 windows; counterexamples [0],[21],[11],[4]). The repeat signup then 409s on `t1` and the property fails — unsound for ANY correct implementation (case-insensitive uniqueness is the sealed behavior and verified correct manually). | **Reported to lead at wave start; the Validator fixed it in-flight** (fc.uuid-suffixed names, citing these counterexamples). harness/ is the Validator's surface — not modified here. Post-fix verified stable: 3 consecutive behavioral admits; final full loop GREEN (EXIT=0). No residual action for this wave. |

## B. Disposition ledger (all NON-blocking; settled per sealed defaults / delegation)

| # | Bundle | Verify tag (source) | Disposition | Where tested |
|---|---|---|---|---|
| 1 | user-profile | isPublic default (BQ-PRO-01 → default true [verify at implementation]) | Implemented **as ruled**: absent ⇒ public; toggle flips visibility both ways; private ≡ unknown (identical 404 envelope, O-RES-004 precedent); owner reads unaffected. | wave3 `B-PRO-005` |
| 2 | user-profile | Streak rules [verify reference]: consecutive UTC-day active days; alive iff last active today/yesterday; current vs max | Implemented **as sealed**; single source = result-stats activity series (round-7). UTC-midnight boundary fuzz ±1ms; gap/dead-streak/revival sweeps. Reference divergence is a one-function amendment (`computeStreaks`). | wave3 `B-PRO-002` ×2 |
| 3 | user-profile | Level curve coefficients (B-PRO-003 delegates the curve [verify ground truth]) | Delegated, documented: `level = floor(sqrt(xp/10))` (level n ⇔ `xp ≥ 10·n²`). Monotonicity + determinism sealed and swept 0→200k xp; coefficient isolated to `XP_PER_LEVEL_SQ`. | wave3 `B-PRO-003` |
| 4 | user-profile | Editable field list [feature-inventory; reference may show more handles] | Sealed four only (bio/avatarUrl/socials{website,twitter,github}/isPublic), closed shape — additional handles arrive as additive schema minors. | wave3 `B-PRO-004/S-PRO-003` |
| 5 | user-profile | xp sum inclusion rule — "over the user's stored results" (exclusions unstated) | ALL stored results (bailed/flagged included), mirroring B-STS-002's sealed inclusion default; documented delegation. An exclusion ruling lands as a one-line filter in `totalXp`. | wave3 `S-PRO-001/B-PRO-001` |
| 6 | user-profile | Public-name lookup case sensitivity [unsealed] | Case-insensitive (mirrors user-account name handling). | wave3 `B-PRO-005` |
| 7 | public-api | Key entropy/format (BQ-API-01 → RULED round 7: 128-bit, hex, `pdd_` prefix) | Implemented as ruled; plaintext show-once; 128-bit per-key salt + salted sha256 at rest; disk sweep asserts no plaintext at rest. | wave3 `B-API-001` |
| 8 | public-api | Constant-time statistical tolerance band [validator-owned band] | Candidate ships the structural proxy: full-scan, no early exit — median(match@1)/median(match@200) within 3× of median(miss) over 200 keys (early-exit ⇒ >50×). The formal statistical gate + band lands in the validator stage. | wave3 `B-API-002` |
| 9 | public-api | Rate-limit DIMENSION (BQ-API-02 → per-IP APPROVED, ip ≥ key) | Two fixed-window dimensions: 60/key/60s, 120/IP/60s (documented delegated constants); IP checked first; per-key remains the tested contract. | wave3 `B-API-005`, `O-API-003` ×2 |
| 10 | public-api | /quotes scope (BQ-API-03 → INCLUDED) | Four scopes implemented; quotes mirror = search + seeded/unseeded random, approved-only parity. | wave3 `B-API-003/004` |
| 11 | public-api | Retry metadata channel (envelope is closed) | `Retry-After` + `X-RateLimit-{Limit,Remaining,Reset}` headers; body stays the sealed ErrorEnvelope (`rate_limited`), ajv-checked. | wave3 `B-API-005`, `O-API-003` |
| 12 | public-api | `lastUsedAt` (schema-optional) | OMITTED — zero store writes on the read surface (write amplification against the read posture for display-only metadata). Additive later. | — (documented §4.9) |

## C. Advisory notes for the validator-extension stage (not questions)

1. **ADV-W3-01** — New invariant IDs (S/B/O-PRO-001..005, S/B/O-API-001..005)
   currently carry candidate-side evidence only (17 wave-3 unit tests + 20
   worker probes). Formal harness checks land in the validator-extension
   stage; the evidence keeper skips these zero-result bundles by design
   (wordlists/result-stats precedent).
2. **ADV-W3-02** — B-API-002's formal timing gate should run on the worker
   isolate too (per-isolate crypto paths are identical code, but timing
   characteristics differ); the candidate's no-early-exit proxy is
   platform-independent.
3. **ADV-W3-03** — Rate counters are per-process/per-isolate by design
   (capability-clean: no store writes on reads). If the operational record
   wants a global per-key ceiling across isolates, that is a capability
   negotiation (shared counter store), not an implementation patch.
4. **ADV-W3-04** — `createApp({ now })` is the injected clock for the wave-3
   surfaces (streak aliveness, rate windows). Pre-existing surfaces keep
   their own `Date.now()` calls (user-account is frozen; leaderboards daily
   window is wave-2-sealed). If the validator wants whole-app clock
   injection, that is a separate cross-bundle hygiene item.
