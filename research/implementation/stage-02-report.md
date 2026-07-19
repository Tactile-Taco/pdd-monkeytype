# Stage-02 report — client UI conformance to ui-presentation v1.0.0 (SEALED)

Date: 2026-07-19. Role: Implementation Generator. Source of truth: ONLY the
sealed bundle `protocols/ui-presentation/` (protocol.yaml, invariants/*,
schemas/theme.schema.json, validators/*, ambiguity-log.md). No visual
interpretation was requested or received.

## 1. Scope + files changed

Served-assets surface only (docs/09 §"identical"): `implementation/public/`
(index.html, style.css, app.js). **No server, engine, or shared-module changes**
— the engine already exposes everything the bundle references (`wordIndex`,
`inputs[]`, `completionEvent()`), so Node/Express and Workers candidates remain
co-admissible unchanged.

| File | Change |
|---|---|
| `implementation/public/style.css` | S-UI-004 token charter on `:root` (7 sealed names) + `var()` swaps at existing usage points; `#caret` styles; `position:relative` on `#words`. |
| `implementation/public/app.js` | Net-new caret element + `updateCaret()` (B-UI-001); B-UI-003 mutation-confinement repair; B-UI-002 completing-keystroke repair; B-UI-005 theme hook (should); dead variable removed. |
| `implementation/public/index.html` | **unchanged** (caret is JS-created inside `#words`). |

Verification assets (research data, not shipped UI):
`research/implementation/stage-02-ui-check.mjs` (scripted-session conformance
self-check, puppeteer-core per harness/manual-ui.mjs precedent),
`research/implementation/stage-02-screenshot-ab.mjs` (O-UI-005 A/B proxy),
`research/implementation/blocking-questions.md`.

## 2. Regression results (before → after)

Existing validator loop (`npm run pdd:loop`), same host:

| Suite | Before | After |
|---|---|---|
| structural (`harness/out/structural.json`) | 19 pass / 0 fail | 19 pass / 0 fail |
| behavioral (`harness/out/behavioral.json`) | 37 pass / 0 fail | 37 pass / 0 fail |
| operational (`harness/out/operational.json`) | 12 pass / 0 fail | 12 pass / 0 fail |
| evidence admission | 7/7 protocols `admit` | 7/7 protocols `admit` |
| `evidence:verify` | all OK | all OK |

`node harness/manual-ui.mjs` after: words-mode completes → results shown with
exact stats; signup ok; time-15 saves PB; **js errors: none**. (A 409 seen on
one rerun was a stale-data-dir artifact — user already existed — not a code
issue; clean on fresh data dir.)

## 3. Per-invariant conformance notes (14 must / 3 should)

Method: scripted typing session in headless Chromium (1280×800, dsf 1 — the
sealed validation environment) with a Node-side `TypingSession` mirror fed the
identical keystroke stream; DOM asserted after **every keystroke** (chars,
errors, extras, backspaces, word commits, backspace retreats). Full log:
388 assertions, ALL CHECKS PASS (count varies with random word lengths).

**S-UI-001 (must)** — `#words` holds one `.word` per engine word in document
order; `data-wi` == index; word text == target at render; row-major rect order
verified within 2px. Note: extra letters appended during typing (B-UI-002) are
read as sanctioned by B-UI-002; S-UI-001's text equality holds of the rendered
target letters.
**S-UI-002 (must)** — every letter is a `.c` span with at most one sealed state
class `{correct, incorrect, extra}`; untyped = no state class. Pre-existing
vocabulary already verbatim; asserted per keystroke over all rendered words.
**S-UI-003 (must)** — exactly one `.word.active` at all times; its `data-wi` ==
mirror `session.wordIndex` after every keystroke (incl. commits and retreats).
**S-UI-004 (must)** — `:root` defines `--bg --main --caret --text --sub
--error --error-extra`, all resolving to parseable colors:
`#323437 #e2b714 #e2b714 #d1d0c5 #646669 #cf5763 #7e2a33`.
**S-UI-005 (should)** — all `feed()` calls from the keydown handler are
`{t: performance.now()>=0, type: char|backspace|space|restart[, value: 1 char]}`
— conforms to keystroke-event.schema.json (inspection; additionalProperties
none).
**B-UI-001 (must, net-new)** — one `#caret` div inside `#words`, present
whenever the test view is active (hidden with it otherwise). Position tracks
(wordIndex, n) per CA-UI-01 reading A: `left = right edge of letter n-1`
(`left edge of letter 0` when n==0), container-relative rects (scroll-stable).
Measured dx = 0.0–0.1px after every keystroke, incl. the CA-UI-01 revealing
test (2 chars + backspace → caret between letter 0 and 1, not word end).
Vertical overlap with active word's line box ✓. Visibility: display/visibility
default, opacity 1, area 105–115px² ≥ 4, all three 250ms samples visible (solid
caret, no blink). Zen fallback: whitespace letter spans collapse to 0-size →
caret height falls back to word line box / computed line-height (zen area
115px², dx 0.0).
**B-UI-002 (must)** — letter classes equal engine accounting after EVERY
keystroke, incl. the completing keystroke (see repair R2) — verified against
the mirror for every word, every event.
**B-UI-003 (must)** — MutationObserver drained per keystroke: mutated word set
⊆ {active_before, active_after} + caret + live-stats. See repair R1.
**B-UI-004 (must)** — on completion: `#test` hidden, `#result` shown; rendered
wpm === `String(payload.wpm)` and acc === `String(payload.acc)+"%"` (payload
captured from the actual POST /api/results body; e.g. '217.93' === '217.93',
'100%' vs 100). No rounding display.
**B-UI-005 (should)** — theme arrives via user-config only: `loadTheme()` on
boot/login (logout resets), `applyTheme()` sets only the 7 `:root` token values
(structure untouched); unknown/absent value → default dark. Verified live:
`PUT /api/config {theme:"no-such-theme"}` + reload → tokens unchanged;
`{theme:"dark"}` → same.
**B-UI-006 (should)** — `scrollIntoView({block:"center"})` on the active word
after every keystroke (pre-existing, kept).
**O-UI-001 (must)** — measured computed colors: text/bg **8.05 ≥ 4.5**;
error/bg **3.09 ≥ 3.0**; caret/bg **6.55 ≥ 3.0**; letter computed font-size
**25.6px ≥ 24px** (large-text clause asserted same pass).
**O-UI-002 (must)** — L(--bg)=0.034 ≤ 0.2; L(text) > L(bg); --error h=354.0°
s=0.556; --error-extra h=353.6° s=0.500 — both in [0,15]∪[340,360], s ≥ 0.45.
**O-UI-003 (must)** — four letter-state computed colors, pairwise max-channel
delta: untyped-correct 109, untyped-incorrect 107, untyped-extra 60,
correct-incorrect 121, correct-extra 166, incorrect-extra 81 — all ≥ 32.
**O-UI-004 (must)** — canvas-measured adv('i') == adv('m') ==
15.356px (Δ0 ≤ 1px) under computed font; stack ends in `monospace` generic.
**O-UI-005 (must, local proxy)** — baseline identity/capture is the validator's
host-pinned job (Q1); the implementation-side question "did stage 2 alter
rendering beyond the caret?" answered by A/B against git-HEAD assets, same
host+browser, identical word list (seeded Math.random), both sealed scenes:
**fresh 0.999897, mid-test 0.999754 similar** (changed pixels = caret
footprint + live-stats digit jitter; floor 0.85). Delta confined to the
anticipated ~0.01% caret footprint.
**O-UI-006 (must)** — request audit over the whole flow (load, signup, session,
results, config PUTs, reloads): 31 requests, ALL same-origin; system font stack
only; zero runtime deps (capability manifest respected).

## 4. Decisions made in the delegated/cosmetic space (research data)

D1. **`--error` lifted `#ca4754 → #cf5763`** [flagged]. The sealed floor
(O-UI-001, must) is ≥3.0; the bundle's round-2 note records the reference value
at 2.70:1 AND says "reference palette preserved" — arithmetically conflicting
bundle artifacts. Resolved per normative text: the adjudicated persistent
intent is the accessibility floor, and S-UI-004 delegates token VALUES within
bands. Minimal in-band move: same hue (354.0°), same saturation (0.556),
lightness 0.535→0.576 → 3.09:1. Screenshot-safe: neither O-UI-005 scene
contains error-colored pixels (fresh = untyped; mid = perfectly typed).
Revealing check if wrong: computed-style-metrics validator. See
blocking-questions.md item 1. **Cross-validated:** the protocol author's
post-sealing note PSN-UI-01 (ambiguity-log.md, research/negotiation/
round-03-postsealing-note.md) ratifies this exact value and classification.
D2. **Caret shape = 3px solid bar**, border-radius 1.5px, height = letter line
box, `background: var(--caret)`, `aria-hidden`. **No blink** — blink is
delegated (Q4); a solid caret passes every 250ms visibility sample
deterministically.
D3. **`--caret` = `--main` value** (#e2b714, reference caret aesthetic, 6.55:1).
D4. **Caret box placement**: its left edge at the insertion boundary (x-delta
0 vs the ±2px band), full letter-box height for the vertical-overlap clause.
D5. **Active-word style kept** (2px `--main` bottom border; `--error` when the
word contains an error) — mechanism is the sealed class contract; style
delegated.
D6. **Zen handling**: letters keep rendering the target char (S-UI-001 text
equality); caret geometry falls back to the word line box when whitespace spans
collapse (zero-size rects). No invariant exception claimed (log: "covered").
D7. **Theme hook minimal**: one built-in `dark` theme object mirroring the CSS
defaults; values applied via `setProperty` on `:root` only. No localStorage
theme cache (allowed but unnecessary this iteration).
D8. **Non-sealed colors left literal** (`#2c2e31` button/dialog chrome) —
S-UI-004 seals the 7 token names; additional literals/additional tokens are
unconstrained. Migration kept minimal per scope discipline.
D9. **Repair ordering**: `updateCaret()` called in `newTest()` AFTER unhiding
`#test` (rects are unmeasurable while hidden); `resize` listener re-anchors.
D10. **Dead `activeWordIdx` removed** (unused; active tracking reads
`session.wordIndex` directly per S-UI-003).
D11. **Live-stats ticker left at 250ms** (= 4 Hz capability ceiling) with
teardown on session end — pre-existing, conforms; untouched.

## 5. Conformance repairs found by the self-check (pre-existing UI defects)

R1. **B-UI-003 violation (fixed)** — `refreshActiveWord()` ran
`classList.remove("active")` on EVERY word per keystroke. Chromium records an
`attributes` mutation even for a no-op remove, so every committed word was
"re-classed" by later keystrokes — exactly what B-UI-003 forbids under its
MutationObserver formulation. Fixed: only the previously active word is
de-classed (active-before word is in the allowed mutation set).
R2. **B-UI-002 gap on the completing keystroke (fixed)** — the keydown handler
branched to `finish()` before refreshing, so the final word's last letters
kept stale (untyped) classes after the completing keystroke. Fixed: refresh +
liveStats run before the completion branch (B-UI-004 transition unchanged).

## 6. Blocking questions

**None.** See `blocking-questions.md` — two items (D1, D6) documented as
decidable-from-bundle with the reasoning a protocol author would need to veto
via a version event rather than an implementation guess.

## 7. Residual risk / notes for stage 3 (validator author)

- O-UI-005's admitted baseline must be captured by the validator harness from
  the live v2.2 origin on the same host image; my proxy only bounds the
  stage-2 delta. Note the pre-existing behavior that `wordsEl.focus()` scrolls
  the tall `#words` div to the viewport top on fresh load (identical in
  old/new captures; the baseline flow will capture the same).
- Zen's stream renders as collapsed whitespace (pre-existing; invariants
  mechanically hold; caret fallback verified). Flag for the record.
- The Workers candidate serves the same three public assets; stage-2 changes
  stay inside that surface, so both candidates remain admitted.
- Self-check scripts are implementation-side sanity tools, NOT the sealed
  validators; they assert the same observable properties (±2px caret, 32-delta,
  3-sample visibility, mutation confinement, exact results) and can seed
  validator fixtures.
