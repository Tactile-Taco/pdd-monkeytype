# Validator loop — ui-presentation v1.0.0 vs the Stage-2 candidate (stage 3b)

Author: Validation Engineer. Date: 2026-07-20. Suite: `protocols/ui-presentation/validators/`
(sealed in stage 3a; no check logic changed during 3b). Candidate: `implementation/`
Stage-2 build (caret, `:root` token charter, B-UI-003 no-op-class fix, lifted
`--error #cf5763`). Authority: the sealed validators, per the stage gate.

## 1. Outcome

**The candidate admitted on iteration 1 — zero implementation defects found.**
All 14 `must` and all 3 `should` invariants pass on the first full-suite run
against the locally served candidate. No fix iterations were required; the
Stage-2 build's self-reported conformance held under the sealed checks.

## 2. Iteration table

| # | Target | Suite config | Result | FAILs | Fixes applied | Wall clock |
|---|--------|--------------|--------|-------|---------------|------------|
| 1 | candidate, `http://localhost:8787` (Express, temp data dir) | `--engine-semantics v1.1` (default), `--runs 50`, `--seed 42`, baseline compare | **admit** (19/19) | none | none | **92.9 s** |

Reference points (stage-3a research runs, for calibration):
| # | Target | Result | Wall clock |
|---|--------|--------|------------|
| 0a | v2.2 replica, `--runs 3` | reject (expected gaps) | 16.2 s |
| 0b | v2.2 replica, `--runs 50` | reject: B-UI-001, S-UI-004, O-UI-001, O-UI-002 (pre-caret/pre-charter, all adjudicated) | 90.7 s |
| 2 | candidate via `--boot-candidate` inside full `pdd:loop` | admit | 97.6 s (UI layer); **130 s loop total** |

Loop runs:
| Loop run | Result | Notes |
|---|---|---|
| `pdd:loop` #1 | exit 1 at `validate:behavioral` (19 s in) | B-ACC-001 property flake — pre-existing, user-account layer, outside 3b scope (see §6) |
| `pdd:loop` #2 | **exit 0 — 8/8 protocols admit** | structural/behavioral/operational/ui layers all admit; `evidence:verify` all OK (ui-presentation ledger: 1 block) |

## 3. Candidate evidence highlights (iteration 1)

