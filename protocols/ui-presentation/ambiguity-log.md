
## v2.0.0 (MAJOR version event — brownfield roadmap D4b; SEALED 2026-07-20)

Adjudicated: C1/C2 rulings in research/brownfield/roadmap-orchestrator-r2.md.

- **CA-UI-02 (critical, resolved by orchestrator ruling C1; SEALED direction).**
  "Monospace rendering" (O-UI-004 v1.0.0): a sealed cosmetic assumption
  (monospace-everything) that turns behavior-visible once a font catalog
  exists — the second CA-001-class instance (orchestrator's classification).
  Competing readings: (A) mandatory monospace forever (v1 text); (B) font
  configurable, monospace default. Reference offers proportional fonts → A
  contradicts parity. Ruling: B with the minimal amendment — advance-equality
  survives for the DEFAULT font; with a configured font, O-UI-003
  distinguishability and caret legibility hold instead. B-UI-001/002/003
  carry the interaction contract unchanged (author LOW-cost assessment,
  accepted). [criticality: behavior-changing; orchestrator-adjudicated]
- **C2 token slots (adjudicated, ratified round 4).** Sealed list grows
  ADDITIVELY to nine slots: + --sub-alt, + --colorful-error, both required
  (S-UI-004, charter schema). Round-4 ruling: if the reference's 9th slot
  differs at data import, data adjusts — protocol slots stand.
- **Theme resolution precedence (B-UI-005 should→must).** The v1.0.0
  rationale's pre-noted upgrade path executed: custom slots (all nine valid)
  > catalog theme (theme-catalog handshake) > default dark fallback.
  [orchestrator instruction; verify reference editor behavior at
  implementation]
- **Blind mode (B-UI-007).** Errors hidden presentationally, classes/accounting
  untouched; O-UI-003 gated. [annex; verify extra-hiding at implementation]
- **Tape mode (B-UI-008).** Sealed as anchor FIXITY (±2px), not anchor
  LOCATION — location delegated pending reference ground truth. [annex;
  verify]
- **Quick-restart (B-UI-009).** Sealed at dispatched-effect level (restart
  event, no char input); key routing delegated. [annex; verify routing]
- **Flip/colorful (B-UI-010 composite).** Flip = token-role swap (contrast
  holds by WCAG symmetry; dark-family band gated off in O-UI-002(i)).
  Colorful = saturation-raised error variants within the hue band.
  [feature-inventory; verify derivation rules]
- **Re-baseline fold (O-UI-005).** v2.2 baseline retired; re-capture from the
  first admitted v2.0.0 candidate rides THIS event (adjudicated fold).
- **Live-stats toggles.** user-config v1.2.0 persists liveWpm/liveAcc/
  liveBurst; the live-stats REGION stays delegated (round-2 Q3 stands).
- **Delegated additions confirmed:** font SIZE values (fontSize key, 0 =
  client default), font stack choices within same-origin/system constraint
  (O-UI-006), caret style/shape (caretStyle key), smooth-caret animation
  (smoothCaret key), random-theme selection algorithm (B-UI-011 should).

## Round-4 ruling record
- BQ-UI-01 (19 musts): legacy-bundle exception GRANTED — ui-presentation
  joins typing-test-engine as exception-listed; new bundles stay ≤12.
  Orchestrator rationale: a MAJOR consolidating presentation config;
  composite-invariant style (B-UI-010) shows the right compression instinct.
- BQ-UI-02 / BQ-THM-01 (9th slot): RATIFIED — nine slots as sealed.
- O-UI-005 v2.2-baseline retirement: APPROVED — recapture from the first
  admitted v2.0.0-conformant candidate (deploy line v3.0) within this event
  window, same host-pinning rules; CI recaptures per-run.
- Open at sealing: none.

## Watch items (for next minor; non-blocking)
- B-UI-008 fixity wording (from validation, orchestrator relay): the
  invariant pins caret viewport-X FIXITY (±2px across keystrokes) — two
  readings coexist: absolute-fixed (caret never moves; stream does all the
  work) vs anchored-regime (caret fixed in the tape scroll regime; word-
  internal micro-movement permitted). The current candidate satisfies BOTH,
  so no conformance risk now; clarify the intended reading at the next
  ui-presentation minor to keep future candidates pinned to one regime.
  [criticality: cosmetic today; potentially behavior-changing for a future
  candidate — hence watch-listed, not silently edited]
