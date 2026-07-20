# UI v2 validation report — ui-presentation v2.0.0 + theme-catalog v1.0.0 + user-config v1.2.0

Stage-3 validator extension for the sealed v2 UI batch. Sources of truth: the
sealed bundles (`protocols/ui-presentation/` v2.0.0, `protocols/theme-catalog/`
v1.0.0, `protocols/user-config/` v1.2.0). **No sealed text modified**
(invariants/, schemas/, protocol.yaml, ambiguity logs, evidence-requirements,
validation plans, capability manifests all untouched). The ui-presentation
**validator suite + pinned baseline** were the mission-designated work surfaces
(mission items 1–2); the theme-catalog/config harness layers were already
extended by the implementer (stage 2.5) and were verified, not duplicated.

## Suite changes (validator suite 0.1.x → 0.2.0)

- `validators/checks/computed-style-metrics.mjs` — v2: B-UI-005 must precedence
  matrix, B-UI-007 blind, B-UI-010 flip/colorful/composite, B-UI-011 randomTheme,
  O-UI-004 amended (configured-font path). Shared `driveFourStates` helper;
  authenticated config-pinned pages.
- `validators/checks/caret-tracking.mjs` — B-UI-001 drift clause
  (ADV-UI-IMPL-01 evaluation) + new B-UI-008 tape scenario (scripted stream,
  per-keystroke caret viewport-x + scrollLeft + tracking + mutation confinement).
- `validators/checks/keystroke-contract.mjs` — now async; B-UI-009 quick-restart
  dispatch per cfg enum (tab/esc/enter/off), restart event schema-validated.
- `validators/lib/browser.mjs` — `ensureConfigToken(ctx)` (signup once per run)
  + `sessionToken` page option (localStorage `pdd_token` installed before any
  candidate script: the client only applies config when authenticated).
- `validators/run.mjs` — SUITE_VERSION 0.2.0; protocol version read from
  protocol.yaml (was hardcoded "1.0.0"); `--capture-note` flag.
- `validators/checks/screenshot-similarity.mjs` — capture manifest protocol from
  protocol.yaml (emits `ui-presentation@2.0.0`).
- `validators/validator-set.yaml` — keystroke-contract/caret-tracking/
  computed-style-metrics 0.2.0, screenshot-similarity 0.1.1.
- `protocols/ui-presentation/evidence/baseline/*` — **recaptured from the
  candidate** (mission-approved O-UI-005 fold; details below).

18 new browser scenario pages (7 precedence matrix, 1 configured-font, 1 blind,
3 flip/colorful/composite, 1 randomTheme, 1 tape, 4 quick-restart). All checks
emit clause-level evidence into the standard results JSON.

## Per-invariant pass matrix (v2-relevant; 87 distinct IDs total, zero non-pass)

