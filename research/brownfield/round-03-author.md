# Brownfield — Round 3: BQ adjudication applied + SEAL record

**Outcome: user-config v1.1.0 SEALED and typing-test-engine v2.0.0 SEALED**
(`protocol.status: sealed` in both). `harness/check_bundle.py` → PASS on both
(user-config: 9 invariants; typing-test-engine: 18 invariants; every `must`
validator-mapped; handshake refs resolve). All six blocking questions
adjudicated by the orchestrator in one round; all rulings applied pre-seal.
No sealed text changed silently — every ruling is recorded in-rationale and in
the bundles' ambiguity logs with ruling provenance.

## 1. Rulings applied

| BQ | Ruling | Applied at |
|---|---|---|
| BQ-ENG-01 custom-unit discriminator | Unit lives in test-start config (`unit: seconds\|words` alongside target); completion event ECHOES mode=custom, mode2=target, unit (deliberate consumer decoupling) | B-ENG-007 statement+rationale; completed-event.schema.json `unit` enum field |
| BQ-ENG-02 navigate shape | Approved as proposed (absolute wordIndex/charIndex) | keystroke-event.schema.json (already drafted so); B-ENG-005 statement tag updated |
| BQ-ENG-03 opposite-shift | DELEGATED to input layer; optional `shift` field kept as evidence plumbing; residual engine clause trivially satisfiable | B-ENG-008(d) rewritten; ambiguity log records delegated decision, not a sealed rule |
| BQ-ENG-04 confidence × stop-on-error | Refuse-start CONFIRMED (logically contradictory; reference forbids [verify at implementation]) | Promoted from rationale to sealed clause B-ENG-008(g) |
| BQ-ENG-05 flag naming | `minThresholdFailed` accepted; test-results 1.2.0 consumes for PB/LB exclusion | B-ENG-010 rationale finalized |
| BQ-ENG-06 zen bailedOut | Manual end records `bailedOut: true`; zen persistence = test-results 1.2.0 consumer decision [verify] | B-ENG-007 statement finalized (hedge removed) |
| Must count | 18 engine musts CONFIRMED under legacy-bundle exception | Exception ledger; new bundles stay ≤12 |

## 2. Final sealed ledgers

### user-config v1.1.0 (additive MINOR, brownfield batch 1) — 9 musts, 0 new
Mechanisms unchanged (schema-conformance, contract-tests, property-check,
egress-monitor, resource-budget, dependency-scan). Zero data migration
(defaults-merge). Carried amendments: S-CFG-001/B-CFG-001 rationales only.

**Schema (24 keys; 14 added):** engine-v2 consumers — confidenceMode,
freedomMode, strictSpace, oppositeShift (bool, false), minWpm (≥0, 0=off),
minAcc (0..100, 0=off) [C6]; ui-presentation-v2 consumers — fontFamily
(≤100, ""=default monospace per C1), fontSize (>0), tapeMode, quickRestart
(enum off|tab|esc|enter, default tab [verify at ui-presentation authoring]),
flipTestColors, colorfulError, customThemeId (""=none), randomTheme.

**Substitutability note (recorded in S-CFG-001 rationale):** v1.0.0 candidates
fail-closed on v1.1.0 keys → re-admission per minor; deployed line upgrades
atomically per pdd:loop.

### typing-test-engine v2.0.0 (MAJOR, roadmap D1) — 18 musts (14 legacy + 4 new)
**Amended:** B-ENG-005 (config-gated backspace: confidence → inert; freedom →
navigate-governed, sealed-word rule lifted for navigated positions) ·
B-ENG-006 (determinism quantified over mode matrix + decoration) · B-ENG-007
(custom completion + unit echo + zen manual-end bailedOut=true) · S-ENG-003
("custom marker" → custom target, clarification).
**New:** S-ENG-004 wordlist handshake conformance (abstract provider; internal
lists default; D3 plugs in without re-versioning) · B-ENG-008 input-rule mode
matrix composite: (a) stop-on-error letter, (b) stop-on-error word,
(c) strict-space inert-space [verify semantics at implementation],
(d) opposite-shift delegated/trivial residual, (e) blind = accounting
unchanged, (f) inert-event safety, (g) refuse-start on confidence×stop-on-error
· B-ENG-009 generation decoration composite: punctuation/numbers as ordinary
targets, lazy diacritic equivalence [verify table scope], determinism,
non-empty targets · B-ENG-010 minThresholdFailed flag production (C6).
**Schemas:** wordlist.schema.json NEW (language + words[1..] + optional id/
ordered, additionalProperties true); keystroke-event +navigate type,
wordIndex/charIndex, optional shift; completed-event +minThresholdFailed, +unit.
**Untouched:** capability-manifest (zero-dep posture holds), validator-set,
validation-plan (same mechanisms; mode-matrix fuzz rides property-check),
evidence-requirements, O-ENG-001..004.

## 3. Version-event record (program cumulative)

| # | Bundle | Event | Driver |
|---|---|---|---|
| 1 | user-config | 1.0.0 → 1.1.0 minor (additive) | brownfield batch 1 |
| 2 | typing-test-engine | 1.1.0 → 2.0.0 major (B-ENG-005 config-gated) | roadmap D1, C3 |
| 3 | user-config | 1.1.0 → 1.1.1 patch (pure domain relaxation) | BQ-IMPL-01: fontSize default 0 unrepresentable under exclusiveMinimum; schema relaxed to minimum:0, 0 = unset → client default. Author drafting defect (PSN-UI-01 class: unverified admission claim), orchestrator-ruled, re-sealed same day, check_bundle PASS |

Blocking questions this round: 6, all adjudicated in one round. Critical
ambiguities found during drafting: 0 new (all mode semantics arrived with
annex provenance; hedges logged with [verify at implementation] tags, none
behavior-changing at protocol level). Delegated decisions recorded: 1 new
(opposite-shift enforcement). Cosmetic resolutions: logged per bundle.

## 4. Hand-off notes for implementation dispatch (separate)

- user-config v1.1.0: pure schema/default expansion; implementer adds 14 keys
  with documented defaults to the closed schema; contract tests extend
  mechanically. Est. validator delta: trivial (+~5s).
- typing-test-engine v2.0.0: net-new work = mode-matrix gating (B-ENG-008),
  decoration (B-ENG-009), min-threshold flag (B-ENG-010), navigate event
  handling, wordlist conformance check, unit echo. Amended B-ENG-005 gate.
  Est. validator delta: moderate (+~45–60s mode-matrix fuzz, reusing the
  existing fast-check property harness; no browser, no new mechanisms).
- Implementation-time verify tags (non-blocking, CA-discipline: cosmetic
  unless evidence shows behavior-changing): strict-space exact semantics,
  lazy equivalence table scope, freedom residual details, confidence×
  stop-on-error reference pairing, reference input routing for navigate/shift.
- Consumer follow-ups already queued in the roadmap: test-results 1.2.0 adopts
  minThresholdFailed (PB/LB exclusion) and decides zen persistence;
  ui-presentation v2.0.0 consumes fontFamily/tapeMode/quickRestart/
  flipTestColors/colorfulError/customThemeId/randomTheme; wordlists bundle
  (D3) becomes a `consumes` entry via additive metadata minor at its authoring.