| Invariant | Evidence |
|---|---|
| B-UI-001 | caret tracked over 55 scripted keystrokes (2px); 3×250ms visibility OK (solid caret, area 3px × 2.4rem) |
| B-UI-002 | scripted 55 steps + fuzz 50 runs / 2,093 steps clean; mutant killed; **no completing-keystroke staleness** — candidate refreshes before the completion branch (strict reading implemented; stage-3a insufficiency #2 resolved in practice) |
| B-UI-003 | 27,581 mutation records, all confined to {active_before, active_after, caret, stats} (vs 46,018 on v2.2 — the candidate's no-op-class fix eliminated the record storm, value-aware reading confirmed) |
| B-UI-004 | results show `wpm=4436.62 acc=100` exactly (POST /api/results interception against the real server); test view hidden |
| S-UI-004 / O-UI-001 | 7 tokens on `:root`; contrast text 8.05 / error 3.09 (lifted `#cf5763` ≥ 3.0 ✓) / caret 6.55; letters 25.6px ≥ 24 |
| O-UI-002 | L(--bg)=0.0341 ≤ 0.2; error h=354.0 s=0.556; error-extra h=353.6 s=0.500; authored `:root` token set validates against `theme.schema.json` |
| O-UI-003 | pairwise deltas 60..166 (floor 32) |
| O-UI-004 | adv('i') = adv('m') = 15.36px; ui-monospace generic present |
| O-UI-005 | fresh-test similar = 0.999897, mid-test = 0.9996 (Δ16, ≥0.85, same host) — deltas are the caret bar + live-stats digits, exactly as predicted in stage 3a |
| O-UI-006 | 67 requests across 7 page sessions, all same-origin |

Artifact identity recorded: `implementation_artifact_hash sha256:62c36321…`
(served document/script/style bodies, engine module hashed pre-rewrite).

## 4. Harness wiring (final state)

- `package.json` `pdd:loop`: `validate:structural && validate:behavioral && validate:operational && validate:ui -- --boot-candidate && evidence:build && evidence:verify`.
- `--boot-candidate` boots `implementation/` in-process via `harness/boot.mjs`'s `bootApp()` (ephemeral port, temp data dir) — the same convention as the other three layers; no external server or fixed port needed. `--origin URL` remains for external targets (localhost or live).
- `harness/build-evidence.mjs` consumes `harness/out/ui-presentation.json` when present (prefix `UI`; should-severity non-blocking per the plan's admission_rule). Verified: 8/8 admission, `evidence:verify` OK on every ledger.
- Candidate slot hygiene: smoke/research runs never write the candidate file (`--smoke` → `.smoke.json`).

## 5. Stage-3a protocol-text insufficiencies — friction accounting

Of the 10 insufficiencies reported in `validator-authoring.md` §5, **zero
blocked the validator loop in practice**; all had been worked around at
authoring time. Two remain latent for divergent candidates:

| # | Insufficiency | 3b outcome |
|---|---|---|
| 1 | DOM identity hooks unsealed (`.word`, `#words`, `data-wi`, `#caret`) | **Worked around** (discovery defaults + `--set`). Candidate follows the reference lineage → no friction. **Latent**: a divergent-but-conformant candidate would need flag config; recommend sealing discovery hooks in a future text event (minor). |
| 2 | B-UI-002 completing-keystroke scoping | **Resolved in practice**: the candidate implements the strict reading (refresh before completion; code cites the invariant). Validator's session-boundary scoping accepts both readings; v2.2's staleness remains recorded as smoke observation. |
| 3 | B-UI-003 no-op MutationRecords | **Worked around** (value-aware recording). Candidate additionally fixed the cause (no blanket `classList.remove`); record volume dropped 40% vs v2.2. |
| 4 | O-UI-005 determinism mechanism (Math.random not mentioned) | **Worked around** (seeded mulberry32 pin). Fresh scene pixel-identical across runs; mid-test ≥ 0.9996. |
| 5 | O-UI-002 theme-schema authored-vs-computed values | **Worked around** (validate authored stylesheet values). Candidate authors hex → passes. **Latent**: rgb()-authored tokens would fail the schema clause while passing bands; text silent on which is intended. |
| 6 | B-UI-004 POST-vs-in-page payload capture | **No friction**: candidate POSTs when authed; primary interception path used. Oracle-replay fallback written but unexercised. |
| 7 | Caret x-anchor / extras boundary | **No friction**: candidate's caret left edge == boundary exactly (0px delta); extras counted as letters on both sides. |
| 8 | S-UI-001 text equality only for untyped words | **Worked around** (assert on fresh render). No friction. |
| 9 | "live-stats region" / `host_image_id` undefined | **Worked around** (`#stats` default; host id = sha256(chromium + OS + font probe + viewport)). Same-host admission exercised end-to-end. |
| 10 | Engine-semantics skew v1.0/v1.1 (+ mission-brief path imprecision) | **No friction** for the candidate (v1.1 engine, default flag). The `v1.0` mode is only needed for v2.2-era smoke runs. |

Net friction classification: 10 protocol-gap findings, 0 blocking, 8 worked
around cleanly, 2 latent-but-nonblocking (#1, #5). None required protocol
patching during 3b; none required implementation fixes during the loop.

## 6. Pre-existing flake observed (not in 3b scope — reported)

`pdd:loop` run #1 stopped at `validate:behavioral`: B-ACC-001 (account
signup case-insensitive uniqueness property, `fc.integer` over names) failed
once, then admitted 4/4 times (3 standalone + loop run #2). Mechanism not
isolated (brief look: no obvious cause; possibly a duplicate draw or a store
write race). `implementation/src` is untouched since the previously admitted
loop (docs iteration 7); the flake predates stage 3b and is independent of the
UI layer (behavioral runs before `validate:ui` in the loop). Recommend the
user-account owner add run-count/seed reporting if it recurs; left unpatched
(outside the delegated scope, and touching the account property risks
disturbing another protocol's admission).

## 7. Runtimes summary

- Sealed UI suite vs candidate: **92.9 s** standalone; 97.6 s inside the loop
  (boot overhead). Breakdown ≈ stage 3a (fuzz ~1.4 s/run dominates).
- Full `pdd:loop`: **130 s** end-to-end (structural ~10 s, behavioral ~15 s,
  operational ~10 s, UI ~98 s, evidence ~2 s).
- Nightly fuzz (`UI_PBT_RUNS=200`) projects to ≈ 5 min for the UI layer.

## 8. Final verdict

`ui-presentation@1.0.0` **admitted** into the candidate alongside the other
seven protocol bundles; `pdd:loop` exits 0 with 8/8 admissions and all runtime
ledgers verifying. Suite, baseline, and research docs are in-repo; the suite
remains target-agnostic (`--origin`, `--boot-candidate`, `--replica`) for
regression, staging, and live-origin runs.
