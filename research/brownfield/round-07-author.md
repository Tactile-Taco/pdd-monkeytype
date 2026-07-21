# Brownfield — Round 7: adjudication applied + SEAL record (D8/D9, FINAL)

**Outcome: user-profile v1.0.0 SEALED, public-api v1.0.0 SEALED.**
`harness/check_bundle.py` → PASS (10 / 11 invariants). Five rulings applied
pre-seal. **This completes protocol drafting for roadmap D1–D9.**

## 1. Rulings applied

| Ruling | Applied at |
|---|---|
| isPublic INCLUDED (default true [verify]); private profile → identical 404-shaped envelope as unknown names (O-RES-004 precedent); owner reads unaffected | profile-update.schema.json (+isPublic); B-PRO-004 (validation); B-PRO-005 (404-indistinguishable clause) |
| Streaks derive ONLY from result-stats activity series (single source; no independent computation) | B-PRO-002 statement + rationale |
| ApeKey format: 128-bit entropy, hex, `pdd_` prefix; show-once + salted-hash-at-rest approved | B-API-001 statement + rationale |
| Per-IP second rate dimension approved (≥ per-key limit; key dimension stays the tested contract) | NEW O-API-003 (public-api now 11 musts, ≤12) |
| /quotes scope INCLUDED (public quotes low-risk; parity with live unauthenticated endpoint) | already drafted (four scopes stand) |

## 2. Final sealed ledgers

### user-profile v1.0.0 (NEW, D8) — 10 musts
Compose-only (B-PRO-001: identity ← user-account frozen; pbs/aggregates ←
result-stats pass-through; xp ← leaderboards sealed fields; streaks ←
activity series single-source) · B-PRO-002 streak formulas (UTC-day,
injected clock) · B-PRO-003 level monotonicity (curve delegated) ·
B-PRO-004 strict edit validation (bio/avatar/socials/isPublic,
all-or-nothing) · B-PRO-005 public-shape-only reads with 404-indistinguishable
privacy. Storage authority: own-profile fields file only (1 write/request).

### public-api v1.0.0 (NEW, D9) — 11 musts
B-API-001 ApeKey lifecycle (pdd_-prefixed 128-bit hex, show-once, salted
hash, fail-closed revoke) · B-API-002 constant-time compare + auth-domain
separation · B-API-003 scope enforcement default-deny (4 closed read
scopes) · B-API-004 surface parity (recompute-equal to source handshakes,
exclusion rules ride along) · B-API-005 per-key rate limit (429 envelope +
retry metadata, injected clock) · O-API-003 per-IP dimension (≥ per-key).

## 3. Version-event ledger (FINAL: 14 events; 2 majors, 2 patches, 4 new bundles)

1 cfg 1.1.0 · 2 engine 2.0.0 MAJOR · 3 cfg 1.1.1 patch · 4 cfg 1.2.0 ·
5 theme-catalog 1.0.0 NEW · 6 ui-presentation 2.0.0 MAJOR · 7 test-results
1.2.0 · 8 result-stats 1.0.0 NEW · 9 wordlists 1.0.0 NEW · 10 engine 2.0.1
patch · 11 quote-library 1.1.0 · 12 leaderboards 1.1.0 · 13 user-profile
1.0.0 NEW · 14 public-api 1.0.0 NEW.
Blocking questions: 27 total across 7 rounds, all one-round adjudications.
Critical ambiguities: 2 (CA-001 legacy; CA-UI-02 fonts, C1-ruled).
Exception ledger (must counts >12): engine 18, ui-presentation 19,
test-results 13, quote-library 13. New bundles ≤12: theme-catalog 9,
result-stats 7, wordlists 7, user-profile 10, public-api 11.
Validator patches: 1 (computed-style-metrics 0.1.1). Delegated-decision
ledger: opposite-shift enforcement, live-stats region, random-theme
selection algorithm, level curve coefficients, font stacks/sizes, catalog +
wordlist contents (data tasks).

## 4. Hand-off notes
- user-profile 1.0.0: compose layer + small fields store; validators are
  recompute-consistency + clock-fuzz (moderate, +~30s as estimated).
- public-api 1.0.0: key store + auth filter + mirrored endpoints; burst
  rate tests need injected clock (flagged since r1). Cheap–moderate (+~20s).
- D1–D9 protocol drafting COMPLETE: 12 bundles sealed total (8 legacy
  versioned forward, 4 new), 0 drafts outstanding. Workspace file-loss
  incidents (4, all recovered): under investigation on the orchestrator
  side per acknowledgment; continue flagging.
