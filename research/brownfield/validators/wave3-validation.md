# Wave-3 validator extension — validation report

Stage-3 validator coverage for the two wave-3 bundles: **user-profile v1.0.0
(NEW) and public-api v1.0.0 (NEW)**. Author: Validation Engineer. Baseline:
wave-2 stage tree (loop-green at 174.0s, 11/11 admit).

## Result

- **Full loop green: 13/13 protocols admit** (user-profile 17 checks,
  public-api 23 checks bound into fresh first-block ledgers).
- Check counts: structural 71 → **85**, behavioral 100 → **120**, operational
  24 → **30**; ui-presentation suite unchanged (24).
- Wall-clock: full loop 174.0s → **177s** (+3s). Per-layer post-change:
  structural 8.7s, behavioral 21.2s, operational 5.9s (the +3.1s operational
  delta is the ~360 rate-limited HTTP calls in the B-API-005/O-API-003 sweeps).
- Evidence rebuilt + hash-chain verified: 13 ledgers OK.
- **protocols/ untouched** (my diff surface: `harness/boot.mjs`,
  `harness/build-evidence.mjs`, the three `validate-*.mjs` layers, this report).
- 17 wave-3 unit tests promoted into the harness layers (patterns below);
  harness gains `bootApp({ clockMs })` (injected clock passthrough to
  `createApp({ now })` per ADV-W3-04) plus per-request `headers`/response-
  header access on `call()` (x-forwarded-for isolation, retry metadata).

## Per-invariant matrix

### user-profile v1.0.0

| Invariant | Coverage | Status |
|---|---|---|
| B-PRO-001 (compose-only) | property (6 runs): random fixtures → served name/addedAt == user-account; pbs/aggregates byte-equal the result-stats handshakes; xp == round2(Σ sealed per-result xp); level == documented curve; streaks == validator-side activity-series derivation; a source write is reflected on the NEXT read (no cached derived state). Structural: fresh-user defaults (xp 0/level 0/streaks 0/0/empty publicFields) | pass |
| B-PRO-002 (streak edges) | sync property (200 runs): random activity series × random instants (UTC-day boundary fuzz) == validator recompute; 9-case promoted edge corpus (midnight rollover, 1ms-before, dead-after-2-days, gaps, inactive-day, duplicates); HTTP injected-clock scenario: alive@yesterday {3,3} → +2d dead {0,3} → revive {1,3}, equal to the activity-series derivation at the injected instant | pass |
| B-PRO-003 (level monotonicity) | property: xp(a) ≥ xp(b) ⇒ level(a) ≥ level(b), integer ≥ 0, deterministic, == floor(sqrt(xp/10)) (delegated curve documented); anchors 0/1/2/10 | pass |
| B-PRO-004 (strict edits) | module property (any single fault poisons the patch; valid control always passes) + HTTP property (14 runs): invalid → 422 with publicFields byte-unchanged (all-or-nothing, zero fields written); valid → 200 applied. isPublic default true exercised via B-PRO-005 (no PATCH needed for a public read) | pass |
| B-PRO-005 (private ≡ unknown) | scenario: public read clean shape (no uid/pw/email/token/moderator/isPublic/scopes keys; no scrypt/hash/pdd_ substrings); case-insensitive lookup; private → 404 with SAME status/code/message as unknown, bodies deep-equal **modulo error.correlation_id** (random per response — see observation 1); owner read unaffected; flip-back visible | pass |
| S-PRO-001/002/003 | profile schema conformance + exact pass-throughs; 401/404 envelopes; closed-shape edit contract with harness-side schema mirror (1 valid + 7 invalid bodies) | pass |
| O-PRO-001/002 | reads: 0 store writes; edit: exactly profile.json written (file-mtime observation); read p95 ≤ 100ms (measured ≪) | pass |

### public-api v1.0.0

