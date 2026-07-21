# Wave-2 validator extension — validation report

Stage-3 validator coverage for the five wave-2 bundles: **test-results v1.2.0,
result-stats v1.0.0 (NEW), wordlists v1.0.0 (NEW), quote-library v1.1.0,
leaderboards v1.1.0**. Author: Validation Engineer. Baseline: ui-v2 stage tree
(loop-green at 164.1s, 9/9 admit).

## Result

- **Full loop green: 11/11 protocols admit** (was 9/9 — result-stats and
  wordlists leave the zero-result skip list, theme-catalog precedent).
- Check counts: structural 58 → **71**, behavioral 73 → **100**, operational 16
  → **24**; ui-presentation suite unchanged (24).
- Wall-clock: full loop 164.1s → **174.0s** (+9.9s, +6%). Per-layer post-change:
  structural 9.2s, behavioral 20.4s, operational 2.8s (ui suite + evidence
  chain dominate the remainder). Wave-2 added ~+5s structural, ~+4s behavioral,
  ~+1s operational — far below any checkpoint concern.
- Evidence rebuilt + hash-chain verified: 11 ledgers OK (result-stats and
  wordlists open their first block; 26-block chains intact elsewhere).
- **protocols/ untouched by this stage** (git-confirmed: my diff surface is
  `harness/boot.mjs`, `harness/build-evidence.mjs`, the three `validate-*.mjs`
  layers, and this report). The worktree's protocols/ + implementation/
  modifications are the implementers' own uncommitted wave-2/wave-3 work.

## Per-invariant matrix

### test-results v1.2.0

| Invariant | Coverage | Status |
|---|---|---|
| B-RES-001 (zen non-persistence; reject-never-persisted) | structural contract (3× zen → 200 `{verdict:admit, stored:false}`, history unchanged; anticheat-reject → 422, count unchanged) + behavioral property (random zen/normal interleavings, 8 runs) | pass |
| B-RES-003 (flag semantics: isPb=false, PB-read exclusion, no demotion, visible in history) | structural truth table (flagged 200/250 stored+visible, never PB; clean 100 sole PB) + behavioral property over random wpm/flag/tuple sequences with strict-improvement recompute (10 runs) | pass |
| B-RES-006 (tag composite) | (a) CRUD contract + property (case-insensitive 409, per-user isolation, rename); (b) assignment idempotency + foreign/unknown indistinguishable 404; (c) intersection filter exactness over random 4×3 matrices; (d) delete-cascade; (e) tag-scoped PB = read-time derivation, global isPb proven unchanged before/after | pass |
| S-RES-001/002/003 | invalid submission 422 envelope + nothing stored; stored-result schema incl. `tags:[]` + recorded anticheat decision | pass |

### result-stats v1.0.0 (NEW)

| Invariant | Coverage | Status |
|---|---|---|
| B-STS-001 (byte-determinism) | two consecutive raw-text reads of all four handshakes byte-identical (6 runs) | pass |
| B-STS-002 (recompute-consistency) | validator-side recompute of all four formulas over random fixture sets (10 runs): per-(mode,mode2) count/sum/means (no afk subtraction), PB table from stored isPb flags (flagged/bailed excluded), UTC-day activity, chronological wpm-series. Instrumentation: 83.8% of draws include flagged, 85% bailed, 76.8% multi-tuple, 78.5% multi-day | pass |
| S-STS-001/002/003 | four payloads schema-conformant; 401 + ErrorEnvelope before computation | pass |
| O-STS-001/002 | zero store writes on reads (data-dir mtime snapshot); p95 ≤ 100ms (measured ≪) | pass |

### wordlists v1.0.0 (NEW)

| Invariant | Coverage | Status |
|---|---|---|
| S-WL-001 | every shipped asset validates against the engine's `wordlist.schema.json`; engine session starts from an asset (spanish) — S-ENG-004 × S-WL-001 consumption | pass |
| S-WL-002 | registry schema-conformant; referential closure both directions (6 entries ↔ 6 assets, no dead entries, no orphans) | pass |
| S-WL-003 | public tokenless reads; unknown asset → 404 ErrorEnvelope | pass |
| B-WL-001 (boot fail-closed) | fault-injection sweep over `admitCatalog` (the exact gate `createApp` runs and throws on): 10 fault classes × 200 runs; every fault independently verified fatal; shipped catalog admitted (positive control) | pass |
| B-WL-002 (byte-determinism) | repeat reads byte-identical per asset (8 runs) + registry and all assets byte-identical across two booted instances | pass |
| O-WL-001/002 | zero store writes + zero outbound network during reads (raw-socket client under a full outbound trap); p95 ≤ 50ms | pass |

### quote-library v1.1.0

| Invariant | Coverage | Status |
|---|---|---|
| B-QT-006 (tri-state composite) | full API lifecycle: pending never served (seed sweep ×8, search scan, favorites list) → non-moderator 403 → moderator approve ×2 (idempotent, served) → refuse ×2 (note persisted) → re-submit returns the persisted refused record (200, not deleted), never served on any read path; property: random approve/refuse masks ⇒ served set == approved set exactly (6 runs); `approved ⟺ state==approved` asserted on every transition | pass |
| B-QT-007 (rating weighting) | weight = rating average, unrated default 2.5, monotonic (200 runs); seeded reproducibility (200 runs); rating-5 beats rating-1 in 300 fixed-seed draws (deterministic); HTTP: served picks for 8 seeds equal the validator-side weighted traversal over the live approved pool, same seed → same quote twice | pass |
| B-QT-008 (favorites) | add idempotent (double-add → one entry), approved-only list, unknown id 404, per-user isolation, removal never deletes the quote (8 runs) | pass |
| B-QT-009 (search/pagination) | property over query/language filters: subset of approved, substring match, stable order across reads (8 runs); pagination-total proof with 55 submitted+approved quotes: page0=50, disjoint pages, concatenation == stable full order, total consistent, invalid page 422 | pass |
| S-QT-001/002 | wire shape incl. derived length/group + tri-state fields; failure envelopes across favorite/rate/submit/unauth | pass |
| O-QT-001/002 | one store write per mutation (file-mtime observation: submit/rate → quotes.json, favorite/unfavorite → favorites.json); random fetch p95 ≤ 50ms | pass |

