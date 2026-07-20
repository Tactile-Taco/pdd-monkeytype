# Blocking questions — typing-test-engine v2.0.0 / user-config v1.1.0 implementation

Stage-2 implementation research. Classification per docs/10-critical-ambiguity-CA-001.md:
critical (behavior-changing) ambiguities are recorded here and work continues on
everything else with a documented interim reading. Cosmetic/delegated items are
settled locally and logged in engine-v2-report.md (they are NOT repeated here).

## Status: ALL CLOSED

- **BQ-IMPL-01 — CLOSED 2026-07-21 (adjudicated).** user-config v1.1.1 SEALED
  (PATCH event): fontSize schema relaxed `exclusiveMinimum: 0` → `minimum: 0`
  in both config schemas; 0 = unset/client default. This is candidate
  resolution (a) from the options below. Implementation conformed: GET presents
  all 24 keys with `fontSize: 0` when unset; PUT accepts ≥ 0 (0 accepted, -1 →
  422 wholesale). Verified live (24-key GET) + full pdd:loop green under
  v1.1.1 (all layers admit; evidence 12 blocks). Original question retained
  below for the record.

## BQ-IMPL-01 — fontSize: sealed default (0) is not representable under the sealed schema (CRITICAL)

**Bundles in tension** (both sealed 2026-07-20, cannot both hold on the wire):

- `protocols/user-config/ambiguity-log.md` (v1.1.0 batch-1 keys):
  "fontSize: number > 0, default 0 (0 = bundle default size; presentation clamps). [assumption]"
- `protocols/user-config/schemas/config.schema.json` (+ config-update.schema.json):
  `"fontSize": { "type": "number", "exclusiveMinimum": 0 }` — a present fontSize
  MUST be > 0; 0 fails schema validation.
- `B-CFG-001`: "GET returns the effective config: every schema key present,
  unset keys at documented defaults."

A GET that emits `fontSize: 0` violates S-CFG-001 (schema conformance — the
EXISTING harness structural check validates GET /api/config against
config.schema.json with ajv, so the loop goes red). A GET that omits fontSize
violates the B-CFG-001 "every schema key present" reading. No numeric value
satisfies all three sealed statements simultaneously.

**Interim reading implemented (loop-green, fail-closed):**

- GET /api/config omits `fontSize` when unset; all other 23 keys are present at
  sealed defaults. (Verified: GET returns 23 keys, all schema-conformant.)
- PUT validates the sealed domain strictly: `fontSize` must be a number > 0
  (`fontSize: 0` → 422 wholesale reject, B-CFG-003 intact). Once set, GET
  echoes it.
- Client (ui-presentation v2 scope) treats absent fontSize as "bundle default
  size" — the semantic the ambiguity log assigns to 0.

**Revealing test for adjudication (both directions):**

1. Emit `fontSize: 0` in the GET defaults → `harness/validate-structural.mjs`
   S-CFG-001 check fails (ajv exclusiveMinimum). → current choice avoids this.
2. A future B-CFG-001 contract test asserting "all 24 schema keys present at
   documented defaults" will fail on the omitted fontSize. → this is the
   accepted interim deviation.

**Candidate resolutions for the protocol author (pick one):**

- (a) Relax schema: `exclusiveMinimum: 0` → `minimum: 0` in both config schemas
  (0 becomes the wire-representable sentinel; matches the ambiguity log). Most
  likely intent given the C1-amendment pattern (fontFamily "" sentinel IS
  schema-valid).
- (b) Change the documented default to a positive number (real default size).
- (c) Amend B-CFG-001 to permit omitting keys whose sentinel default is not
  schema-representable (ratifies the interim behavior).

**Blast radius if misread:** user-config GET wire shape (24th key); no engine
behavior depends on fontSize. Consumer impact confined to ui-presentation v2
(which clamps anyway).

## Non-blocking items (settled locally — see engine-v2-report.md §[verify] resolutions)

- stopOnError=word commit rule for incomplete-but-error-free input (reading:
  "completed correctly" = input must equal target; phrase appears in both the
  invariant and the annex; revealing test shipped).
- stopOnError=letter gate = last committed character (sealed text explicit;
  equivalent to any-error gate on append-only streams; diverges only under
  freedom navigation — tested).
- Lazy equivalence table scope (NFD + strip U+0300–U+036F; delegated data).
- Decoration fractions/tables (delegated data).
- Opposite-shift hand map (delegated input-filter data, US-QWERTY).
- Zen result persistence (explicitly deferred by the bundle to test-results
  1.2.0 authoring — consumer decision, not engine scope).