| Invariant | Coverage | Status |
|---|---|---|
| B-API-001 (format/show-once/hash-at-rest) | mint property (regex pdd_+32 hex, 128-bit salt, hash==hashKey) + HTTP scenario: creation-only plaintext (list never carries it); **disk sweep over EVERY store file — plaintext nowhere at rest**; stored salted sha256 verifies; revoke idempotent ×2, revoked ≡ unknown (same 401 code), foreign revoke 404 | pass |
| B-API-002 (constant-time + domains) | correctness property over random positions (hit/miss/revoked-disabled) + validator-owned statistical gate: medians over 30 reps at N=200 stored keys, match@first and match@last within a 3× band of miss (early-exit would diverge >50×); domain separation: session token → 401 on the API surface, ApeKey → 401 on five session-gated routes | pass |
| B-API-003 (scopes fail-closed) | property (8 runs): random scope subsets × the full 8-endpoint surface matrix — in-scope 200, out-of-scope 403 `forbidden` envelope, nothing else | pass |
| B-API-004 (mirror parity) | property (6 runs): random fixture matrices (clean/flagged/bailed/zen × tuples × days) → byte-equality with the session surface for /results, /results/pbs, /stats ×4, /profile, /quotes, /quotes/random?seed; zen absent on both, flags persisted, tag-filter ride-along byte-equal | pass |
| B-API-005 (per-key window) | module property: random op sequences vs a validator-side fixed-window model (allow/deny, limit, resetMs, retryAfterMs exact); constants rec (60/key ≤ 120/ip per 60s); HTTP injected-clock: 60 pass → 61st 429 with Retry-After ∈ [1,60]s + X-RateLimit-{Limit=60,Remaining=0,Reset} headers + envelope; same-window still 429; second key unaffected; window-edge +1ms resets | pass |
| S-API-001/002/003 | create-request schema mirror (unknown scopes/keys fail-closed, 422); apekey metadata conformance (no material/uid); 401/403/404 envelopes; mirrored payloads validate against the SOURCE bundles' schemas (stored-result, result-stats ×4, user-profile, quote) | pass |
| O-API-001/002 | API reads: 0 store writes (counters in-memory); key management writes confined to apekeys.json; raw-socket reads under a full outbound trap (0 egress attempts); API read p95 ≤ 150ms (4 keys × 2 IPs, measured ≪) | pass |
| O-API-003 (per-IP dimension) | injected-clock HTTP scenario: two keys × 60 = 120 from one IP → 121st 429 carrying **X-RateLimit-Limit=120** (IP checked first, per-key quota untouched); fresh key from the hot IP 429; same key from another IP (x-forwarded-for) 200; unauthenticated 429; window-edge reset; constants rec ip ≥ key | pass |

## Advisory notes evaluated

- **ADV-W3-01 (formal checks deferred) — CLOSED** by this stage; PRO/API
  prefixes added to `harness/build-evidence.mjs`, both bundles admit.
- **ADV-W3-02 (timing gate should also run on the worker isolate) —
  ACKNOWLEDGED, Node gate shipped.** The 3×-median band runs in the harness
  (Node). The candidate's no-early-exit proxy is platform-independent by
  construction (full scan, `timingSafeEqual` over equal-length digests, hash-
  domain compare ⇒ key-prefix correlation undefined); a worker-isolate timing
  run remains an operational follow-up if the Workers target ships, not a
  harness gap.
- **ADV-W3-03 (per-isolate rate counters) — EVALUATED: compliant by design.**
  The sealed invariants bind the *window semantics* (limits, 429 envelope,
  retry metadata, determinism under an injected clock), all of which per-
  isolate counters satisfy; the harness verifies them on single-process
  instances exactly as sealed. A cross-isolate global ceiling would require a
  shared counter store — a capability negotiation, correctly flagged as not an
  implementation patch. No protocol defect.
- **ADV-W3-04 (`createApp({ now })` is the wave-3 injected clock) — ADOPTED.**
  `bootApp({ clockMs })` passes it through; streak-aliveness and rate-window
  checks are deterministic under it. Whole-app clock injection (user-account
  is frozen; leaderboards daily window is wave-2-sealed with its own injected
  `now` at module level) is recorded as a possible cross-bundle hygiene item,
  not required.

## Observations (not defects; no protocol text touched)

1. **"Byte-indistinguishable" 404s are modulo `error.correlation_id`.** The
   sealed ErrorEnvelope carries a random correlation id per response, so
   private-vs-unknown equality is asserted as same status, same code, same
   message, same shape (deep-equal after stripping the correlation id). This
   matches the O-RES-004 envelope precedent; noted for the next ambiguity-log
   sweep only if "byte-identical" wording lands in sealed text later.
2. **Retry metadata rides headers, not the envelope.** The ErrorEnvelope
   schema is closed; Retry-After + X-RateLimit-* headers carry the metadata
   (validator asserts both channels). Consistent with S-API-002.
3. **Per-IP isolation in the harness uses x-forwarded-for** (documented
   delegated surface) with a suite-local counter — random subnets collided
   often enough to flake an early draft (~9%/run collision rate over /24
   draws); counter-derived /16s make runs deterministic.
4. **Rate-budget hygiene:** API-surface checks run on a dedicated booted
   instance with fresh keys per property run (per-key 60/60s) and per-run IPs
   (per-IP 120/60s); the shared suite instance is never rate-limited. The
   wave-3 unit tests' own bootAppClock pattern was promoted rather than
   altering their file.

## Residual risks

- Timing gate is environment-sensitive by nature; the 3× median band is
  generous (early-exit diverges >50×) and has been stable across all stage
  runs, but a heavily loaded CI box could inflate miss-path medians. If it
  ever flakes, widen sampling (30→100 reps) before touching the band.
- B-PRO-001/004 and B-API-004 read wall-clock streak state; the UTC-midnight
  race window is ~milliseconds per run (module-level injected-clock checks
  carry the edge corpus deterministically).
