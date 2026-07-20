# Blocking Questions — ui-v2 implementation batch
### (user-config v1.2.0 / theme-catalog v1.0.0 / ui-presentation v2.0.0)

Classification per CA-001. Cosmetic/delegated items were decided + logged in
`ui-v2-report.md` §Delegated decisions. This file lists only CRITICAL items that
need an orchestrator ruling. **Open: 0. Closed: 1. Advisory (non-blocking): 1.**

---

## BQ-UI-IMPL-01 — CLOSED (resolved by author) — v1 validator suite cannot read the v2-sealed 9-slot theme charter

**Resolution (author, suite patch release):** the validator suite was patched
to validator-set **0.1.1** — both token readers
(`checks/computed-style-metrics.mjs` TOKENS, `lib/dom.mjs scanComputedStyles`)
now read the sealed **nine** slots; the authored-token clause validates against
the v2-sealed `theme.schema.json` and passes. Verified by the author 19/19
against this candidate, and re-verified here by the full `npm run pdd:loop`
reaching green (see ui-v2-report.md §6). Author's scoping flag: the patched
suite still covers the v1-era invariant set; the NEW v2 invariants
(B-UI-007/008/009/010/011, caretStyle/smoothCaret/live-stats display) get their
formal validators in the separate stage-3 extension — until then the candidate's
evidence for those is the 26/26 headless-Chromium smoke + 13 unit tests
(ui-v2-report.md §4/§6).

_Original question (for the record):_

**Conflict.** Two sealed artifacts are currently incompatible, and the candidate
cannot resolve the incompatibility from its side:

- `protocols/ui-presentation/schemas/theme.schema.json` (sealed, v2.0.0) requires
  **nine** token slots, adding `--sub-alt` and `--colorful-error` (S-UI-004 v2 /
  S-THM-002).
- The v1 validator suite (`protocols/ui-presentation/validators/`, validator-set
  0.1.0) hardcodes a **seven**-token reader:
  - `checks/computed-style-metrics.mjs:18` — `const TOKENS = ["--bg", ..., "--error-extra"]`
  - `lib/dom.mjs` `scanComputedStyles()` — collects only those 7 names into
    `tokens`/`rawTokens`.
- The suite's O-UI-002 clause *"the AUTHORED :root token set (css0.rawTokens)
  validates against theme.schema.json"* therefore validates a 7-key object
  against a schema that requires 9 → **always fails, for any candidate**
  (proven: `rawTokens` keys come only from the hardcoded `TOKENS` list; a
  candidate can only influence the 7 values, never the key set).

**Observed verdict.** `npm run validate:ui -- --boot-candidate`:
18/19 checks pass — including every SEALED O-UI-002 band clause (dark family,
error hue/sat in both cases the suite measures) and S-UI-004 (7/7 v1 tokens
resolve on :root; the candidate's stylesheet and computed :root carry all 9).
Only the authored-set schema clause fails:

```
O-UI-002 fail — computed styles settle outside the operational bands on the same background:
schema-conformance: the AUTHORED :root token set (css0.rawTokens) validates against
theme.schema.json — tokens must have required property '--sub-alt',
tokens must have required property '--colorful-error'
```

**Why this is not a candidate defect.** The candidate ships all nine authored
tokens in `implementation/public/style.css` (:root) and serves them computed on
:root; harness-side S-THM/O-THM-003 checks validate the same nine-slot sets
against the sealed schema with ajv and pure color math — all pass. The failing
reader is inside `protocols/`, which this stage is forbidden to modify; the
mission also states the FORMAL v2 validator extension is a later stage.

**Options for the orchestrator.**
- (a) **Validator patch release** (recommended): validator-set 0.1.0 → 0.1.1 —
  add `--sub-alt`, `--colorful-error` to `TOKENS` in
  `checks/computed-style-metrics.mjs` and to the collection list in
  `lib/dom.mjs` `scanComputedStyles()` (~3 lines). This is a defect fix riding
  the already-sealed v2.0.0 event, not the formal v2 extension (no new
  invariants, no new scenes, baseline untouched). Requires protocols/ write —
  orchestrator-owned.
- (b) Accept the ui stage red until the formal v2 validator stage, recording
  this ruling; the candidate's conformance is independently evidenced by the
  harness layers + smoke (see ui-v2-report.md).
- (c) Produce a candidate-side mechanism I missed (I verified none exists:
  rawTokens key set is closed under the suite's hardcoded list).

**Impact (pre-resolution).** `npm run pdd:loop` stopped at `validate:ui`
(exit 1). Post-resolution: full loop green (ui 19/19; evidence 9/9 admit).

---

## ADV-UI-IMPL-01 — ADVISORY (non-blocking) — smoothCaret default vs per-keystroke ±2px tracking

Sealed default `smoothCaret=true` (user-config v1.2.0) coexists with sealed
B-UI-001 (caret within ±2px of the insertion boundary *after every keystroke*,
measured by the v1 suite ~1 frame after each scripted keystroke). A positional
slide animation (reference-style smooth caret) leaves the caret mid-flight at
scan time and would fail B-UI-001 at the sealed default — so this implementation
ships smoothCaret as a non-positional fade-ease pulse (delegated cosmetics per
the ambiguity-log: "smooth-caret animation (smoothCaret key)"). If the v2
validator stage wants a true positional slide, the tracking tolerance/timing in
B-UI-001's measurement (or the sealed default) needs reconciliation at seal
level. Not blocking: recorded as a delegated decision in ui-v2-report.md §5.
