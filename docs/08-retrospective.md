# Retrospective: how the first PDD implementation actually went

## 1. Verdict on the first implementation

**Outcome: admitted on all 7 protocols after 6 validator-loop iterations, with 2 genuine implementation defects, 3 harness/validator defects, 1 config gap, and 1 runtime blind spot found by manual testing.** A subsequent improvement cycle promoted one runtime-evidence finding into test-results v1.1.0 (O-RES-004), which also admitted.

The process did what the paper says it should: nothing was admitted on the strength of looking correct; every admission carries signed evidence; the one failure that escaped both build-time validation and runtime attestation was still caught (by the mandated manual exploratory pass) and converted into a regression test and a new invariant.

## 2. Defect ledger and fault attribution

| # | Defect | Caught by | Fault class |
|---|---|---|---|
| D1 | ratings map leaked into quote wire shape (S-QT-001) | structural layer | **implementation** |
| D2 | leaderboard property polluted by shared app state | behavioral layer | **harness/validator** (test isolation) |
| D3 | secrets scan false-positive on PDD_CHAOS drill hook | operational layer | **harness/config** |
| D4 | B-ACC-001 birthday collision (flaky generator) | behavioral layer | **harness/validator** (generator design) |
| D5 | RVL mounted after routes → observed nothing | runtime drill | **workflow/harness** (integration) |
| D6 | RVL mounted after chaos hook → measured post-sabotage time | runtime drill | **workflow/harness** (ordering) |
| D7 | unknown-route 404 bypassed envelope AND RVL | manual testing | **implementation** + **protocol-blind-spot** |

**Attribution: workflow & harnessing 4, implementation 2, protocol authoring 0 (+1 blind spot converted to v1.1.0).**

Notably ZERO defects traced to protocol authoring. Why: (a) the mediated-Q&A model kept domain facts grounded in the reference with provenance; (b) contract negotiation caught the three cross-protocol mismatches (C1 charStats shape, C2 DB-access assumption, C3 verdict severity) *before* any code existed — the exact failure class that otherwise surfaces mid-implementation. The one protocol-level miss was not a wrong invariant but a missing one (choke point), which is precisely the class the paper expects runtime evidence to surface and Discovery-Log promotion to absorb.

## 3. What the iterations taught us (generalizations)

1. **A validator that can see nothing looks exactly like a passing validator.** D5/D6: the RVL was "green" while observing zero responses. Generalization (now in `pdd-runtime-verifier`): every RVL must emit periodic heartbeats WITH per-route sample counts; a heartbeat showing zero samples is itself an alarm.
2. **Observation boundaries belong at the outermost edge.** All interceptors (RVL, egress traps) must be mounted before everything they might need to observe — including test/drill hooks.
3. **Property generators need uniqueness budgets.** D4: sampling names from a 900-value space at 5 runs is a birthday paradox waiting to happen. Generalization (now in `pdd-validation-engine`): when a property requires distinct entities, either generate from spaces ≥1e6× the run count, dedupe, or use uniqueArray.
4. **Global-state assertions need isolated fixtures.** D2: any assertion over an aggregate (leaderboard, counts) must run against a dedicated instance or be expressed relative to prior state.
5. **Static endpoint inventories go stale.** D7 existed because contract tests enumerated KNOWN routes. Generalization: add "unknown route" probes to every structural suite, and a choke-point invariant for every HTTP-serving protocol.
6. **Mutation sanity is cheap and catches vacuous properties early.** Four mutants, all killed; the one time a property passed against a mutant (raised bound during development) it correctly flagged the test as suspect before we trusted it.
7. **Negotiation minutes pay for themselves.** The three C-conflicts would each have been a multi-hour cross-module bug if found at integration time.

## 4. Interesting insights from the process

- **Mediated Q&A produced BETTER protocols than open access would have.** Forced to ask formal questions, authors produced explicit, testable statements (e.g. the kogasa formula with NaN handling) instead of vague "match reference behavior" clauses. Constraint-driven specificity is a feature, not a cost.
- **The Natural Language Tax showed up exactly where predicted.** The single longest exchange was pinning down "consistency" — a word with three different precise meanings in the reference (burst-based, key-based, wpm-based). Without the taxonomy, an author would have written one vague invariant.
- **Evidence chains changed our behavior.** Knowing every admission would be hashed and countersigned made the team noticeably more conservative about declaring victory — the ledger creates social pressure toward precision.
- **Protocol-version events are the right granularity for runtime feedback.** v1.1.0 (O-RES-004) took <10 minutes end-to-end: finding → version bump → new validator check → re-admission with fresh evidence. The governance loop is genuinely lightweight when protocols are small and sealed.

## 5. Skill improvements applied (fed back into the .skill packages)

- `pdd-runtime-verifier`: + "outermost middleware" rule; + heartbeat-with-sample-counts requirement; + blind-RVL anti-pattern note; + choke-point invariant guidance; + drill hooks inside the boundary.
- `pdd-validation-engine`: + uniqueness budgets for generators; + isolated fixtures for aggregate assertions; + unknown-route probes in structural suites; + choke-point check for HTTP protocols; + mutation-sanity non-optional.
- `pdd-implementation-generator`: + "all responses through a single envelope helper" rule; + drill-hook convention (env-gated, documented, outside admission); + boundary transforms (stored shape vs wire shape).
- `pdd-ci-architect`: + workflow OAuth scope install pattern (ci-templates + one-command install); + lockfile discipline note.
- `pdd-team-orchestrator`: + manual exploratory pass is load-bearing; + continuous checkpointing of durable artifacts.

## 6. What we'd do differently next time

- Author the RVL's monitorable projection BEFORE the implementation (it was retrofitted), so choke-point invariants exist from day one.
- Generate the protocol bundles' schemas from a single shared source to eliminate the C1-class mismatch mechanically rather than by negotiation.
- Run the runtime drill earlier (before first admission) as a smoke test of the harness itself.
