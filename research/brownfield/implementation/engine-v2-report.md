# Engine v2 implementation report — typing-test-engine v2.0.0 + user-config v1.1.0

Stage 2 of the brownfield expansion (roadmap D1 / batch 1). Sources of truth:
the sealed bundles only (`protocols/typing-test-engine/` v2.0.0,
`protocols/user-config/` v1.1.0). No `protocols/` files were modified. No
deployment performed.

## Validator loop — before vs after

| layer | before (baseline) | after |
|---|---|---|
| structural | admit (19 checks) | admit (19 checks) |
| behavioral | admit (37 checks) | admit (37 checks) |
| operational | admit (12 checks) | admit (12 checks) |
| ui-presentation | admit (19 checks, 0 should-gaps) | admit (19 checks, 0 should-gaps) |
| evidence build/verify | 8/8 protocols admit, ledgers OK (9 blocks) | 8/8 admit, ledgers OK (11 blocks) |
| candidate unit tests (`npm test`) | — | 29/29 pass (`implementation/tests/engine-v2.test.mjs`) |

Backward compatibility holds: with default config the engine reproduces
v1.1.0 exactly — enforced independently by the ui-presentation suite's oracle
self-test (25 seeded random streams, engine ≡ v1.1 oracle) and by the
`compat:*` unit tests.

## Files changed

- `implementation/src/engine/session.js` — v2.0.0 engine (mode matrix, caret,
  custom, refuse-start, min-threshold, wordlist handshake).
- `implementation/src/engine/wordlist.js` — NEW: S-ENG-004 handshake validation
  + internal default provider (`internalWordlist`).
- `implementation/src/engine/lazy.js` — NEW: B-ENG-009(c) equivalence helpers.
- `implementation/src/engine/countChars.js` — optional 4th `lazy` param
  (3-arg calls byte-identical).
- `implementation/src/engine/words.js` — `decorateWords` (identity when flags
  off); `generateWords` untouched.
- `implementation/src/server/validate.js` — 24-key `CONFIG_KEYS` +
  `CONFIG_DEFAULTS` (fontSize interim, BQ-IMPL-01).
- `implementation/public/app.js` — config→engine wiring, quickRestart routing,
  opposite-shift enforcement + shift evidence, blind/tape stubs, custom mode.
- `implementation/public/index.html` — one invisible `<option value="custom">`
  (collapsed select: zero pixel delta; screenshot-similarity stays green).
- `implementation/tests/engine-v2.test.mjs` — NEW: 29 focused tests.
- `worker/build.mjs` — register the two new engine modules (Workers portability;
  bundle regenerated + `node --check` OK; NOT deployed).
- `package.json` — `npm test` script.

## Per-invariant implementation notes (engine)

- **S-ENG-001** — completion event is an additive superset (new optional
  `unit`, `minThresholdFailed`); charStats tuple, 122-sample cap, all v1 fields
  unchanged. ajv-validated against the sealed schema for a decorated
  custom/words session.
- **S-ENG-002** — out-of-contract events (bad `t`, unknown type, malformed
  value, navigate without freedom) are inert; property test seeds 30 streams
  asserting state hashes never change on inert events.
- **S-ENG-003** — mode enum now enforced fail-closed at construction (invalid
  mode string throws; v1 accepted anything — tightening, no harness impact).
  Custom mode: `mode2` must parse as a positive integer AND `unit` must be
  seconds|words, else the session refuses to start.
- **S-ENG-004** — `wordlist.js` hand-validates the handshake (language
  minLength 1; words ≥1 non-empty strings; id ≤100; ordered boolean; extras
  tolerated, matching `additionalProperties: true`). Constructor accepts
  `wordlist:` (validated, fail-closed, throws before any keystroke; language
  adopted unless config overrides) or the legacy `words:` array (internal
  default provider output, held to the same non-empty rule). `internalWordlist`
  = the default provider; the wordlists bundle (D3) can plug in with no engine
  change.
- **B-ENG-001/002/003** — untouched (`shared/stats.js` unchanged).
- **B-ENG-004** — conservation preserved; lazy mode only reclassifies
  incorrect→correct per position (tested: `résumé` vs `resume`).
- **B-ENG-005** — uniform caret model: `caret` is the insertion index;
  non-freedom paths keep `caret == inputs[wordIndex].length`, so default
  behavior is byte-identical to v1.1.0 (retreat-iff-error, correct words
  sealed — compat tests + oracle self-test). confidenceMode: ALL
  backspace/delete events inert. freedomMode: navigate sets absolute
  (wordIndex, charIndex); sealed-word rule lifted (retreat unconditional,
  correct words editable via navigate); unvisited words materialized lazily;
  charIndex clamped to `[0, max(target.len, input.len)]`; navigate inert when
  freedom off or out of range.
