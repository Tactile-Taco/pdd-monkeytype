# Engine v2 validation report — typing-test-engine v2.0.0 + user-config v1.1.1

Stage 3 of the brownfield expansion (roadmap D1 / batch 1): the Validator Loop
extension for the sealed v2 semantics. Sources of truth: the sealed bundles only
(`protocols/typing-test-engine/` v2.0.0, `protocols/user-config/` v1.1.1) and
the harness conventions (`harness/validate-*.mjs`). **No `protocols/` files were
modified. No deployment performed.** Prior stage:
`research/brownfield/implementation/engine-v2-report.md` (implementation green,
29/29 unit tests — 29 examples promoted/ported into the loop here).

## What changed (3 harness files + this report)

- `harness/validate-structural.mjs` — +18 checks (19 → 37). Engine v2 contract +
  schema-conformance blocks: S-ENG-003 custom/mode fail-closed starts,
  B-ENG-008(g) refuse-start contract, S-ENG-004 wordlist handshake (ajv provider
  conformance, fail-closed injection, language adoption), S-ENG-002
  keystroke-event conformance incl. navigate/shift optionals (both ajv
  directions + navigate contract behavior), S-ENG-001 v2 completion events
  (custom/seconds, custom/words, zen, decorated+threshold) against the v2
  schema, B-ENG-007 completion-echo contracts, B-ENG-010 flag contract.
  user-config v1.1.1: S-CFG-001 exact 24-key GET + fontSize:0 domain, B-CFG-001
  sealed-defaults oracle, B-CFG-004 unauthenticated 401 (pre-existing coverage
  gap closed).
- `harness/validate-behavioral.mjs` — +33 property checks (37 → 70), all
  fast-check, engine in-process (isomorphic), RUNS=200 default. Mode-matrix
  properties per B-ENG-008 clause, B-ENG-005 v2 gates, B-ENG-009 decoration +
  lazy equivalence over U+0300–036F, B-ENG-006 replay over matrix+decoration,
  B-ENG-007 custom/zen completion, B-ENG-010 truth table, config 24-key
  round-trip + merge + wholesale-422 suites.
- `harness/validate-operational.mjs` — +1 check (12 → 13): O-ENG-002 keystroke
  budget measured on the v2 keystroke path (pre-existing v1 coverage gap
  closed; the v2 handler was rewritten, so the budget had to be re-evidenced).
