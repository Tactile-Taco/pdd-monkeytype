# Ambiguity log — typing-test-engine
## Resolved assumptions
- WPM/raw formulas and kogasa consistency mapping confirmed against reference [orchestrator, REF].
- keyConsistency drops the final spacing sample [orchestrator, REF].
- Chart arrays cap at 122 samples [orchestrator, REF].
- charStats emitted as tuple [correct, incorrect, extra, missed] (negotiation C1: provider yielded to consumer).

## v2.0.0 (MAJOR version event — brownfield roadmap D1; SEALED 2026-07-20)

Adjudicated: research/brownfield/roadmap-orchestrator-r2.md (C3 = this major);
round-3 BQ rulings per research/brownfield/round-03-author.md. The
behavior-changing amendment carried: B-ENG-005 becomes config-gated
(confidence/freedom). All other edits are additive (new invariants, schema
extensions) or clarifications recorded in-rationale. Per-mode sealed semantics
and provenance below; "annex" = orchestrator reference knowledge (engine-v2
mode semantics annex, 2026-07-20).

### Mode-matrix semantics (B-ENG-005 gates, B-ENG-008)
- stop-on-error letter: incorrect letter must be corrected before further
  input registers; later events inert. [annex — sealed]
- stop-on-error word: current word must be completed correctly before
  advancing; commit refused while errors present. [annex — sealed]
- confidence: backspace/delete inert once a character is committed to input.
  [annex — sealed]
- freedom: caret placeable anywhere via navigate events; skipped positions
  fillable; sealed-word rule inapplicable to navigated positions.
  [annex + verify details at authoring — sealed with hedge]
- strict-space: space mid-word does NOT skip to next word; sealed reading:
  the space event is inert while the word is incomplete.
  [annex + verify exact semantics at implementation — revealing test: type
  half a word, press space, confirm wordIndex unchanged and nothing accounted]
- opposite-shift: DELEGATED to the input layer per round-3 ruling BQ-ENG-03
  (input-filter preference; engine sees only admitted characters). The
  optional shift field remains on keystroke-event as evidence plumbing; the
  residual engine clause (B-ENG-008(d)) is trivially satisfiable by
  construction. Recorded as a delegated decision, NOT a sealed rule.
- blind: errors counted identically; hiding is ui-presentation scope. Engine
  invariant = accounting unchanged. [annex — sealed]
- Invalid pairing: confidenceMode=true + stopOnError!=off = engine refuses
  session start (correction impossible). CONFIRMED per round-3 ruling
  BQ-ENG-04; reference forbids the combination [verify at implementation].
  Sealed as B-ENG-008(g).

### Generation decoration (B-ENG-009)
- punctuation/numbers: decoration only, keystroke semantics unchanged;
  decorated characters are ordinary targets. [annex — sealed]
- lazy: unaccented base character accepted as correct-equivalent for
  diacritic targets. [annex + verify equivalence table scope]
- custom: user-defined time-seconds or word-count target; completion per the
  corresponding base mode. Unit discriminator: explicit test-start config
  parameter `unit: seconds|words` alongside target; the completion event
  ECHOES mode=custom, mode2=target, and unit so completion consumers never
  need start-event lookup. [annex + round-3 ruling BQ-ENG-01 — sealed]

### Other v2.0.0 items
- Min-threshold flag (B-ENG-010): minThresholdFailed on the completion event;
  field name accepted per round-3 ruling BQ-ENG-05; PB/leaderboard exclusion
  is consumer-side (test-results 1.2.0 adopts). [C6 ruling + BQ-ENG-05]
- Zen (B-ENG-007 amendment): unbounded stream, manual end (esc/enter routed
  client-side), event under mode=zen with bailedOut=true per round-3 ruling
  BQ-ENG-06; whether zen results persist is a test-results 1.2.0 consumer
  decision [verify at that authoring].
- Wordlist handshake (S-ENG-004): abstract provider; internal lists remain
  default; wordlists bundle (D3) will be added to `consumes` at its authoring
  (additive metadata minor). [adjudicated roadmap]
- Keystroke schema extensions: type=navigate with absolute wordIndex/
  charIndex target (freedom mode) — shape APPROVED per round-3 ruling
  BQ-ENG-02; optional shift field kept as evidence plumbing (BQ-ENG-03).
  Both optional/additive. [verify against reference input routing at
  implementation]

## Round-3 ruling record (all six BQs adjudicated 2026-07-20; applied pre-seal)
- BQ-ENG-01 → unit in test-start config + completion-event echo (sealed,
  B-ENG-007 + completed-event schema `unit`).
- BQ-ENG-02 → navigate shape approved as proposed (no text change).
- BQ-ENG-03 → opposite-shift DELEGATED; shift field kept as plumbing;
  B-ENG-008(d) rewritten to the trivially-satisfiable residual.
- BQ-ENG-04 → refuse-start CONFIRMED; sealed as B-ENG-008(g)
  [verify at implementation].
- BQ-ENG-05 → minThresholdFailed accepted (no text change).
- BQ-ENG-06 → zen manual-end records bailedOut=true (sealed, B-ENG-007);
  persistence = test-results 1.2.0 decision [verify].
- Engine must count: 18, confirmed under the legacy-bundle exception
  (exception ledger; new bundles stay ≤12).

## Open questions (carried from v1)
- Pace-caret and replay features (deferred; not protocol-visible).