### leaderboards v1.1.0

| Invariant | Coverage | Status |
|---|---|---|
| B-LB-001 (eligibility chain) | structural instance (flagged 200 excluded, one entry/user) + property: random clean/flagged/bailed wpms ⇒ exactly one entry == clean wpm (8 runs); v1 bailed/rejected check retained | pass |
| S-LB-001/002 | board schema-conformant, key echoed; registry-language + daily board 200; mode2=30 / language=klingon / timeWindow=weekly → 404 envelope | pass |
| B-LB-005 (rolling 24h) | injected-clock property over random offsets (window membership ⟺ (T−24h, T]) + explicit edges (exactly-24h-ago excluded, 1ms-inside and at-T included, future excluded) + board-level property (daily entries exactly the in-window subset, alltime full history) | pass |
| B-LB-006 (percentile) | property over random boards: every entry's percentile == round2(100·rank/total), solo board = 100; mutation sanity (0-based-rank mutant killed) | pass |
| B-LB-007 (XP) | xp == round2(wpm·acc/100·testDuration/60), determinism, monotonic non-decreasing in each sealed input (200 runs) | pass |
| O-LB-001 | zero-writes half closed (data-dir unchanged across board reads); p95 ≤ 100ms pre-existing | pass |

## Advisory notes evaluated

- **ADV-W2-01 (harness imports retired `internalWordlist`) — CLOSED.** The
  harness no longer imports the retired provider. `harness/boot.mjs` gains
  `assetWordlist()`/`readWordlistAsset()`: the same deterministic generate +
  independent-decoration-stream construction sourced from the shipped
  `implementation/assets/wordlists/<id>.json`. All three former use sites
  (S-ENG-004 provider conformance ×2 structural, B-ENG-009 decorated-session
  property, B-ENG-006 determinism property) now exercise the handshake against
  the catalog the server actually serves; a new structural check starts an
  engine session from the spanish asset. Parity confirmed empirically (4000
  seed/toggle combinations equivalent between providers). Retirement complete.
- **ADV-W2-02 (formal checks deferred to stage-3) — CLOSED by this report.**
  All listed ids now carry harness evidence; the evidence keeper binds
  result-stats (6 checks) and wordlists (11 checks) via the new STS/WL prefixes
  in `harness/build-evidence.mjs`.
- **ADV-W2-03 (zen response shape has no sealed schema) — ACKNOWLEDGED, no
  protocol change.** The validator asserts the sealed behavioral content only:
  HTTP 200, `stored === false`, `verdict === "admit"`, non-persistence, and
  history absence. If a future amendment wants the wire shape itself sealed,
  it belongs in test-results as an additive submission-response handshake
  (implementer's suggestion endorsed); until then the validator deliberately
  does NOT over-constrain the delegated cosmetic.

## Observations (not defects; no protocol text touched)

1. **Stats route URLs are a delegated surface.** The bundle seals handshake
   schemas (`pb-table.schema.json`) but no literal paths; the candidate serves
   the pb-table handshake at `/api/stats/pbs` (consistent with the wave-2 unit
   tests). Validators follow the delegated URLs and bind payloads to the sealed
   schemas. Worth a line in the next ambiguity-log sweep only if the reference
   documents different paths.
2. **B-WL-001 validated at the gate-function level.** `createApp` hardcodes
   the shipped assets dir, so server-boot fault injection is not parameterizable
   without touching shipped assets. The sweep runs the identical call
   (`admitCatalog`) that `createApp` throws on at boot (app.js:177-179), with
   every booted instance as the positive control. Judged faithful, not a gap.
3. **O-LB-001's "10k stored results" scale clause** is exercised at small
   scale (p95 ≪ budget); a 10k-result load run remains a scale-test candidate
   if the loop ever gets a performance stage.
4. **Unseeded `/api/quotes/random?seed=abc`** silently falls back to
   `Math.random` rather than 400 — delegated surface, not asserted either way.

## B-ACC-001 flake fix (side task, closed)

The v1 property drew usernames from `fc.integer({min:0,max:999999999})`; fast-
check's biased integer repeats draws within a 20-run window (measured 43%
duplicate-window rate) against the persistent per-suite user store, so the
repeat signup 409'd and `!!t1` flaked (wave-3 counterexamples [0],[21],[11],[4]).
Fixed with `fc.uuid`-sourced 12-hex-char suffixes (collision-free for practical
purposes, NAME_RE-safe). Verified: 20/20 consecutive green suite invocations
(400 property executions), a 500-run soak of the property, and the full
behavioral suite green (now 100 checks). The ui-presentation-stage residual is
closed; wave-2 suite re-confirms stability (all runs in this stage green).

## Unvalidatable-cheap items

None blocking. Residual risks: (a) B-WL-001 at gate level rather than
boot-process level (observation 2); (b) O-LB-001 scale clause (observation 3);
(c) the v1 ui suite's transient Chromium-startup flake noted in the ui-v2
report did not recur during this stage (two full-loop runs, zero flakes).
