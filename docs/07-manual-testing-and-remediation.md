# Manual testing, runtime evidence, and remediation log

## A. Manual exploratory pass (human-in-the-loop simulation)

Performed against the running server (`PDD_IMPL_VERSION=v1.2`, RVL active, ledger at `/tmp/pdd-run/ledger/runtime-ledger.jsonl`).

### A.1 Scripted API exploration
| Probe | Result |
|---|---|
| signup + case-insensitive login | pass (B-ACC-001/002 behavior confirmed interactively) |
| wrong password | 401 `unauthorized`, identical envelope to unknown user (B-ACC-003) |
| config partial merge | `punctuation:true` + `difficulty:expert` merged over defaults (B-CFG-001/002) |
| realistic words-10 session via engine (human-jitter timings) | wpm 68.08, acc 100, charStats 42/0/0/0, consistency 77.16 |
| submit | 201, `isPb:true`, anticheat admit |
| idempotent resubmit (same hash) | 200, same id, no second write (B-RES-002) |
| cheating attempt (wpm=900) | 422 `wpm_bound, raw_bound, stat_mismatch` — three invariants fired jointly |
| time-15 session + leaderboard | rank 1 on board time/15 |
| quote random + submit pending | group 0, `approved:false` until moderation |

### A.2 Real-browser UI test (`harness/manual-ui.mjs`, headless Chromium + real keyboard events)
- words mode: typed the full rendered word list from the DOM → result screen shown; 144.51 wpm, 100% acc, 84.19% consistency, charStats 91/0/0/0, duration 7.56s. **UI stats match engine semantics.**
- signup through the dialog → `@ui_tester` session persisted to localStorage.
- time-15 test: 16s of fast typing → result screen → **"saved — new personal best!"**.
- leaderboard page renders server-side admitted data.

### A.3 Finding MT-1 (the one that mattered)
Console showed a 404 resource error during UI tests. Investigation: express's default 404 handler returns **HTML**, bypassing the ErrorEnvelope required by the `S-*-002` family AND bypassing RVL observation (the default handler uses `res.send`, not `res.json`, so the monitorable projection never saw it). **Neither the build-time validators nor the runtime verifiers caught it** — manual exploratory testing did.

## B. Remediation record (MT-1)

Per `pdd-remediation-orchestrator`:

1. **Repair context C_t**: violated family S-*-002 (error envelope), layer structural, observation = HTML body on `GET /favicon.ico` and `GET /api/*` unknown routes, classification = **implementation-defect** (protocol correct; implementation incomplete).
2. **Fix**: catch-all handler returns `not_found` envelope; `/favicon.ico` returns 204.
3. **Regression gate**: new structural contract test — unknown API route MUST return 404 + envelope with correlation_id. Candidate v1.2 re-ran the FULL Validator Loop: structural 19/19, behavioral 35/35, operational 11/11 → re-admitted (evidence digest `6dae0361…`).
4. **Outcome**: appended to validation log; ledger remained violation-free (see blind-spot note below).

## C. Runtime drill (deliberate invalidation of the Dynamic Evidence Ledger)

`harness/runtime-drill.mjs` exercises the closed loop end-to-end:

- **Phase 1** (clean traffic): heartbeat `attest-pass` blocks with live p95 observations (config 0.71ms vs 50ms budget, results 1.1ms vs 100ms).
- **Phase 2** (chaos: `PDD_CHAOS=:/api/config:120` injects 120ms latency inside the observed boundary): **14 `attest-violation` blocks**; violated invariant `O-CFG-002` bound to implementation version + redacted observation.
- **Phase 3** (remediation): chaos removed (candidate regenerated), operational layer re-run → admit, `remediation-outcome` block appended as the terminal incident block. Ledger verified: 16-24 blocks, chain intact.

Two RVL integration defects were found and fixed during the drill (mounted after routes → never observed responses; mounted after the chaos hook → measured post-sabotage time only). Lesson recorded in the retrospective: **the observation boundary must be the outermost middleware**, and an RVL that observes nothing is indistinguishable from a healthy one — heartbeat attestations with per-route sample counts are what made the blind RVL detectable.

## D. Evidence-chain invalidation summary

| Source | Invalidation | Remediation | Terminal state |
|---|---|---|---|
| Runtime drill (chaos) | 14 violation blocks, O-CFG-002 | chaos removed, operational re-pass, outcome block | closed |
| Manual test MT-1 | (invisible to RVL — blind spot) | envelope fix + regression test + full re-admission | closed |
| Live manual ledger | none — all `attest-pass` | n/a | healthy |

## E. RVL blind spot (documented, protocol-relevant)

The pre-fix 404 path was NOT runtime-observable: `res.send` bypasses the `res.json` wrapper. This is a real instance of the paper's *monitorable projection* limit. Mitigations applied: (1) all failure paths now route through the envelope handler (which uses `res.json`); (2) recorded as a derived behavior in the discovery log for protocol v1.1 consideration: "all HTTP responses MUST pass through a single response-emitting choke point" — a candidate operational invariant (`O-RVL-CHOKE`) for the next protocol version.
