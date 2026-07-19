# Stage-02 blocking questions — ui-presentation v1.0.0 conformance

**Blocking questions: NONE.**

Per the strict research protocol, critical (behavior-changing, not decidable from
bundle text) ambiguities would be recorded here and left un-guessed. Every
ambiguity hit during stage 2 was decidable from the sealed bundle's normative
text (invariants + ambiguity-log resolutions) or fell inside the bundle's
explicit delegated-cosmetics space. Decisions are logged in
`stage-02-report.md` §4; the two worthiest of protocol-author attention:

1. **O-UI-001 `--error` value conflict (decided, not blocking).** The sealed
   floor is `contrast(--error, --bg) >= 3.0`; the bundle's own round-2 record
   measures the "preserved" reference value `#ca4754` at 2.70:1 — the two
   bundle artifacts conflict arithmetically. Decidable because: (a) O-UI-001 is
   the normative `must` and its adjudication states the persistent intent is
   the *principled accessibility floor*; (b) S-UI-004 explicitly delegates
   token VALUES within the O-UI-001..O-UI-003 bands. Minimal in-band adjustment
   shipped (`#cf5763`, 3.09:1, same hue/saturation). **Ratified post-hoc by the
   protocol author**: post-sealing note PSN-UI-01 (ambiguity-log.md +
   research/negotiation/round-03-postsealing-note.md) records the identical
   value, classification (cosmetic/delegated), and zero-blocking-question
   verdict — the decision needed no escalation.
2. **Zen-mode rendering (decided, not blocking).** Zen's single target word is
   1000 spaces; letters render the target char (S-UI-001 "word text equals
   target"), so typed input renders as collapsed whitespace and the stream has
   no visible glyphs. Ambiguity-log seals "zen is covered, not excepted;
   invariants apply unchanged" — letter/caret/class invariants are mechanically
   satisfied (verified). Whether zen *should* display typed glyphs is a product
   question outside the sealed text; not raised by any invariant.

No item required orchestrator adjudication to proceed; nothing was guessed on
behavior-changing forks.
