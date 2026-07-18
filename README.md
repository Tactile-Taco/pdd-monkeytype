# pdd-monkeytype

A [monkeytype](https://github.com/monkeytypegame/monkeytype)-inspired typing platform built **Protocol-Driven Development first**: seven sealed protocol bundles are the durable artifacts; the implementation is a replaceable candidate admitted only through the Validator Loop with a verifiable Evidence Chain.

> Code is transient; protocol is sovereign.

## Layout

```
protocols/          7 sealed PDD bundles (P=(S,B,O), handshakes, capability manifests,
                    validator sets, ambiguity logs, evidence requirements)
implementation/     the admitted candidate: isomorphic engine (browser+server),
                    anticheat, Express API, frontend
harness/            the Validator Loop: structural / behavioral / operational validators,
                    evidence chain builder+verifier, runtime drill, manual UI test
docs/               assessment, protocol derivation, orchestration transcript,
                    validation log, manual testing + remediation, comparison, retrospective
team/               the PDD agent roster (skills ship as packaged .skill artifacts)
.github/workflows/  pdd-pr-gates, pdd-validator-loop, pdd-nightly, pdd-release-gate
```

## Run the Validator Loop

```bash
npm install
npm run pdd:loop     # structural -> behavioral -> operational -> evidence -> verify
```

Running the loop regenerates `evidence/` (admission objects, discovery logs, ledgers) and `harness/out/`.

## Run the app

```bash
npm start            # http://localhost:8787
```

## Runtime drill (violation -> remediation -> ledger outcome)

```bash
node harness/runtime-drill.mjs
```

## Methodology

Based on *Protocol-Driven Development: Governing Generated Software Through Invariants and Continuous Evidence* (arXiv:2605.12981) and *Post-Deterministic Distributed Systems* (arXiv:2606.01722). See `docs/01-skill-assessment.md` for the team/skill design rationale and `docs/05-orchestration-transcript.md` for how seven protocol authors recreated this system from a reference they were never allowed to read.
