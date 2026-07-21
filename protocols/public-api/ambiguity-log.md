# Ambiguity log — public-api

## v1.0.0 (NEW bundle — brownfield D9; SEALED 2026-07-21)

## Round-7 ruling record
- BQ-API-01 → key format RULED: 128-bit entropy, hex, `pdd_` prefix for
  scan-ability; show-once plaintext + salted hash at rest APPROVED.
  Applied: B-API-001.
- BQ-API-02 → per-IP second rate dimension APPROVED as operational
  invariant O-API-003 (injected-clock determinism; per-IP limit >= per-key
  limit so the key dimension remains the tested contract).
- BQ-API-03 → /quotes scope INCLUDED (public quotes low-risk; parity with
  the already-live unauthenticated random-quote endpoint).
- Open at sealing: none.


## Resolved assumptions
- ApeKey discipline (B-API-001/002): plaintext shown once at creation,
  salted hash at rest, constant-time compare, session/API auth domains
  separated. Constant-time property validated statistically with a
  tolerance band (timing gates are noisy — band documented by the
  validator, not frozen here). [orchestrator instruction + author]
- Scope vocabulary closed at four read scopes (results/stats/profile/
  quotes); write scopes deferred entirely (out of scope this iteration).
  [orchestrator instruction]
- Rate limit constants (requests/window) documented at implementation;
  the invariant seals the envelope + retry metadata + deterministic
  window accounting under injected clock. [author; O-RES-004 envelope
  precedent]
- Parity (B-API-004/S-API-003): mirrored endpoints reuse the source
  bundles' derivation paths in-process — no duplicated logic. Exclusion
  rules ride along (zen absence, minThresholdFailed, approved-only
  quotes). [author]
- ApeKey management endpoints are session-gated (web client); the API
  surface itself is key-gated only. [reference posture; assumption]

## Open questions
- BQ-API-01: key entropy/format — reference ApeKeys are long random
  strings shown with a prefix? Seal a minimum entropy/length floor +
  optional display-prefix field [verify reference format at
  implementation; additive-ready].
- BQ-API-02: rate-limit DIMENSION — per key only (drafted), or also a
  global per-IP ceiling? A second dimension is additive; request ruling
  before sealing B-API-005's "each key" wording.
- BQ-API-03: does the reference expose /quotes through the public API at
  all (quote submit is web-only)? Drafted as read-only quotes mirror;
  drop to three scopes if the reference omits it.
