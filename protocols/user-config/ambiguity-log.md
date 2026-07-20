# Ambiguity log — user-config
## Resolved assumptions
- Closed key set (10 keys) sufficient for v1; reference has a much larger set. [orchestrator]
- Defaults (v1.0.0): mode=time, mode2=30, language=english, punctuation=false, numbers=false, difficulty=normal, blindMode=false, stopOnError=off, theme=serika_dark, lazyMode=false. [assumption]

## v1.1.0 (additive MINOR event — brownfield roadmap batch 1; SEALED 2026-07-20)

Strategy (adjudicated, roadmap-orchestrator-r2): additive flat keys only; never
a nested-schema v2.0.0. Zero data migration via defaults-merge. Old candidates
fail-closed on new keys (S-CFG-001) → re-admitted per minor; deployed line
upgrades atomically. No new validator mechanisms (schema-conformance +
contract-tests cover the expansion); must count unchanged at 9.

### Batch-1 keys (14 new; consumers in parentheses)

Engine v2.0.0 consumers:
- confidenceMode: boolean, default false. [annex: orchestrator reference knowledge]
- freedomMode: boolean, default false. [annex; details verify at engine authoring]
- strictSpace: boolean, default false. [annex; verify exact semantics]
- oppositeShift: boolean, default false. [annex; verify — may be delegated as input-filter]
- minWpm: number ≥ 0, default 0 (0 = disabled). [C6 ruling: failed-flag is
  config-domain, distinct from anticheat envelope; verify at engine authoring]
- minAcc: number 0..100, default 0 (0 = disabled). [C6; verify]

ui-presentation v2.0.0 consumers:
- fontFamily: string ≤100 chars, default "" (empty = bundle default monospace
  stack; the C1 amendment makes the default monospace but configurable). [C1 confirmed]
- fontSize: number ≥ 0, default 0 (0 = unset → client default size;
  presentation clamps). [assumption; domain corrected v1.1.1 — see below]

## v1.1.1 (PATCH event 2026-07-20 — BQ-IMPL-01)
- Defect: v1.1.0 sealed `fontSize` with `exclusiveMinimum: 0` while its
  documented default was 0 — internally contradictory draft text (author
  error; same defect class as PSN-UI-01, an unverified admission claim,
  caught here by the implementer's schema validation instead of numeric
  recheck). Tension: GET emitting 0 violated S-CFG-001; GET omitting the key
  violated B-CFG-001.
- Ruling (orchestrator): the schema is wrong, not the default. Relaxation
  applied to both config.schema.json and config-update.schema.json:
  `exclusiveMinimum: 0` → `minimum: 0`; 0 documented as "unset → client
  default". Pure domain relaxation, no consumer breakage → PATCH event
  (1.1.0 → 1.1.1), issued immediately to unblock implementation rather than
  folding into the 1.2.0 batch. Interim implementer reading (GET omits
  fontSize when unset) becomes non-conformant in the other direction: GET
  must now PRESENT fontSize=0 when unset per B-CFG-001 — the one-line fix.
- Re-sealed as v1.1.1; check_bundle.py PASS. [criticality: behavior-changing
  at the wire level, resolved by orchestrator ruling, zero negotiation rounds]
- tapeMode: boolean, default false. [annex]
- quickRestart: enum off|tab|esc|enter, default tab. [annex: Tab restarts;
  enum shape + default verify at ui-presentation authoring]
- flipTestColors: boolean, default false. [feature-inventory]
- colorfulError: boolean, default false. [feature-inventory]
- customThemeId: string ≤100 chars, default "" (empty = none; refers to a
  theme-catalog custom theme). [feature-inventory; theme-catalog authoring]
- randomTheme: boolean, default false. [feature-inventory]

### Deliberately NOT in batch 1
D2 behavior/sound/caret keys, presets, import/export → v1.2.0 (batch 2).
Key naming follows the existing flat camelCase convention (grouping by
convention, not nesting — nested v2.0.0 rejected in adjudication).

## Open questions
- Presets land in v1.2.0 as additive handshakes on this bundle (adjudicated
  direction; handshake shapes at batch-2 authoring).