- **B-ENG-006** — determinism quantified over the matrix + decoration:
  replay test with punctuation+numbers+minWpm+shift fields → identical events.
- **B-ENG-007** — completion: time & custom/seconds at timer expiry;
  words/quote/custom/words on final-word commit (lazy-aware match); zen never
  self-completes; `bail()` (client esc/enter) emits mode=zen with
  `bailedOut=true`. Custom events echo `mode=custom, mode2=target, unit`;
  non-custom events omit `unit`.
- **B-ENG-008** — mode matrix: (a) letter stop gates on the LAST committed
  char (char+space inert while incorrect; extras count as incorrect);
  (b) word stop refuses space until input equals target (lazy-aware);
  (c) strictSpace: space inert while `input.length < target.length`;
  (d) `shift` field accepted-and-ignored by the engine (admitted identically —
  tested), enforcement delegated to the input layer (see UI notes);
  (e) blindMode accounting identical (same-stream charStats/wpm/acc equal);
  (f) inert events never enter accounting (property test);
  (g) `confidenceMode && stopOnError!="off"` → constructor throws
  (refuse-start; client catches and alerts, no session starts).
- **B-ENG-009** — `decorateWords(words, rnd, {punctuation, numbers})` at
  generation; keystroke semantics untouched (decorated chars are ordinary
  targets). Deterministic (injected seeded rng), never empty (clause e),
  identity when both flags off (v1.1.0 stream unchanged). Lazy: see lazy.js.
- **B-ENG-010** — `minThresholdFailed` computed from the event's own rounded
  wpm/acc: `(minWpm>0 && wpm<minWpm) || (minAcc>0 && acc<minAcc)`; always
  emitted ("false or absent" permits false; always-emit is deterministic).
  Stats identical with thresholds on/off (tested). Consumption (PB/LB
  exclusion) left to test-results 1.2.0 — `POST /api/results` neither rejects
  nor stores the flag (unchanged), as sealed.
- **O-ENG-001/003/004** — no I/O, no timers, zero runtime deps preserved
  (hand-rolled handshake validation instead of ajv inside the engine);
  operational validator green. Engine modules remain isomorphic (no `node:`
  imports); Workers bundle regenerated successfully.

## Per-invariant notes (user-config v1.1.0)

- **S-CFG-001/002/003** — closed 24-key set validated per the sealed value
  domains (enums, ranges, maxLength); unknown keys / empty body → 422 with
  ErrorEnvelope (unchanged mechanics).
- **B-CFG-001** — GET = defaults-merge over stored config; all 24 keys at
  sealed defaults (fontSize: 0 = unset since v1.1.1 closed BQ-IMPL-01).
  Verified live: 24 keys, schema-conformant; v1.0.0-stored configs need zero
  migration.
- **B-CFG-002/003** — partial merge intact; wholesale 422 on any invalid value
  (verified for fontSize:0, minWpm:-1, minAcc:101, quickRestart:"space",
  fontFamily 101 chars, oppositeShift non-boolean).
- **B-CFG-004** — untouched (401 without token; harness green).
- Consumers: engine session config consumes the 6 engine keys (+existing);
  client consumes quickRestart/oppositeShift/blindMode/tapeMode now, the rest
  carried for ui-presentation v2.

## UI input layer (delegated scope)

- **Opposite-shift (BQ-ENG-03, input-filter)**: client-side only. Shift side
  tracked via `KeyboardEvent.location` (1=left/2=right); char events carry
  `shift: left|right|none` as evidence plumbing (keystroke-contract check
  stays green). With `oppositeShift=true`, chars requiring shift (uppercase
  letters + shifted symbols) are admitted only while the OPPOSITE hand's shift
  is held; violations are filtered before `feed()` with zero DOM mutation.
  Verified in headless Chromium: wrong-side `A` filtered, right-side admitted,
  unshifted admitted.
- **quickRestart**: off|tab|esc|enter routed in the keydown path; default
  `tab` reproduces v1 exactly (Tab restarts, Escape bails). Unbound Tab is
  swallowed (focus kept, inert). Zen manual end (esc/enter, B-ENG-007) takes
  precedence over a colliding quickRestart binding. Verified: with
  quickRestart=esc, Escape restarts instead of bailing.
- **Stubbed for ui-presentation v2** (owns the visuals): blind/tape = state
  classes (`.blind`/`.tape`) toggled on the stream container only, no visual
  behavior; custom-mode unit picker = `?unit=` URL param (default seconds);
  font/clamp/color keys carried but unapplied.
- Zen results: still not posted (bailedOut ⇒ ineligible) — persistence is the
  test-results 1.2.0 consumer decision per the bundle.

