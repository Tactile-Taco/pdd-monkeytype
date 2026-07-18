# Validator Loop log — candidate v1

Loop discipline per `pdd-validation-engine`: layers are jointly necessary; a candidate is admissible only when ALL `must` invariants pass with zero open `mutation-suspect` flags.

## Iteration 1 — structural: REJECT
- `S-QT-001` FAIL: `GET /api/quotes/random` response failed `quote.schema.json`. Root cause: implementation leaked the internal `ratings` map (uid->int) into the wire shape; schema is `additionalProperties:false` and expects `rating:{average,count}`.
- Classification (per pdd-remediation-orchestrator): **implementation-defect** (protocol was correct; the reference itself separates stored ratings from the exposed average).
- Repair context C1: invariant S-QT-001, layer structural, observation = ajv error `must NOT have additional properties`, fix = transform stored ratings to summary at the boundary.
- Iteration 1 total validator runs: 1.

## Iteration 2 — structural: ADMIT (18 checks)
All handshakes conform: auth-response, profile, config, quote, completed-event (synthetic engine event), stored-result, leaderboard, and the error envelope on all 4xx paths.

## Iteration 2 — behavioral: REJECT
- `B-LB-002` FAIL ("Property failed after 1 tests"). Root cause: **harness defect, not implementation** — leaderboard assertions are global-state sensitive but ran against the shared app instance polluted by earlier property runs (random wpm up to 200 on the same board).
- Classification: **validator-defect** (test isolation). Fix: dedicated instance for board assertions. Added regression: B-LB-001 explicit check that bailed/cheating results never appear.
- Iteration 2 total validator runs: 2.

## Iteration 3 — behavioral: ADMIT (35 checks)
- Engine properties (B-ENG-001..007) hold under fast-check (200 cases each), including conservation `allCorrect+incorrect+extra+missed == max(|input|,|target|)` and replay determinism.
- Mutation sanity: four mutants (4-char-word wpm, kogasa without quintic term, raised wpm bound, etc.) all KILLED — properties are not vacuous.
- Anticheat bounds, stat-mismatch tolerance, fail-closed, determinism hold.
- HTTP-level: case-insensitive uniqueness, config merge/wholesale-reject, quote groups + boundaries, rating replace, idempotent submit, PB strict improvement, bailed exclusion — all pass.

## Iteration 3 — operational: ADMIT (11 checks)
- Dependency scan: engine/anticheat zero deps; server only express + node:* within allowlists.
- Egress monitor (trapped http/https/dns/fetch): zero attempts during engine session, anticheat eval, auth, and store commit.
- Budgets: anticheat p95 < 5ms (5000 evals); GET /api/config p95 < 50ms; POST /api/results p95 < 100ms; leaderboard p95 < 100ms.
- Background work: no timer APIs in engine/anticheat. Secrets: only allowlisted env vars; no credential logging.

## Iteration 3 — evidence: ADMITTED (all 7 protocols)
- 7 signed admission evidence objects E = H(P,I,V,R,t) + discovery logs.
- Genesis attest-pass blocks on all 7 runtime ledgers; `verify-evidence` OK.

**Iterations to first full admission: 3** (1 implementation fix, 1 harness fix).

## Iteration 4 — candidate v1.1 (RVL enhancement): REJECT x2
- `O-ACC-001` FAIL: secrets scan flagged drill hook env var `PDD_CHAOS` (not allowlisted). Classification: **harness/config gap** — allowlist updated with justification comment.
- `B-ACC-001` FLAKY: birthday collision in 900-value username space. Classification: **validator-defect** (non-deterministic test). Widened space to 1e9; deterministic under 200 runs.

## Iteration 5 — runtime drill: two RVL integration defects
- RVL mounted AFTER routes → observed nothing (responses ended before middleware). Fixed: mount before routes.
- RVL mounted AFTER chaos hook → measured post-sabotage latency only. Fixed: RVL is the outermost middleware.
- Classification: **workflow/harness defects** (the RVL skill now mandates "outermost middleware" + heartbeat-with-sample-counts so a blind RVL is detectable).

## Iteration 6 — candidate v1.2 (manual-testing finding MT-1): REJECT -> ADMIT
- Unknown-route 404 leaked express HTML (envelope family S-*-002). Implementation fix + structural regression test. Full loop re-run: **19/35/11 all pass → admitted**.

**Total validator-loop iterations to stable admission: 6** (2 implementation fixes, 3 harness/validator fixes, 1 config fix). Ledger: all chains verify; zero unexplained violations.
