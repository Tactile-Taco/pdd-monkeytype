# Assessment: `openkedge/pdd-protocol-author` vs. the PDD papers

**Sources assessed**

- Paper A — *Protocol-Driven Development: Governing Generated Software Through Invariants and Continuous Evidence* (arXiv:2605.12981v3). The core PDD methodology.
- Paper B — *Post-Deterministic Distributed Systems* (arXiv:2606.01722v1). Positions PDD as the "Safety Perimeter" pillar among five (VAI, ASCP, SQA, ESR).
- Skill — `github.com/openkedge/pdd-protocol-author` (SKILL.md + references + templates + `validate_pdd_bundle.py`).

## 1. What the skill gets right

The skill is a faithful implementation of **exactly one role** in the paper's reference architecture: the **Protocol Author**. Concretely:

| Paper concept | Skill coverage |
|---|---|
| Protocol `P = (S, B, O)` triplet | Three invariant files (`structural/behavioral/operational.yaml`) with `id/statement/severity/rationale/validation` fields |
| Typed handshakes | JSON Schema templates + guidance: small stable schemas, versioning, nullability, enums |
| Natural Language Tax | Ambiguity taxonomy reference, ambiguity log (resolved assumptions vs open questions), "blocking ambiguity prevents sealing" |
| Capability manifests | `capability-manifest.yaml` (network/disk/db/secrets/latency/memory/concurrency) |
| Validator mapping | `validation-plan.yaml`; every invariant maps to >=1 validation mechanism |
| Evidence requirements | `evidence-requirements.yaml` (protocol version, artifact hash, validator versions, results, dependency manifest, discovery log, replay metadata) |
| Authoring discipline | must/should severity split; no silent domain facts; surface conflicts; do not claim proven without validator backing |
| Bundle sealing workflow | `status: draft/review/sealed/deprecated`; structural bundle linter (`validate_pdd_bundle.py`) |

The invariant-pattern library (idempotence, fail-closed errors, backward-compatible minor versions, streaming-no-disk) matches the paper's worked examples (idempotent handler, bounded ETL pipeline) almost clause-for-clause.

## 2. Where the skill falls short of the papers

The gap is not quality — it is **scope**. Paper A defines a *seven-component reference architecture* and the skill implements one of the seven. Measured against a full agentic SDLC team, the following are missing:

1. **Contract negotiation is described but not operationalized.** The paper requires dependency resolution, compatibility checking, capability reconciliation, and conflict detection *across* protocol boundaries before sealing. The skill authors bundles in isolation; nothing checks that protocol A's handshake satisfies protocol B's expectations. (Confirmed painful in this project: cross-protocol mismatches were our #1 defect class — see `docs/05-orchestration-transcript.md`.)

2. **No Implementation Generator role.** The paper is explicit: "generation proposes; validation decides." A generator agent needs its own discipline: treat output as untrusted candidate, never self-declare validity, target the sealed bundle only, emit machine-readable discovery metadata.

3. **No Validation Engine skill.** The skill emits a *plan* for validators but nothing that *executes* the three layers (structural -> behavioral -> operational). A team needs runnable competence: JSON Schema conformance, property-based testing (fast-check style), metamorphic relations, coverage disciplines (branch/MCDC where warranted), mutation testing to detect vacuous properties, sandbox/policy checks for capability conformance, latency/memory measurement.

4. **No Evidence Chain machinery.** The paper defines `E = H(P, I, V, R, t)` — a signed digest over protocol, implementation, validators, results, and provenance — plus Discovery Logs. The skill lists evidence *requirements* but has no hash-chaining, signing, or evidence-store procedure.

5. **No Dynamic Evidence Ledger / Runtime Verification Layer.** The paper's second half (continuous attestation, monitorable runtime projection, RVL isolation property, violation blocks `E_fail`) is entirely absent. For a full-SDLC team this is the difference between "passes CI" and "stays accountable in production."

6. **No Remediation Orchestrator.** Paper A's closed loop `E_fail -> C_t -> I' -> Validate(I', P) -> L_{t+1}` needs a role that converts runtime violations into structured repair contexts and forces re-admission.

7. **No CI/CD scheduling competence.** Neither paper nor skill covers the enterprise-delivery surface: GitHub Actions that run the Validator Loop on push/PR, nightly extended property runs, scheduled mutation testing, evidence archival as CI artifacts, release gating on sealed-protocol status. A real team must author and schedule these.

8. **No orchestration model.** A PDD team is multi-agent by construction (authors per protocol, generators, validators, evidence keeper, remediation). The skill gives no protocol for *agent-to-agent* work: who may talk to whom, how an author asks domain questions without seeing sources (deliberately relevant to this project), how negotiation is minuted.

9. **Minor fidelity gaps vs. the paper:** the paper's appendix sketch includes `validators/validator-set.yaml` (approved validator identities + versions) and `evidence/runtime-ledger.jsonl`; the skill's bundle layout has neither. The skill's `validate_pdd_bundle.py` checks file existence/markers only — it does not check invariant-ID uniqueness, that every `must` invariant has a validator mapping, or that handshake references resolve (added in our fork — see `skills/pdd-protocol-author`).

## 3. Verdict

**As a protocol-authoring skill: strong.** An agent equipped with it will produce well-formed, paper-conformant bundles with good ambiguity discipline. **As preparation for PDD protocol authorship inside a team: necessary but insufficient.** It covers roughly 1/7 of the reference architecture and none of the delivery/runtime/evidence surfaces. To field a full agentic SDLC team we designed and implemented eight additional skills plus a fork of the original:

| # | Skill | Paper role covered |
|---|---|---|
| 1 | `pdd-protocol-author` (fork, extended) | Protocol Author (+ hardened linter, validator-set registry, runtime-ledger slot) |
| 2 | `pdd-contract-negotiator` | Contract negotiation & sealing across interdependent protocols |
| 3 | `pdd-implementation-generator` | Implementation Generator (constrained search, TDD-integrated) |
| 4 | `pdd-validation-engine` | Validation Engine (structural/behavioral/operational layers, property testing, coverage, mutation sanity) |
| 5 | `pdd-evidence-keeper` | Evidence Store, Evidence Chains, Dynamic Evidence Ledger |
| 6 | `pdd-runtime-verifier` | Runtime Verification Layer (monitorable projection, attestation/violation blocks) |
| 7 | `pdd-remediation-orchestrator` | Remediation Orchestrator (violation -> repair context -> re-admission) |
| 8 | `pdd-ci-architect` | GitHub Actions authoring/scheduling for validator loops (enterprise SDLC surface) |
| 9 | `pdd-team-orchestrator` | Multi-agent orchestration, mediated Q&A, negotiation minutes, quality gates |

The full specifications are in the team's packaged `.skill` files. Section 2's gap list doubles as the team's design requirements.