| invariant | layer | verdict | evidence summary |
|---|---|---|---|
| B-UI-005 (must, was should) | ui behavioral | **pass** (11 clauses) | default tier resolves 9 tokens; unknown→default identity; serika_dark/dracula → catalog tokens (switch observable, `/api/themes/dracula` handshake in request log); all-nine custom slots beat theme=dracula; partial (8/9) → catalog; malformed slot → catalog; theme changes tokens only, never word-stream structure |
| B-UI-007 (new must) | ui behavioral | **pass** (4) | color(incorrect)=color(extra)=color(correct) rgb(209,208,197); S-UI-002 classes carry true state; untyped unaffected |
| B-UI-008 (new must) | ui behavioral | **pass** (6) | single line (top spread 0.00px); reading order preserved; caret viewport-x fixed over 57 keystrokes (max Δ=0.64px, tol 2px); stream translates (scrollLeft max 732px); boundary tracking holds under tape; mutation confinement 0 leaks |
| B-UI-009 (new must) | ui behavioral | **pass** (4) | tab/esc/enter each dispatch a schema-conformant restart event, zero char input, session reset; off → nothing dispatched, typed input intact |
| B-UI-010 (new must) | ui behavioral | **pass** (13) | flip: stream bg from --text, letters from --bg, symmetry contrast 8.05 ≥4.5, error hue band intact (h≈354, s≥0.45), no class/structure change; colorful: incorrect = --colorful-error rgb(255,70,85), extra = derived #b3000e, s 0.56→1.00 raised, hue band holds; composite floors hold |
| B-UI-011 (should) | ui behavioral | **pass** | tokens at test start match catalog member [gruvbox_dark] before any keystroke (atomic) |
| O-UI-004 (amended must) | ui operational | **pass** | default font adv('i')=adv('m')=15.36px; configured fontFamily stack applied; distinguishability holds; caret contrast 6.55 ≥3.0; info: configured proportional adv 5.69 vs 21.32 (equality not required) |
| S-UI-004 (amended) | ui operational | **pass** | all nine sealed tokens incl. --colorful-error present, parseable, schema-conformant (author's 0.1.1 patch) |
| O-UI-005 (amended) | ui operational | **pass** | fresh-test similar=1, mid-test 0.9998 vs **recaptured candidate baseline** |
| B-UI-001 (must) | ui behavioral | **pass** | tracked 55 keystrokes (2px tol); 3-sample visibility; **no positional slide post-keystroke (ADV-UI-IMPL-01)** |
| S-THM-001/002/003 | harness structural | **pass** (4) | catalog schema conformance; 9-slot completeness; 404 ErrorEnvelope (implementer, re-verified) |
| B-THM-001/002/003 | harness behavioral | **pass** (3) | list/get round-trip; 404 no-substitution; byte-determinism (implementer, re-verified) |
| O-THM-001/002/003 | harness operational | **pass** (3) | no-auth + zero writes; p95 ≤50ms; static band checker (pure-JS WCAG/HSL port over SERVED payloads: contrast 4.5/3.0/3.0, L(bg)≤0.2, L(text)>L(bg), error hue band s≥0.45, 4-state pairwise Δ≥32) (implementer, re-verified) |
| cfg v1.2.0 (S-CFG-001 ×5, B-CFG-001/2/3/4) | harness | **pass** (12) | exactly 37 keys incl. 9 customTheme* slots at documented defaults; 37-key round-trip; wholesale 422 incl. **removed key customThemeId → 422** (implementer, re-verified) |

Pre-existing ui checks (S-UI-001/002/003, S-UI-005, B-UI-002/003/004/006,
O-UI-001/002/003/006, S-UI-LINT, S-UI-ORACLE) — all still **pass**.

## Wall-clock deltas

| layer | pre-extension | after | delta |
|---|---|---|---|
| ui suite (`--boot-candidate`) | 109.0s (19 checks) | 133.5s (24 checks) | **+24.5s** (18 new scenario pages) |
| structural / behavioral / operational | unchanged (42/73/16 checks — implementer's state; not touched this stage) | — | 0 |
| **pdd:loop end-to-end** | ≈139.6s (est.; only the ui layer changed) | **164.1s** | ≈ +24.5s (+18%) |
| evidence build+verify | ~4s | ~4s | 0 |

Evidence: **9/9 protocols admit** (bundle count unchanged), ledgers verified
(21 blocks/protocol; theme-catalog 5, ui-presentation 13). ui-presentation
evidence now binds 24 checks (was 19). Candidate unit tests 42/42 untouched.

## O-UI-005 baseline recapture (mission item 2)

Sequence followed the sealed fold order: (1) extended suite green vs the retired
v2.2 baseline (24/24 admit — candidate default rendering pixel-untouched);
(2) recapture `--baseline-mode capture --boot-candidate --capture-note …`
(candidate origin, NOT the replica; --smoke so no ledger/out pollution);
(3) official compare run vs the new baseline → admit (fresh-test similar=1,
mid-test 0.9998). New manifest: `ui-presentation@2.0.0`, source = bootApp
candidate, per-scene SHA-256 + host image id + Chromium version (host-pinning
rules preserved), capture note records the fold. No git commit made — tree left
for lead integration, consistent with prior stages.

## ADV-UI-IMPL-01 evaluation (smoothCaret: fade-ease vs positional slide)

**Resolved: compliant-by-design; a positional slide is unshippable under the
sealed text.** Reasoning and evidence:

1. B-UI-001 requires the caret rect to track the logical boundary within ±2px
   "after every accepted keystroke" at sealed default config (smoothCaret=true).
   The suite measures one macrotask + rAF after the keystroke; a positional
   slide (100–200ms CSS transition on left/transform) would still be mid-flight
   → up to one advance width (≈15px) of error → must-level failure at the
   DEFAULT config. The tolerance is not animation-aware.
2. The candidate ships an opacity-only fade (`#caret.smooth { transition:
   opacity 100ms ease-out }`): the tracked edge never animates. Suite evidence:
   B-UI-001 passes over 55 scripted keystrokes; the new drift clause samples
   caret x immediately post-keystroke and again +220ms → no movement (>2px)
   observed. Tape-mode fixity (57 keystrokes, max Δ=0.64px) independently
   confirms the edge is never animated positionally.
3. Blink/visibility shape is delegated; the 3-sample visibility check passes.

If a positional slide is ever desired, it needs a minor-event protocol
amendment (animation-aware tolerance, or smoothCaret default off, or
measure-after-animation semantics). Reported, not patched.

## Could NOT be validated cheaply (reported, not patched)

1. **B-UI-008 "usable with any line-oriented word display"** — delegation
   detail; only the standard stream display is validated.
2. **B-UI-009 delegated key handling** — focus movement etc. is delegated;
   zen-mode precedence (quick-restart esc vs v1 bail) is candidate-delegated
   (implementer decision 4), unsealed → not validated.
3. **B-UI-011 random selection quality** — suite pins Math.random per
   convention, so the pick is deterministic; atomicity + catalog membership
   validated. Distribution uniformity is uninteresting/delegated. Custom-slots
   vs randomTheme precedence is delegated (implementer decision 8) → not
   validated.
4. **O-UI-004 arbitrary user fonts** — validated via a configured proportional
   family ("Arial" → container sans fallback; stack application asserted).
   Rendering of arbitrary installed fonts is environment-dependent (delegated).
5. **B-UI-005 default-tier identity** — "the default dark theme" is delegated;
   validated via charter bands (O-UI-001/002 on the same page) + unknown→default
   identity, not pinned to a named theme.
6. **O-UI-005 cross-host comparison** — remains should-level per sealed text;
   host-pinned must-level only.

## Protocol-defect / observation notes (no sealed text changed)

1. **B-UI-008 fixity wording** — "stays fixed (±2px across keystrokes)" reads
   absolutely; an anchored implementation without left padding would move the
   caret until the anchor engages and arguably violate the letter of the text.
   The clause "while the stream translates" supports the anchored-regime
   reading, and the candidate (30% anchor + 30% left padding) satisfies both
   readings. Worth a one-line clarification at the next minor event.
2. No sealed text blocked any validator; no other defects found.

## Verification commands run

- `node protocols/ui-presentation/validators/run.mjs --boot-candidate [--smoke]
  [--baseline-mode skip|compare|capture]` — iterated to green.
- `npm run pdd:loop` — rc=0, 164.1s, all four layers admit (42/73/16/24),
  evidence 9/9 admit, ledgers OK.
- `npm run evidence:build && npm run evidence:verify` — re-bound after final
  suite state; 9/9 admit.
- `npm test` — 42/42.

## Residual risk

- Two early smoke runs died with a Chromium `TargetCloseError` at page creation
  (~100s in, pre-instrumentation); six consecutive full runs since are green.
  Transient browser-startup flake suspected (no code change implicated);
  watch for recurrence in CI.
- The B-UI-005 matrix pins its slot→token mapping from the sealed key/slot
  naming (Bg→--bg … ColorfulError→--colorful-error); if a future seal renames
  slots, the map needs a one-line update.
- quick-restart "off" coverage presses Tab only (the reference binding); other
  unbound keys are delegated behavior.
