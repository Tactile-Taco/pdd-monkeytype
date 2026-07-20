# Brownfield — Round 4: adjudication applied + SEAL record (D2b/D4a/D4b)

**Outcome: user-config v1.2.0 SEALED, theme-catalog v1.0.0 SEALED (NEW),
ui-presentation v2.0.0 SEALED (MAJOR).** `harness/check_bundle.py` → PASS on
all three (user-config 9 invariants; theme-catalog 9; ui-presentation 22).
Four blocking questions adjudicated by the orchestrator in one round; all
rulings applied pre-seal; nothing sealed silently — every ruling is recorded
in-rationale and in the bundles' ambiguity logs with provenance.

## 1. Rulings applied

| BQ | Ruling | Applied at |
|---|---|---|
| BQ-CFG-01 customThemeId orphan | REMOVAL confirmed in v1.2.0 (pre-consumer cleanup is when minors do this) | both config schemas (38→37 keys); S-CFG-001/B-CFG-001 rationales; ambiguity log with wire-level consequence (stored configs carrying the key reject on next PUT; acceptable — deployed line only, never consumed) |
| BQ-UI-01 19 musts | Legacy-bundle exception GRANTED (ui-presentation joins engine; new bundles stay ≤12) | exception ledger; ambiguity log |
| BQ-UI-02 / BQ-THM-01 9th slot | RATIFIED nine slots: bg, main, caret, sub, sub-alt, text, error, error-extra, colorful-error — data adjusts to protocol, never reverse | S-THM-002 statement (sealed list); S-UI-004 statement; charter schema required list (9); B-UI-010(b) source clause |
| BQ-THM-02 band exceptions | NONE — failing starter themes get minimal hex adjustments with documented deltas (PSN-UI-01 precedent: charter = persistent intent) | O-THM-003 rationale |
| O-UI-005 baseline | v2.2 retirement approved; recapture from first admitted v2.0.0-conformant candidate (deploy line v3.0) within this event window, host-pinned | already drafted so; approval recorded in ambiguity log |

## 2. Final sealed ledgers

### user-config v1.2.0 (MINOR, batch 2) — 9 musts, 0 new, mechanisms unchanged
37 keys (24 + 14 added − customThemeId). Batch 2: custom theme slots ×9
(string ≤32, ""=unset; charter-pattern conformance at application time, not
schema — "" stays representable), caretStyle (enum off|line|block|outline|
underline, default line [verify at ui impl]), smoothCaret (default true
[verify]), liveWpm/liveAcc/liveBurst (storage sealed; display effect stays
delegated per round-2 Q3). Theme selection: no new key (`theme` + randomTheme
suffice). Sound/presets/import-export → batch 3 (v1.3.0).

### theme-catalog v1.0.0 (NEW, D4a) — 9 musts (≤12 budget holds)
S-THM-001 charter conformance · S-THM-002 sealed nine-slot list (additive
growth only; rename/removal = major on both bundles) · S-THM-003 error
envelope · B-THM-001 list/get round-trip consistency · B-THM-002 unknown name
fail-closed (never substitution; fallback is consumer-side) · B-THM-003
byte-deterministic within a deploy, transient across · O-THM-001 public read,
zero writes, no outbound · O-THM-002 p95 ≤ 50ms · O-THM-003 static charter
bands at admission (pure WCAG/HSL math over hex — browser-class checks
shifted earlier at near-zero cost; no exceptions, hex-adjust with documented
delta). Consumes ui-presentation's theme charter per fork rule. Catalog
contents (starter ~10, later ~150) = delegated data task.

