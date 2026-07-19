# ui-presentation — Post-sealing conformity note (round 3, NOT a version event)

**Bundle state: ui-presentation v1.0.0, status sealed — unchanged.** This note
records a stage-2 conformity finding. No sealed invariant text, version, or
validator was modified; the ambiguity log is the living record and carries the
same entry (`protocols/ui-presentation/ambiguity-log.md`, PSN-UI-01).

## PSN-UI-01 — reference --error value vs. the O-UI-001 floor

- **Finding (implementer, stage 2):** the sealed O-UI-001 error-on-background
  floor (>= 3.0, WCAG large-text) does NOT admit the reference palette's
  --error `#ca4754` on `#323437`: measured **2.70:1** (author recomputation at
  note time agrees: 2.70).
- **Transcript error:** the round-1 author rationale and round-2 records
  claimed the 3.0 floor "preserves the reference aesthetic." That claim holds
  for --text (8.05:1), --main, and --caret, but was never verified for
  --error — where it is false. The author computed 2.70 in round 1 and weighed
  it only against the proposed 4.5 floor, not against the 3.0 floor actually
  sealed.
- **Resolution (delegated space, no escalation):** --error lifted
  `#ca4754` -> **`#cf5763`**. Verified: contrast **3.09:1** on #323437
  (>= 3.0, O-UI-001 pass); HSL h 354.0 -> 354.0, s 0.553 -> 0.556 — inside the
  O-UI-002 red band ([0,15]∪[340,360], s >= 0.45). Hue and saturation
  effectively unchanged; luminance lifted.
- **CA classification: cosmetic / delegated.** Not a critical ambiguity — the
  correct action is decidable from normative text alone: S-UI-004 seals token
  NAMES and delegates token VALUES within bands, and P2 adjudicated the
  persistent intent as the accessibility floor, not the palette value. Zero
  blocking questions, zero orchestrator round-trips, zero version events.
- **Negotiation-process finding (for the paper):** (i) new defect class
  recorded — an *unverified admission claim* in a rationale ("this bound
  admits the reference"), distinct from critical ambiguity; binding lesson for
  this author: verify such claims numerically for EVERY token/value covered
  before sealing. (ii) The two-tier contract worked as hypothesized (H1): a
  palette-level defect was absorbed inside delegated space at zero friction
  cost, with the sealed floor doing exactly its one job.

## Friction ledger impact

None. Blocking-question count remains 4 (all round-1, adjudicated round-2).
Version events remain 1 (0.1.0 draft -> 1.0.0 seal). This note adds 1
post-sealing conformity entry to the research record.
