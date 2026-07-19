# Validator authoring — ui-presentation v1.0.0 (stage 3a)

Author: Validation Engineer. Date: 2026-07-19. Scope: complete validator suite
for the sealed `ui-presentation` bundle + O-UI-005 baseline capture + smoke run
against the v2.2 reference. Suite home: `protocols/ui-presentation/validators/`.

## 1. Suite structure

Substrate per the sealed plan: puppeteer-core + headless Chromium
(Chrome/150.0.7871.114 on this host), one browser process amortized across all
checks; scenarios run in isolated incognito contexts. All 14 `must` invariants
and 3 `should` invariants are covered; every check emits the harness result
shape `{invariant_id, layer, severity, outcome, evidence}`.

| File | Role |
|---|---|
| `validators/run.mjs` | CLI runner; target-origin agnostic (`--origin`, `--replica`); emits `harness/out/ui-presentation.json` (candidate) / `.smoke.json` (research); verdict per plan admission_rule; optional signed ledger block (`--ledger`) |
| `validators/lib/browser.mjs` | context factory: 1280x800@dsf1, seeded `Math.random` (mulberry32), pinned quote/config APIs, POST `/api/results` capture, served-engine-module rewrite for `feed()` capture (S-UI-005), value-aware MutationObserver recorder, request log + artifact hashing |
| `validators/lib/oracle.mjs` | engine-state oracle (wordIndex/inputs/completed); v1.1 sealed semantics + v1.0 legacy mode; `selfTestOracle()` cross-checks vs `implementation/src/engine/session.js` (25 seeded streams — passes) |
| `validators/lib/driver.mjs` | keystroke replay with per-keystroke trace (DOM scan, mutation drain, oracle snapshot); seeded fuzz-stream generator |
| `validators/lib/dom.mjs` | in-page word-stream/computed-style scanners |
| `validators/lib/color.mjs` | WCAG 2.x luminance/contrast, RGB→HSL, channel delta — verified against every protocol-cited reference value (#ca4754/#323437 = 2.700; #7e2a33 s = 0.500; extra~untyped Δ = 60) |
| `validators/lib/pngdiff.py` | O-UI-005 pixel diff (Pillow 12.3.0 + numpy 2.2.5; per-pixel max channel Δ ≤ 16; similar fraction ≥ 0.85) |
| `validators/lib/hostmeta.mjs` | host_image_id = sha256(chromium version + OS + font rasterization probe + viewport) |
| `validators/checks/*` | one module per validator-set id: dom-structure (S-UI-001/002/003, B-UI-006), keystroke-contract (S-UI-005), caret-tracking (B-UI-001), dom-state-fidelity (B-UI-002), dom-mutation-confinement (B-UI-003), results-fidelity (B-UI-004), computed-style-metrics (S-UI-004, O-UI-001..004, B-UI-005), screenshot-similarity (O-UI-005), request-audit (O-UI-006) |
| `validators/reference-origin/` | byte-faithful pinned replica of the live v2.2 origin (assets from pinned git commits; `provenance.json`; zero-dep static+API server `serve.mjs`) |

Fuzz (B-UI-002): seeded property loop (plan allows "fast-check or an equivalent
seeded property loop"), 50 runs default (`property_runs_default`), 200 nightly
(`UI_PBT_RUNS=200`), deterministic under `--seed`. Streams are state-aware
(chars, wrong chars, extras, backspaces, commits, retreats). Mutation sanity:
after the scripted trace the harness corrupts one letter class in-page and
requires the comparator to flag it — mutant killed (no vacuous property).

Pass-path verification (validators must not be fail-only): a conforming
`#caret` shim was injected into every scenario page via `--init-script`
(tracking the logical boundary each keystroke); the full suite then reports
**B-UI-001:pass** against the otherwise-untouched v2.2 replica — rect tracking
(2px) + 3-sample visibility both exercised positively. B-UI-002's mutation-
sanity and the oracle self-test (vs the repo engine) guard the other two
high-discrimination checks.

## 2. Smoke run vs v2.2 — wall clock

Egress to the live origin is blocked from this host (confirmed: TCP connect to
the workers.dev hostname times out; docs/09 notes the same sandbox block), so
the smoke ran against the **pinned local replica** of v2.2
(`--replica --engine-semantics v1.0`), which serves the git-pinned bytes the
Worker embeds (frontend last changed pre-deploy in beb6cff; engine v1.0
pre-CA-001; `style.css` verified byte-equal to live `GET /style.css` via an
egress-capable fetch).

- **Total wall clock: 90.7 s** (19 checks, `--runs 50`, seed 42, compare mode).
  Breakdown: scripted scenario + structural/behavioral evaluators ≈ 8 s;
  50 fuzz runs ≈ 70 s (≈ 1.4 s/run: ~42 keystrokes, per-keystroke scan+drain);
  results-fidelity + computed-style + screenshot + audit ≈ 12 s.
  A `--runs 3` quick pass takes 16.2 s. Baseline capture adds ≈ 4 s.
- 2,096 fuzz keystroke steps checked for per-letter fidelity; 46,018 mutation
  records evaluated for confinement; 52 HTTP requests audited.

## 3. Pass/fail matrix vs v2.2 (research data — expected pre-caret/pre-charter gaps)

| Invariant | Sev | v2.2 | Evidence (abridged) |
|---|---|---|---|
| S-UI-LINT (bundle-lint 1.0.0) | must | pass | `check_bundle.py`: 17 invariants, sealed-check ok |
| S-UI-ORACLE (suite hygiene) | must | pass | oracle == repo engine, 25 seeded streams |
| S-UI-001 | must | pass | 10 words, binding=data-wi, row-major OK (2px) |
| S-UI-002 | must | pass | vocabulary respected over 53+2096 snapshots |
| S-UI-003 | must | pass | exactly-one active == wordIndex, 2149 checks |
| S-UI-004 | must | **fail** | all 7 tokens missing on `:root` (v2.2 pre-dates the token charter) |
| S-UI-005 | should | pass | 53 feed() events via served-module rewrite, all schema-conformant |
| B-UI-001 | must | **fail** | no caret element (v2.2 pre-caret by design, Q1) — **expected** |
| B-UI-002 | must | pass | scripted 52 + fuzz 50 runs/2096 steps clean; mutant killed |
| B-UI-003 | must | pass | 46,018 records confined to {active_before, active_after, caret, stats} |
| B-UI-004 | must | pass | results show wpm=4296.68 acc=100 exactly (POST interception); test view hidden |
| B-UI-005 | should | **fail** | no `:root` tokens; config theme not consumed |
| B-UI-006 | should | pass | active word visible after every scripted keystroke |
| O-UI-001 | must | **fail** | tokens unresolvable; font-size clause passes (25.6px ≥ 24) |
| O-UI-002 | must | **fail** | tokens unresolvable; authored token set fails theme.schema.json (absent) |
| O-UI-003 | must | pass | pairwise Δ: untyped~correct=109, untyped~incorrect=102, untyped~extra=60, correct~incorrect=137, correct~extra=146, incorrect~extra=76 (≥32) |
| O-UI-004 | must | pass | adv('i')=adv('m')=15.36px; ui-monospace generic present |
| O-UI-005 | must | pass | fresh-test similar=1.000000; mid-test similar=0.999698 (≥0.85, Δ16, same host) |
| O-UI-006 | must | pass | 52 requests, all same-origin |

Verdict vs v2.2: **reject** (4 must failures: B-UI-001, S-UI-004, O-UI-001,
O-UI-002). All four are known, adjudicated v2.2 gaps (pre-caret Q1; token
charter is net-new build) — the validator detects exactly the delta the
candidate must close. No false positives: every v2.2-conformant behavior
(B-UI-002/003/004, O-UI-003/004/006, S-UI-001..003) passes.

Determinism measurement: `fresh-test.png` was **pixel-identical** across two
independent capture runs (sha256 395bec8d…); `mid-test-5-words.png` differs
only in the timing-dependent live-stats wpm digits → similar fraction 0.9997,
absorbed by the 0.85 band as designed.

## 4. Baseline evidence (O-UI-005)

`protocols/ui-presentation/evidence/baseline/`: `fresh-test.png`,
`mid-test-5-words.png`, `manifest.json` (per-scene SHA-256, host_image_id
`sha256:76f2dfa0…`, Chrome/150.0.7871.114, viewport 1280x800@1, capture date,
source origin + provenance note). Host-pinned: compare mode refuses cross-host
comparison. Provenance caveat recorded in the manifest: captured from the
pinned replica (egress block); recapture from the true live origin on an
egress-capable host is `--origin https://pdd-monkeytype.pdd-typing.workers.dev
--baseline-mode capture --engine-semantics v1.0` — a host change invalidates
the baseline by design (same-host rule), so recapture on the CI host that will
run candidate validation is REQUIRED before first candidate admission.

## 5. Protocol-text insufficiencies found while authoring (defects to report — NOT patched)

Classified per the remediation taxonomy; all are **protocol-gap /
under-specification** findings in the sealed `ui-presentation` v1.0.0 text.
Each lists the reading the validator implements (the smallest complete
resolution); none required protocol edits to proceed.

1. **DOM identity hooks unsealed (S-UI-001..003, B-UI-001).** The bundle seals
   the state-class vocabulary and the active class verbatim (P6) but not the
   word-element class (`.word`), container id (`#words`), index-binding
   attribute (`data-wi`), letter markup, or caret selector. A candidate with
   different hooks is undiscoverable without configuration. *Resolution:*
   discovery defaults for the reference lineage + `--set key=value` overrides;
   S-UI-001 fails closed when no data-attribute index binding exists.
   *Suggested text event:* minor — seal discovery hooks or add a mandated
   `data-*` contract.
2. **B-UI-002 completing-keystroke scoping.** "After every keystroke" vs the
   keystroke that completes the session: v2.2 never renders the final letter's
   class (its handler routes to the results view without re-render), leaving
   stale letter DOM behind the hidden test view. *Resolution:* fidelity is
   gated while the test view is rendered; the completing-step staleness is
   recorded as an observation in evidence (visible in the smoke matrix note).
   Behavior-changing if read strictly — recommend adjudication.
3. **B-UI-003 "mutated .word set" vs MutationObserver no-op records.** Chromium
   fires attribute MutationRecords for `classList.remove` of an absent class
   (v2.2 clears `.active` across ALL words per keystroke). Literal reading
   fails the reference aesthetic; "re-classed" intent is value-changing
   mutations. *Resolution:* recorder is value-aware (attributeOldValue); only
   actual changes gate.
4. **O-UI-005 determinism mechanism under-specified.** The plan pins
   "quote/config API responses" but word content in words/time modes is
   client-generated (`Math.random`); without pinning it, scenes are
   irreproducible. *Resolution:* validator pins `Math.random` (mulberry32) per
   page load in addition to the API pinning the text mandates.
5. **O-UI-002 theme-schema clause unmeasurable as written.** "each [shipped
   theme] validated against schemas/theme.schema.json first": the schema
   demands `#hex` but computed style normalizes to `rgb()`, and there is no
   theme endpoint/catalog to enumerate "shipped themes" (Q2: transient).
   *Resolution:* validator validates the AUTHORED `:root` token values (from
   stylesheets) against the schema, and evaluates bands on computed values.
6. **B-UI-004 payload capture assumes a POST.** Signed-out candidates emit no
   POST. *Resolution:* fallback reconstructs the CompletedEvent by replaying
   the captured `feed()` log (S-UI-005 mechanism) through the repo engine;
   primary path remains POST interception per the plan.
7. **Caret x-anchor and extra-letter boundary unspecified (B-UI-001).** Which
   point of the caret rect is "the position" (left/center/right edge), and
   whether "letter n-1" includes rendered extras when n exceeds target length.
   *Resolution:* any of the three anchor x-positions within 2px passes;
   rendered extras count as letters (consistent with S-UI-002).
8. **S-UI-001 text equality holds only for untyped words.** With extras, word
   text = target + typed extras ≠ target. *Resolution:* text-equality asserted
   on the fresh render; fidelity of typed states is B-UI-002's domain.
9. **"live-stats region" and `host_image_id` undefined (B-UI-003, evidence).**
   Q3 leaves the stats region delegated; evidence-requirements name
   host_image_id without defining it. *Resolution:* `#stats` default
   (overridable); host_image_id = sha256(chromium + OS + font probe + viewport).
10. **Engine-semantics skew (environment, recorded).** v2.2 serves engine
    v1.0 (pre-CA-001); the sealed engine is v1.1. Backspace-retreat scripted
    cases are semantics-dependent, so the runner takes `--engine-semantics`
    (default v1.1 for candidates; v1.0 only for v2.2 smoke). Not a bundle
    defect, but any future re-baseline against a v1.1-era origin must drop the
    flag.

Also noted: the mission brief referenced `implementation/src/shared/engine/session.js`;
the engine actually lives at `implementation/src/engine/session.js` (brief
imprecision, not a protocol issue).

## 6. Harness integration state

- `package.json`: `validate:ui` script added. **`pdd:loop` intentionally NOT
  modified** — inserting `npm run validate:ui -- --origin <candidate>` before
  `evidence:build` is the final wiring step once the candidate build lands
  (running it now would red the loop against a mid-build candidate).
- `harness/build-evidence.mjs`: consumes `harness/out/ui-presentation.json`
  when present (prefix map + should-severity tolerance + validator identity in
  evidence). Verified end-to-end: other 7 protocols admit; ui-presentation
  correctly rejects on the v2.2 smoke results. Smoke runs write
  `ui-presentation.smoke.json` so build-evidence never binds research results
  to a candidate digest.
- `--ledger` appends signed blocks to the bundle's
  `evidence/runtime-ledger.jsonl` (chain verified with
  `harness/evidence.mjs:verifyLedger`; restored pristine for the candidate era).
- `.gitignore`: `harness/out/` (was `harness/out/*.json`) to cover captures.

## 7. Residual risks

- Baseline is replica-captured; recapture from the true live origin on the
  final validation host is mandatory before candidate admission (same-host
  rule makes this fail-closed, not silent).
- v2.2's stats ticker (250 ms) keeps `perf`-timing nondeterminism in scene 2;
  measured absorbance is ~150x margin under the 0.85 threshold, but a
  heavier-weight candidate font stack could eat margin — watch first
  candidate run.
- Fuzz runtime scales linearly (≈ 1.4 s/run): nightly 200 runs ≈ 5 min.