### ui-presentation v2.0.0 (MAJOR, D4b) — 19 musts (exception-listed), 3 shoulds
**The major's payload:** O-UI-004 amended (CA-UI-02, second CA-001-class
instance): font configurable via fontFamily, monospace DEFAULT keeps
advance-equality; configured fonts require O-UI-003 distinguishability +
caret legibility. B-UI-001/002/003 carry the interaction contract unchanged.
**Amended:** S-UI-004 (nine sealed tokens) · O-UI-002(i) dark-family gated on
flipTestColors=false · O-UI-003 gated on blindMode=false · O-UI-005 v2.2
baseline retired, recapture folded into this window · B-UI-005 should→must
(theme resolution: all-nine-valid custom slots > catalog theme > default dark
fallback). **New:** B-UI-007 blind display (incorrect/extra ≡ correct
computed colors; classes/accounting untouched) · B-UI-008 tape (anchor FIXITY
±2px sealed, location delegated) · B-UI-009 quick-restart (dispatched-effect
level) · B-UI-010 composite flip (token-role swap, WCAG-symmetric) +
colorful-error (saturation variants within hue band) · B-UI-011 should
(randomTheme atomicity). Live-stats region, font sizes/stacks (same-origin),
caret shape, smooth-caret animation, selection algorithm: delegated.

## 3a. Validator patch record (NOT a protocol version event)

**computed-style-metrics 0.1.0 → 0.1.1** (2026-07-20, BQ-UI-IMPL-01): the
v2.0.0 seal extended the required token set to nine, but the bundle's own
suite still read seven (TOKENS in computed-style-metrics.mjs; the
scanComputedStyles reader in lib/dom.mjs), so O-UI-002/S-UI-004 token
clauses failed against the sealed schema on a conformant candidate —
validator bug, not protocol defect. Patched both readers to the sealed nine
(evidence string updated); check version bumped 0.1.1 in validator-set.yaml;
no sealed text, schema, or invariant touched (bugfix riding the sealed
v2.0.0 event per orchestrator ruling). Verified: full suite against the
booted candidate (`run.mjs --boot-candidate --smoke`) → verdict "admit",
19/19 checks pass (was 18/19 with O-UI-002 red), 97.9s wall clock, results
at harness/out/ui-presentation-verify-0.1.1.json. Note: validators for the
NEW v2 invariants (B-UI-007..011) are stage-3 authoring work, separate from
this patch.

## 3. Version-event ledger (program cumulative: 6 events; 2 majors)

1. user-config 1.0.0→1.1.0 minor (batch 1) · 2. typing-test-engine 1.1.0→2.0.0
major (B-ENG-005 config-gated) · 3. user-config 1.1.0→1.1.1 patch (BQ-IMPL-01
fontSize domain) · 4. user-config 1.1.1→1.2.0 minor (batch 2 + BQ-CFG-01
removal) · 5. theme-catalog 0.1.0→1.0.0 new-bundle seal · 6. ui-presentation
1.0.0→2.0.0 major (CA-UI-02 fonts). Blocking questions this round: 4, all
adjudicated in one round. Critical ambiguities: 1 new (CA-UI-02, resolved by
C1 ruling). Exception ledger: typing-test-engine (18 musts), ui-presentation
(19); all other bundles ≤12. Delegated decisions recorded: +1 (random-theme
selection algorithm).

## 4. Hand-off notes for implementation dispatch (separate)

- user-config v1.2.0: mechanical — 14 keys + one removal on the existing
  closed-schema path; contract tests extend; trivial validator delta.
- theme-catalog v1.0.0: static asset delivery (~10 starter themes as
  implementation-supplied data), two read endpoints, error envelope;
  O-THM-003 static band checker is the one net-new validator (pure color
  math, no browser); starter themes failing bands are hex-adjusted with
  documented deltas, NO exceptions. Est. suite delta: trivial–cheap (+~10s).
- ui-presentation v2.0.0: reuses the one-Chromium-session harness;
  net-new checks = font-config paths, theme resolution precedence, blind
  color-identity, tape anchor fixity, quick-restart dispatch, flip/colorful
  computed-style asserts; O-UI-005 re-baseline from the admitted v2
  candidate (host-pinned, capture metadata per evidence/baseline/README.md).
  Est. suite delta: cheap–moderate (+~15–30s inside the existing boot).
- Implementation-time verify tags (cosmetic-class per CA discipline):
  caretStyle enum list, smoothCaret default, live* defaults, reference
  custom-slot editor behavior, extra-hiding under blind, tape anchor
  location, quick-restart routing, colorful derivation for pre-ratification
  token sets, reference 9th-slot naming (data adjusts if different).