- `harness/boot.mjs` — `SEALED_CONFIG_DEFAULTS`: harness-side oracle of the 24
  sealed defaults transcribed from `protocols/user-config/ambiguity-log.md`
  (deliberately independent of the candidate's `CONFIG_DEFAULTS`).

## Per-invariant pass matrix (v2-relevant; all pass, zero mutation-suspect)

| invariant | layer | checks | what is validated |
|---|---|---|---|
| S-ENG-001 (amended) | structural | 3 | v1 synthetic event + 4 v2 events (custom×2, zen, decorated+min-threshold) ajv-conform; `unit` only on custom; charStats tuple/122-cap unchanged |
| S-ENG-002 (amended) | structural | 4 | 8/8 contract keystroke events conform (incl. navigate + shift L/R/none); 7/7 out-of-contract shapes schema-rejected; navigate applied under freedomMode, inert without; junk feeds ignored |
| S-ENG-003 (amended) | structural | 2 | 6/6 invalid starts refused (mode2 0/−3/1.5, missing/bad unit, bad mode); valid custom start accepted; mode enum in completion event |
| S-ENG-004 (new) | structural | 3 | internal provider conforms to wordlist.schema.json (plain + decorated); 8/8 non-conforming lists fail-closed (ajv rejects AND constructor throws before first keystroke); conforming injection starts, language adopted |
| B-ENG-005 (amended) | behavioral | 11 | v1 default seal/retreat props (3, unchanged); confidence inert-backspace ×2; freedom navigate absolute+clamp, seal lifted, skipped fillable, out-of-range/no-freedom inert ×4; **oracle v1.1 ≡ v2 engine default-config over 200 seeded streams** (ui engine-semantics registration, below) |
| B-ENG-006 (amended) | behavioral | 2 | v1 replay + replay over random legal mode-matrix configs with decoration (illegal confidence×stop-on-error combos filtered per clause g) |
| B-ENG-007 (amended) | behavioral + structural | 7 | custom/seconds completes exactly at timer expiry (property, echo mode/mode2/unit); custom/words on final commit only (property); zen never self-completes over random streams, bail → event mode=zen bailedOut=true; 3 structural echo contracts, each ajv-validated |
| B-ENG-008 (new) | behavioral + structural | 9 | (a) letter gate: inert while last committed char incorrect, space gated, correction resumes; (b) word gate: commit iff input==target (51%/49% branch balance); (c) strictSpace inert mid-word, commits at full length; (d) ±shift identical state+accounting; (e) blind on/off identical charStats/wpm/acc; (f) inert events leave no trace (state hash incl. events/keyTimes/accounting); (g) refuse-start property + structural contract |
| B-ENG-009 (new) | behavioral | 7 | (d) same seed→same targets, flags-off identity, (e) non-empty; (a)+(b) decoration presence (statistical, 400 words); decorated chars ordinary targets (exact typing → full-correct charStats); (c) lazy over U+0300–036F (base accepted, directional, strict when off); precomposed-Latin table + ø/ß/æ/ł/đ strict; session completes on lazy match (63% non-vacuous NFC-composite runs); accounting conservation under lazy |
| B-ENG-010 (new) | behavioral + structural | 2 | truth table `flag <=> (minWpm>0 && wpm<minWpm) || (minAcc>0 && acc<minAcc)` over random thresholds (16% flag-true runs), stats identical with thresholds on/off; contract: set under failing thresholds, clear at 0=disabled |
| O-ENG-002 (v1 gap) | operational | 1 | keystroke feed p95 = 0.0015ms over 5000 feeds with v2 gates on (budget ≤5ms) |
| S-CFG-001 (amended) | structural | 4 | GET schema-conform; unknown key 422+ErrorEnvelope; GET presents exactly the 24 sealed keys; fontSize:0 → 200, fontSize:−1 → 422 wholesale |
| S-CFG-002 | structural | 1 | empty update 422 (unchanged) |
| B-CFG-001 (amended) | structural + behavioral | 2 | fresh GET == all 24 documented sealed defaults incl. fontSize:0 (harness-side oracle table) |
| B-CFG-002 | behavioral | 3 | existing merge prop; exhaustive 24-key sequential round-trip (24 PUTs, each key set + all prior retained); random partial-update == merge-over-defaults (15 HTTP runs) |
| B-CFG-003 | behavioral | 3 | existing unknown-key prop; wholesale-422 sweep: 53 invalid requests across ALL 24 keys + unknown, each bundled with a valid key that must also be dropped; random (key, invalid-value) prop (12 HTTP runs) |
| B-CFG-004 (v1 gap) | structural | 1 | unauthenticated GET/PUT → 401 ErrorEnvelope (first running validator for this invariant) |
| S-UI-ORACLE | ui-presentation | 1 | oracle == repo engine over 25 seeded streams — still green against the v2 engine (default config) |

Full-suite totals: **structural 37, behavioral 70, operational 13,
ui-presentation 19 — all admit; 72 distinct invariant IDs, zero non-pass.**
Candidate unit tests unchanged: 29/29 (`npm test`).

## Wall-clock vs the +45–60s estimate

| layer | baseline (pre-extension) | after | delta |
|---|---|---|---|
| validate:structural | 6.9s (19 checks) | 7.5s (37) | +0.6s |
| validate:behavioral | 9.0s (37 checks) | 12.8s (70) | +3.8s |
| validate:operational | 4.0s (12 checks) | 2.3–6.0s (13) | ≈0 (noise) |
| validate:ui --boot-candidate | 107.5s (19 checks) | 108.3s (19) | +0.8s |
| evidence:build + verify | 3.9s | 4.3s | +0.4s |
| **pdd:loop end-to-end** | **≈131s** | **133.8s** | **≈ +3s (±4s run noise)** |

Net delta ≈ **+3s (≤ +8s worst case across measurements) vs the +45–60s
estimate** — ~7% of the estimate. Reason: the engine is isomorphic and every v2
check runs in-process (fast-check over `TypingSession` directly); only ~90
cheap localhost HTTP calls were added for config, and no new browser scenarios
were needed (the ui bundle demands no v2 mapping — below).

## UI oracle: engine-semantics v2 registration decision

Checked `protocols/ui-presentation/validators/{validation-plan,validator-set}.yaml`,
`README.md`, and `lib/oracle.mjs`: the bundle pins **oracle semantics**, not an
engine version — `--engine-semantics v1.1` (sealed) and `v1.0` (legacy replica
only). No bundle mapping demands a `v2` oracle mode, and `protocols/` is
sealed/off-limits, so no v2 mode was added to the suite. Registration is
satisfied two ways without touching the bundle:

1. `S-UI-ORACLE` (the suite's own self-test) cross-checks the v1.1 oracle
   against `implementation/src/engine/session.js` — now the v2 engine — over 25
   seeded streams and **passes**: v2 default config is observably v1.1-exact.
2. A harness-side property (tagged B-ENG-005, 200 runs, randomized word lists +
   streams) asserts the same equivalence (wordIndex, inputs, completed) — so
   the registration rides the main loop, not only the ui suite.

Existing ui checks stay green because the candidate UI runs on default config
(v1-compatible). If ui-presentation v2 authors new mappings (blind/tape/
opposite-shift visuals), that bundle's authors will add the oracle mode then.

## Could NOT be validated cheaply (reported, not patched)

1. **B-ENG-008(d) opposite-shift enforcement** — delegated to the input layer
   (BQ-ENG-03). The engine residual clause is validated (char admitted
   identically ±shift). The enforcement itself is client-side
   (`implementation/public/app.js`); it has no standing validator (implementer
   smoke-verified it in headless Chromium). Owner: ui-presentation v2 mappings.
2. **B-ENG-009(a) "per language convention"** — only the internal english
   provider exists; decoration tables/fractions (15% numbers, 8% caps, 10%
   terminal) are delegated data. Validated: determinism, presence,
   non-emptiness, ordinary-target accounting. There is no sealed fraction to
   assert against.
3. **B-ENG-005 freedom "remaining details"** — sealed with a `[verify]` hedge;
   the sealed clauses (absolute navigate, skipped fillable, seal lifted) are
   property-validated. Post-commit caret niceties are delegated detail
   (implementer note #6).
4. **S-ENG-004 external provider plugging** — a real second provider cannot be
   exercised until the wordlists bundle (roadmap D3) exists. Validated:
   fail-closed handshake, internal-provider ajv conformance, injection start.
5. **B-ENG-007 zen persistence** — explicitly deferred to test-results 1.2.0
   (consumer decision per sealed rationale). The engine side (event with
   bailedOut=true) is validated; persistence is out of scope here.

## Protocol-defect / observation notes (no `protocols/` changes made)

1. **B-ENG-008(b) wording tension (pre-existing, flagged by implementer #2).**
   Formal trigger: commit "refused while the input contains any error"; gloss
   (twice): "caret stays until completed correctly". These diverge on
   error-free incomplete input (`ab` of `abc`). The candidate and the new
   property both validate the subsuming reading (commit iff input == target,
   lazy-aware). Revealing property shipped, so an adjudicated flip to the
   narrow reading is a one-line change (space gate in `session.js`) + one
   property. Not blocking; recorded for the adjudicators.
2. **user-config `language: ""` (pre-existing v1 candidate strictness).**
   `config-update.schema.json` permits the empty string (`type: string`, no
   minLength) but the candidate's hand-rolled validator requires non-empty →
   PUT `{language: ""}` is 422 although schema-conforming. GET never emits ""
   (default "english"). Validators deliberately use non-string invalid
   exemplars for `language`. Recommend a v1.2.0 clarification (either
   `minLength: 1` in the update schema or accept-and-store); NOT patched here.
3. **keystroke-event schema** permits `navigate` without wordIndex/charIndex
   (no conditional requirement); the engine treats it as inert. Consistent
   with S-ENG-002 (inert ≠ corrupt); validated as such — no defect.
4. **B-ENG-010 "false or absent"** — the candidate always emits the field
   (permitted reading; keeps replay deterministic for consumers). Validated.

## Verification commands run

- `npm run pdd:loop` (baseline: all admit; after extension: all admit —
  final run rc=0, 133.8s, ledgers OK at 16 blocks/protocol, ui 9).
- Per-layer standalone runs for timing (`/tmp/v2-*.log`).
- `npm test` → 29/29 (candidate's own checks, untouched).
- Branch-balance instrumentation (fast-check, 500 runs): B-ENG-008(b) commits
  251/refused 249; B-ENG-010 flag-true 80/500; B-ENG-009 lazy NFC-composite
  313/500 — properties are non-vacuous on both branches.
- `npm run evidence:build && npm run evidence:verify` → **8/8 protocols admit
  (bundle count unchanged)**; typing-test-engine evidence now binds 64 checks
  (was 21), user-config 15 (was 6).

## Residual risk

- The B-ENG-008(b) reading (note 1) is the highest-divergence validated
  interpretation; cheap to flip if adjudicated otherwise.
- Property runs are the plan default (200); the nightly 5000-run tier has not
  been exercised on the new properties in this stage (same generators, so risk
  is low; recommend one `PBT_RUNS=5000 npm run validate:behavioral` soak before
  the next seal).
- The O-ENG-002 measurement is single-host (dev container); the 5ms budget has
  ~3000× headroom, so host variance is immaterial.
