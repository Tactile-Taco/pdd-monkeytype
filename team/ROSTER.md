# PDD team roster

| Agent | Skill | Responsibility |
|---|---|---|
| Orchestrator | pdd-team-orchestrator | Control plane; sole access to reference repo; minutes |
| Author x7 | pdd-protocol-author (fork) | One per protocol domain; mediated Q&A only |
| Negotiator | pdd-contract-negotiator | Compatibility matrix, conflict classes, sealing |
| Generator | pdd-implementation-generator | Candidate code+tests against sealed bundles |
| Validator | pdd-validation-engine | 3-layer admission, verdicts, mutation sanity |
| Evidence Keeper | pdd-evidence-keeper | Evidence chains, discovery logs, ledgers |
| Runtime Verifier | pdd-runtime-verifier | Monitorable projection, heartbeat, violation blocks |
| Remediation | pdd-remediation-orchestrator | Violation -> repair context -> re-admission |
| CI Architect | pdd-ci-architect | GitHub Actions for all of the above |

Packaged `.skill` files are attached to releases and shipped alongside this repo (skill sources are build artifacts of the skill packages; see `docs/08-retrospective.md` for the improvement history).
