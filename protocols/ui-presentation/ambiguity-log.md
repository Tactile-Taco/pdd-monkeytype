# Ambiguity log — ui-presentation

## Resolved assumptions

- **CA-UI-01 (critical, resolved by definition; CONFIRMED round 2).**
  "Caret tracks engine caret state": the engine exposes no caret object; the
  only cursor state is `wordIndex` + `inputs[wordIndex]`. Competing readings:
  (A) caret = insertion point after the last typed char of the active word;
  (B) caret = free pointer position / click target; (C) caret = end of the
  active word regardless of input. Readings differ observably (a validator or
  user can tell). Chosen: **A**, formalized in B-UI-001 as logical caret
  position (wordIndex, n). Revealing test if wrong: type 2 chars of word 0,
  backspace once — caret must sit between letter 0 and letter 1, not at word
  end. [criticality: behavior-changing]
- **P2 conflict case (adjudicated round 2).** The orchestrator's error-contrast
  floor (>= 4.5) conflicted with their own reference-informed palette
  (#ca4754 on #323437 = 2.70:1). Negotiation surfaced the internal conflict;
  adjudication: the persistent intent is the *principled accessibility floor*,
  not the specific number — sealed as >= 3.0 with the WCAG large-text clause
  (letters >= 24px computed, asserted in the same pass), O-UI-001. Recorded as
  a case where negotiation corrected the stakeholder's intent set, not just the
  protocol text. [criticality: behavior-changing; orchestrator-adjudicated]
- **P3 saturation floor 0.45 (adjudicated round 2).** Reference extra-error
  #7e2a33 measures s = 0.500 to rounding; 0.50 would flap. Sealed 0.45,
  O-UI-002. [criticality: cosmetic]
- **Q1 screenshot baseline (adjudicated round 2).** Baseline = live v2.2
  (pre-caret reference aesthetic), captured by the validator harness from
  https://pdd-monkeytype.pdd-typing.workers.dev at validator-authoring time,
  stored under protocols/ui-presentation/evidence/baseline/, same-host
  comparisons only. Re-baseline post-caret = minor version event.
  [criticality: cosmetic; the 0.85 threshold absorbs either reading]
- **Q2 theme multiplicity (adjudicated round 2).** B-UI-005 stays should:
  multi-theme catalog is transient; theme arrives as a config value only, no
  theme endpoint; single charter-conformant theme ships this iteration.
  [criticality: cosmetic]
- **Q3 live-stats region (adjudicated round 2).** Stays delegated: engine
  already validates stats math; live-region presentation is not persistent
  intent. [criticality: cosmetic]
- **Q4 caret blink/shape (confirmed round 2).** Delegated; validator tolerates
  blink phase via 3-sample visibility (B-UI-001). [criticality: cosmetic]
- **P6 class vocabulary (adjudicated round 2).** `correct` / `incorrect` /
  `extra` / `active` sealed verbatim (S-UI-002/003); single client dialect, so
  a renaming-indirection layer buys no substitutability. [criticality: cosmetic]
- **Active-word distinction mechanism.** Sealed as a DOM class contract
  (S-UI-003); the *style* of the distinction (underline, bold, color) is
  delegated. All class-based readings satisfy the invariant.
  [criticality: cosmetic]
- **"Matches the event payload" for results (B-UI-004).** Readings: exact
  numeric equality vs display-rounded equality. Chosen: exact (round2 payload
  values rendered as-is); rounding display is non-conformant. Decoration
  (labels, % suffix) delegated. [criticality: cosmetic after the exact-value
  rule; the rule itself removes the behavior-changing fork]
- **Unknown/absent `theme` from user-config falls back to the default dark
  theme** (B-UI-005). Competing reading "keep last theme" is observably
  different on first load; fallback-to-default chosen as the conservative
  default (config.schema.json leaves `theme` a free string, so unknown values
  are reachable). [criticality: behavior-changing; conservative default;
  orchestrator did not override in round 2]
- **Reading order = row-major visual order with 2px tolerance** (S-UI-001),
  covering flex-wrap reflow. [criticality: cosmetic]
- **Zen mode is covered, not excepted**: a zen session is one long word; all
  stream/letter/caret invariants apply unchanged. [criticality: cosmetic]

## Open questions

- None at sealing (v1.0.0). All round-1 questions adjudicated in round 2;
  merge levers (O-UI-003 into O-UI-001; S-UI-005 removal) were offered and not
  exercised.

## Post-sealing conformity notes (no version event; normative text unchanged)

- **PSN-UI-01 (v1.0.0, stage 2) — reference --error value vs. the O-UI-001
  floor.** The implementer found that the sealed O-UI-001 error-on-background
  floor (>= 3.0, large-text) does NOT admit the reference palette's
  --error #ca4754 on #323437: it measures **2.70:1** (recomputed at note time:
  2.70). The round-1/2 records incorrectly implied the 3.0 floor "preserves
  the reference aesthetic" for every token — true for --text (8.05:1), --main,
  and --caret, but false for --error. Resolution implemented locally, inside
  delegated space: --error lifted #ca4754 -> **#cf5763** (same hue/sat:
  h 354.0 -> 354.0, s 0.553 -> 0.556; contrast **3.09:1**), which satisfies
  O-UI-001 (>= 3.0) and O-UI-002 (h in [340,360], s >= 0.45).
  **CA classification: cosmetic / delegated.** No critical ambiguity: the
  outcome is decidable from normative text alone — S-UI-004 seals token NAMES
  and delegates token VALUES within bands, and P2 adjudicated the persistent
  intent as the accessibility floor, not the palette value. Zero blocking
  questions, zero orchestrator round-trips, zero version event.
  **Negotiation-process finding:** the transcript error was the author's
  (round-1 rationale, carried into round 2): the claim "3.0 with the
  large-text clause preserves the reference aesthetic" was verified per
  palette family, not per token. Lesson, now binding on this author's future
  bundles: any rationale of the form "this bound admits the reference" must be
  verified numerically for EVERY token/value it covers before sealing; an
  unverified admission claim is a defect class of its own, distinct from a
  critical ambiguity. The two-tier contract (sealed floor + delegated values)
  absorbed the error exactly as designed — the implementer repaired it
  without escalation, which is the friction behavior this research project
  set out to demonstrate. [criticality: cosmetic; delegated]