## [verify]-tag resolutions settled locally (cosmetic/delegated; logged not blocked)

1. **strict-space exact semantics** — implemented exactly per the sealed
   revealing test: half-word + space ⇒ wordIndex unchanged, space accounts
   nothing (state hash identical pre/post).
2. **stopOnError=word on incomplete input** — invariant formal trigger says
   "contains any error" but both the invariant gloss and the annex say
   "completed correctly"/"must be completed correctly before advancing" (twice).
   Chosen: commit requires input == target (lazy-aware), subsuming both
   phrases. Revealing test shipped (`ab` of `abc` + space ⇒ refused).
   One-line change if adjudicators prefer the narrower reading.
3. **stopOnError=letter gate granularity** — sealed text: "the last committed
   character". On append-only streams this coincides with the v1 any-error
   gate; the readings diverge only under freedom navigation (test constructs
   mid-word error + correct last char via navigate ⇒ typing continues).
4. **lazy equivalence table scope** (delegated data) — Unicode NFD + strip
   U+0300–U+036F: covers precomposed Latin (é ñ ç ü …); letters without NFD
   decomposition (ø ß æ ł đ) stay strict; directional (accented input for
   unaccented target NOT equivalent); per-code-unit like the rest of the
   engine (BMP Latin fine).
5. **decoration fractions/tables** (delegated data) — numbers: 15% of words →
   1–4 digit tokens (never punctuated afterward); punctuation: 8%
   sentence-start capitalization, 10% terminal mark from `[. , . ! ? ; :]`
   (period-weighted); english conventions (only internal list shipped).
6. **freedom remaining details** — text-field semantics: char inserts at
   caret, backspace deletes before caret; caret lands at end-of-input after
   commit/retreat; navigate clamp as above. Insert (not overwrite) matches the
   reference's hidden-input model.
7. **opposite-shift hand map** (delegated input-filter data) — US-QWERTY
   touch-typing split; both shifts held ⇒ admitted, evidence = most recent
   side; chars outside the map ⇒ admitted (preference, not a hard gate).
8. **BQ-ENG-04 [verify at implementation]** — refuse-start implemented as a
   constructor throw (fail-closed; no session object, no keystrokes).
9. **minThresholdFailed presence** — always emitted (schema-optional; "false
   or absent" permits false; always-emit keeps B-ENG-006 replay trivially
   deterministic for consumers).
10. **custom/words stream length** — completion is base-mode-equivalent
    (final presented word), so generation must present exactly `target` words;
    the client/internal provider does (`count = mode2`).

## Blocking questions

**BQ-IMPL-01 — CLOSED (adjudicated 2026-07-21).** user-config v1.1.1 SEALED
(PATCH): fontSize schema relaxed to `minimum: 0`; 0 = unset/client default —
candidate resolution (a). The interim GET-omits reading was replaced: GET now
presents all 24 keys with `fontSize: 0` when unset (B-CFG-001 conformant), PUT
accepts ≥ 0 (`fontSize: 0` → 200, `-1` → 422 wholesale). Verified live and via
full pdd:loop under v1.1.1: all layers admit (structural 19, behavioral 37,
operational 12, ui 19 with 0 should-gaps, evidence 8/8, 12 blocks); unit tests
29/29; worker bundle regenerated + `node --check` OK (not deployed). See
`research/brownfield/implementation/blocking-questions-engine-v2.md`.

## Verification commands run

- `npm run pdd:loop` (before: all admit; after: all admit — table above).
- `npm test` → 29/29 (engine v2 semantics, incl. sealed revealing tests).
- Live config probe via `harness/boot.mjs` (23-key GET, merges, wholesale 422s).
- ajv checks: custom/words completion event, navigate/shift keystroke shapes,
  internal wordlist — all conform; bogus shift / extra keystroke props rejected.
- Headless-Chromium smoke (validator browser lib): opposite-shift filter,
  quickRestart=esc routing, zero console errors.
- `node worker/build.mjs && node --check worker/bundle.mjs` (portability; not
  deployed).

## Residual risk

- ~~BQ-IMPL-01~~ closed via user-config v1.1.1 (fontSize `minimum: 0`); the
  one-line defaults fix is applied and validated.
- stopOnError=word completeness reading (#2 above) is the highest-divergence
  local call; revealing test makes a wrong choice cheap to detect.
- Freedom + stop-on-error composition is implemented per the composite
  property but the reference's exact freedom editing niceties (e.g. caret
  after commit) are delegated detail; covered by the shipped tests.
- ui-presentation v2 will own the visual side of the stubbed hooks; the class
  hooks are contractual guesses, trivially adjustable.
