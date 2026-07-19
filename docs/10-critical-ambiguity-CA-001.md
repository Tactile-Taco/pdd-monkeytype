# CA-001 — Critical ambiguity: "current word" in B-ENG-005

**Classification (per pdd-remediation-orchestrator): protocol-gap.** The v1.0.0
invariant text was under-specified; two readings produce materially different
observable behavior. This is the first recorded instance of a *critical
ambiguity* — the class now built into the pdd-protocol-author skill.

## The ambiguity

v1.0.0 B-ENG-005: *"Backspace never moves before the start of the current word
and never alters committed words."*

- **Reading A (literal current word):** the cursor may never retreat past the
  word it currently touches. (The v1.0.0 implementation chose this.)
- **Reading B (earliest reachable erroneous word):** the cursor may retreat
  into a committed word that contains errors, because "the word the cursor is
  currently touching" ends at the most recent *fully correct* word — earlier
  erroneous words are still being edited. (The user's proposed reconciliation.)

Both are defensible readings of the same English sentence. The observable
behavior differs materially, so the ambiguity is **critical**, not cosmetic.

## Ground truth (reference)

`frontend/src/ts/input/handlers/before-delete.ts` in the reference gates the
delete event: with an empty current input, if the previous committed word's
input equals its target-with-commit (`getInputForWord(i-1) === previousWord?.textWithCommit`),
the event is *prevented* — a fully correct word is sealed. Otherwise the
handler proceeds and `goToPreviousWord` retreats the caret into the erroneous
word. So the reference is: **retreat into the previous word iff it contains an
error; fully correct committed words are sealed.**

## Resolution

Reading A was wrong as a description of the reference behavior; Reading B is a
clever way to keep the old text true, but it silently redefines "current word"
for the whole protocol (caret position, stat accounting, commit semantics all
use the same term). Rather than patching semantics by redefinition, the
negotiated resolution amends the invariant to say what the reference does,
keeping "current word" unambiguous everywhere:

> B-ENG-005 (v1.1.0): Backspace deletes one character within the current word's
> input. With an empty current input, backspace retreats into the immediately
> previous committed word if and only if that word's committed input differs
> from its target (it contains an error); a fully correct committed word is
> sealed and cannot be re-entered. Backspace never alters a sealed word.

## Remediation record (typing-test-engine v1.0.0 → v1.1.0)

1. Repair context: violated intent B-ENG-005, layer behavioral, classification
   **protocol-gap**, evidence = reference `before-delete.ts` gate.
2. Version event + renewed negotiation note (no cross-protocol impact: the
   change is internal to the engine; the completion-event handshake is
   unchanged).
3. Implementation updated (retreat rule), three new property tests:
   retreat-iff-error, seal-iff-correct, never-before-first-word.
4. Full Validator Loop re-run: 19/37/12 all pass → re-admitted with fresh
   evidence (typing-test-engine v1.1.0).

## The skill mechanism this produced

The fork's `pdd-protocol-author` now classifies every resolved ambiguity by
blast radius:

- **Cosmetic**: all readings yield the same observable behavior. Safe to assume
  and log.
- **Critical (behavior-changing)**: readings produce materially different
  observable behavior. Rules: (1) if a reference or human can adjudicate, ask —
  never silently assume; (2) if forced to proceed, record with
  `criticality: behavior-changing`, the competing readings, the chosen reading,
  and the test that would reveal a wrong choice; (3) a wrong critical reading
  discovered after sealing is a **protocol-gap remediation** — version event,
  never a silent text edit.

CA-001 is the reference example: the text was asked about and answered
incorrectly by assumption in v1.0.0; post-admission evidence (user report)
triggered the remediation loop and closed it in one cycle.
