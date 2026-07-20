# Implementation Report — ui-v2 batch
## user-config v1.2.0 · theme-catalog v1.0.0 (NEW) · ui-presentation v2.0.0 (MAJOR)

Stage: implementation. Sources of truth: the three sealed bundles only.
Prior art built on: engine-v2 wiring + cfg 1.1.1 (`engine-v2-report.md`).
Ambiguity handling: CA-001 — cosmetic/delegated decided + logged (§5);
critical → `blocking-questions-ui-v2.md` (BQ-UI-IMPL-01 raised and **CLOSED —
author-resolved via validator-set 0.1.1**, §7). Final state: **`npm run
pdd:loop` green end-to-end, admission 9/9 protocols** (§6).

---

## 1. Deliverables (files touched)

| File | Change |
|---|---|
| `implementation/src/shared/themes.js` | **NEW** — isomorphic theme module: 9 sealed slots, WCAG/HSL color math, charter shape (S-THM-001/002) + static charter bands (O-THM-003), 10 starter themes, B-UI-005 resolution + all-nine custom-slot gate, colorful-extra derivation. Zero runtime deps (Workers-portable per docs/09). |
| `implementation/src/server/validate.js` | user-config v1.2.0: 24→37 keys. +9 custom slots (loose `string≤32`, `""`=unset — schema per ambiguity-log), +caretStyle enum, +smoothCaret, +liveWpm/liveAcc/liveBurst; **customThemeId removed** (BQ-CFG-01). Domains mirror `config.schema.json`. |
| `implementation/src/server/app.js` | theme-catalog endpoints + boot-time catalog admission (O-THM-003: shape+bands re-checked statically; failure aborts app construction). Byte-cached payloads (B-THM-003). |
| `implementation/public/app.js` | 37-key LOCAL_DEFAULTS; async theme resolution custom>catalog>default via `/api/themes` handshake (per-deploy cache); randomTheme atomic at test start; flip/colorful/blind/tape role classes; caret styles + smooth pulse; tape anchored-caret scroll; font application; live-stats toggles. |
| `implementation/public/style.css` | S-UI-004 v2: **nine** sealed tokens on :root (+`--sub-alt`, `--colorful-error`); derived role vars `--surface`/`--ink` (flip), `--colorful-error-extra`; blind/tape/caret/colorful rules; `--sub-alt` now sources previously hardcoded chrome hex `#2c2e31` (zero pixel delta). |
| `implementation/public/index.html` | empty `#livex` span in the (delegated) live-stats region. |
| `implementation/tests/ui-v2.test.mjs` | **NEW** — 13 focused tests (invariant-lineaged). |
| `harness/boot.mjs` | SEALED_CONFIG_DEFAULTS → 37 keys (transcribed from sealed ambiguity-log; kept independent of impl). |
| `harness/validate-structural.mjs` | 37-key S-CFG-001/B-CFG-001; customThemeId-removal rejection; NEW S-THM-001/002/003 (list + per-theme charter-schema conformance via ajv, unknown→ErrorEnvelope). |
| `harness/validate-behavioral.mjs` | 37-key arbitraries/round-trip/wholesale-422 (incl. removed `customThemeId` as unknown-key); NEW B-THM-001/002/003 (round-trip, not_found no-substitution, byte-identity). |
| `harness/validate-operational.mjs` | NEW O-THM-001 (no-auth reads, data dir untouched), O-THM-002 (p95≤50ms), O-THM-003 (harness-side static bands over SERVED payloads, using the validator's own `color.mjs` — independent of the impl module). |
| `harness/build-evidence.mjs` | `theme-catalog → THM` prefix so the 9th bundle gets evidence/admission. |
| `worker/build.mjs`, `worker/glue.mjs` | shared/themes.js registered (verbatim concat + `/shared/themes.js` asset); `/api/themes` routes ported (admission at isolate boot; cached payloads). Bundle rebuilt; `node --check` OK; `node worker/smoke.mjs` ALL PASS. |

**Not touched:** `protocols/` (sealed bundles + v1 validator suite), `.github/`, no pushes/deploys.

---

## 2. user-config v1.2.0 — per-invariant notes

- **S-CFG-001 (closed 37-key set)**: `CONFIG_KEYS`/`CONFIG_DEFAULTS` now 37;
  GET never presents `customThemeId`; PUT with it → 422 unknown-key
  (**intended** rejection per round-4 ruling BQ-CFG-01; harness asserts it).
- **S-CFG-002/B-CFG-002**: merge semantics unchanged; harness 37-key sequential
  round-trip + randomized partial-update property pass.
- **B-CFG-001**: defaults-merge at read ⇒ zero data migration; stored v1.x
  configs (without batch-2 keys) read as valid v1.2.0 configs at sealed
  defaults. A stored config *carrying* `customThemeId` is only rejected on the
  next PUT (wholesale validation) — as ruled.
- **B-CFG-003**: wholesale 422; harness sweeps invalid values for all 37 keys
  + removed + unknown keys.
- **S-CFG-003/004, B-CFG-004/005**: untouched (envelope, ≤1 write, auth,
  atomicity) — regression-checked by existing harness checks.
- **Custom slot looseness (delegated, per ambiguity-log)**: slot values are
  `string ≤ 32` with `""` = unset at the CONFIG layer; charter-pattern
  enforcement happens at application time (B-UI-005 all-nine gate) — deliberate
  so `""` stays representable. Client mirror updated.

## 3. theme-catalog v1.0.0 — per-invariant notes

- **S-THM-001/002**: catalog served per `theme-catalog.schema.json`
  (`{themes:[{name}]}`); each theme per `theme.schema.json` — name + exactly the
  nine sealed slots (additive growth unused). Data lives in the isomorphic
  module (bundled data asset; zero filesystem reads — within the
  `assets/themes/` capability as an empty subset; chosen for trivial Workers
  portability — decision logged §5).
- **S-THM-003**: all failures as ErrorEnvelope.
- **B-THM-001**: list/get round-trip; `get(n).name == n` (harness + unit).
- **B-THM-002**: unknown name → `404 {"error":{"code":"not_found",...}}`; never
  substitution (harness asserts tokens/name absence).
- **B-THM-003**: payloads serialized once at boot; repeat reads byte-identical
  (harness fetches raw bytes twice for list + theme).
- **O-THM-001**: no auth on either route; zero store writes (harness snapshots
  data-dir files/mtimes around reads); bundled data, no egress.
- **O-THM-002**: p95 = **0.42ms** over 100 reads (floor 50ms).
- **O-THM-003**: static charter bands = pure WCAG luminance/contrast + rgb→HSL
  + max-channel-delta over hex tokens (no browser). Enforced at **three**
  independent points: module load (unit tests), server boot admission (deploy
  blocked on violation), worker isolate boot; plus harness-side verification
  over served payloads using the *validator's own* color.mjs. All 10 starter
  themes pass — reference-informed values with **band-driven minimal hex
  adjustments** (BQ-THM-02: no exceptions; charter = persistent intent):
  - dracula `--error #ff5555→#e1555f` (s 1.00→0.75: B-UI-010(b) requires
    s(colorful) > s(error)); nord `--error #bf616a→#c45c66` (s 0.423→0.47),
    `--error-extra #6f3940→#7b2d37` (s 0.321→0.47);
  - monokai `--error #f92672→#f92656` (hue 336→345 into the red band);
  - gruvbox `--error #fb4934→#e04738` (s 0.95→0.83, colorful headroom);
  - solarized `--text #839496→#93a1a1` (contrast 3.95→5.9 ≥ 4.5);
  - matrix `--error→#e03131`; midnight `--error #f38ba8→#e0799a`,
    `--error-extra→#853046`; bento `--error-extra→#873137` (same s-floor rationale).
  - serika_dark adds the v2 slots: `--sub-alt #2c2e31` (== previously hardcoded
    chrome hex), `--colorful-error #ff4655` (s 1.0 > s(--error) 0.55).
  - Additionally self-imposed (verified in unit tests, protects v2 validator
    scenarios): every theme passes colorful-mode pairwise distinction
    (sub/text/colorful/derived-extra ≥ 32 max-channel delta), flip-mode
    pairwise (sub/bg/error/error-extra ≥ 32), and colorful-error contrast ≥ 3.0
    on its bg.
- **Theme count**: exactly 10 starters (delegated data; "~10" satisfied).

## 4. ui-presentation v2.0.0 — per-invariant notes

- **O-UI-004 (amended)**: `fontFamily` applied to the word stream
  (sanitized, `Name, ui-monospace, monospace` stack — system stacks only, no
  font fetching ⇒ O-UI-006 preserved); monospace default unchanged.
  `fontSize`: rem, 0 = client default; **presentation clamps to [1.5, 4] rem** —
  the floor keeps computed letters ≥ 24px so the O-UI-001 large-text clause
  stays satisfiable (delegated clamp range, logged).
- **B-UI-005 (amended precedence)**: implemented as sealed —
  (1) all-nine non-empty + charter-pattern custom slots ⇒ active token set;
  (2) catalog theme named by `theme`, read via the `/api/themes` handshake;
  (3) default dark theme. Fail-closed at every step (malformed slot ⇒ gate
  fails; unreadable/invalid catalog ⇒ default). Applying a theme sets :root
  token values only — never structure. Smoke-verified all three tiers + the
  broken-gate fallthrough.
- **S-UI-004 (amended)**: nine tokens on :root, values parse (v1 suite confirms
  its 7; harness/unit confirm all 9 vs the sealed schema).
- **B-UI-007 (blind)**: `.blind .c.incorrect/.extra { color: var(--ink) }` —
  computed RGB identical to correct; state classes keep true engine state
  (presentational only). Blind wins over colorful by specificity.
- **B-UI-008 (tape)**: single horizontal line (`nowrap`, hidden scrollbar);
  caret anchored by translating the stream (`scrollLeft = contentX − anchor`,
  a permitted stream-translation exception to B-UI-003; no DOM mutations per
  keystroke). Anchor = 30% of stream viewport (FIXITY sealed, location
  delegated); 30%/70% left/right padding keeps the anchor reachable from the
  first through the last keystroke (found + fixed during smoke: without right
  padding, max-scroll clamps and the caret drifts at stream end). Measured
  viewport-X delta across keystrokes: **0.64px max** (seal: ±2px). Active word
  stays in the scrollport (B-UI-006 holds; `scrollIntoView` disabled in tape).
- **B-UI-009 (quick-restart)**: unchanged from engine-v2 (restart
  keystroke-event routed to the engine; no character input; `off` = no binding).
- **B-UI-010 (flip/colorful)**: flip swaps derived ROLE vars
  (`--surface: var(--text); --ink: var(--bg)`) — stream background from --text,
  correct letters from --bg; contrast floors hold by WCAG symmetry; dark-family
  band gated per O-UI-002(i). colorfulError: incorrect ⇒ `--colorful-error`;
  extra ⇒ derived `--colorful-error-extra` (same h/s, l×0.55, floor 0.12) ⇒
  s(errorStates) > s(--error) within the hue band for every shipped theme
  (unit-verified). Smoke: flip bg/ink + colorful pair (Δ=76) verified.
- **B-UI-011 (randomTheme)**: a catalog theme is picked at each test start;
  `newTest()` awaits resolution ⇒ tokens set before the first keystroke
  (atomic). Selection algorithm delegated (uniform over list). Smoke: two
  consecutive starts picked catalog members (bento, monokai).
- **liveWpm/liveAcc/liveBurst**: storage sealed (§2); display delegated →
  minimal wiring: enabled toggles enrich `#livex` (`live N wpm · acc N% ·
  burst N wpm`; burst = raw wpm over trailing 1s of engine char events, same
  bucket basis as completion chartData). Defaults off ⇒ byte-identical v1
  stats line (zero baseline delta, smoke-verified).
- **caretStyle (delegated cosmetics)**: line (default, unchanged) / block /
  outline / underline (bottom bar, geometry in updateCaret) / off (element
  present, opacity 0). All styles keep the LEFT edge at the tracked insertion
  boundary (B-UI-001 holds for line; styles are delegated per ambiguity-log).
- **Baselines**: default-mode rendering untouched — `--sub-alt` equals the
  hardcoded hex it replaced; derived roles default to `var(--bg)`/`var(--text)`;
  `#livex` empty; fonts unset by default. **O-UI-005 v2.2 baseline NOT
  recaptured** (retirement approved; stays until the v3.0 candidate).

## 5. Delegated decisions (CA-001 cosmetic — decide + log)

1. **Catalog as isomorphic JS module** (not `assets/themes/*.json`): the
   capability manifest ALLOWS fs reads but doesn't require them; a module is a
   bundled data asset, byte-stable per deploy, and trivially Workers-portable.
2. **Route names**: `GET /api/themes`, `GET /api/themes/:name` (catalog read
   endpoints not sealed beyond the schema shapes).
3. **Theme names** `serika_dark` style (config default matches catalog entry).
4. **smoothCaret form**: fade-ease pulse on position updates — a positional
   slide breaks sealed ±2px-per-keystroke tracking at the sealed default
   (measured ~1 frame post-keystroke by the v1 suite). Tension recorded as
   ADV-UI-IMPL-01 for the v2 validator stage; preference is observable and the
   tracked edge never animates.
5. **Tape anchor location** 30% of stream viewport; stream translation via
   `scrollLeft` (no mutation-observer footprint).
6. **fontSize clamp** [1.5, 4] rem (protects O-UI-001's ≥24px large-text
   premise); fontFamily scope = word stream (the surface the invariant binds).
7. **Blind + word-level error underline kept** (B-UI-007 seals letter colors
   only; word border preserves state fidelity — cosmetic).
8. **randomTheme vs custom slots**: custom slots still win when fully valid
   (B-UI-005 (1) outranks); otherwise a uniform catalog pick per test start.
9. **live-stats region**: toggles enrich, defaults keep the v1 compact line
   (region delegated per round-2 Q3 / v1.2.0 log).
10. **Extra slot `--colorful-error-extra`** is a derived ROLE var, not a
    charter slot — never set by theme resolution input, only derived from
    `--colorful-error` at application time.

## 6. Verification (real commands)

| Check | Result |
|---|---|
| `npm test` (node --test implementation/tests/) | **42/42 pass** (29 engine-v2 + 13 new ui-v2) |
| `npm run validate:structural` | **admit**, 42 checks (incl. new S-THM-001/002/003, 37-key S-CFG) |
| `npm run validate:behavioral` | **admit**, 73 checks (incl. B-THM-001/002/003, 37-key round-trip, customThemeId removal 422) |
| `npm run validate:operational` | **admit**, 16 checks (incl. O-THM-001/002/003; p95 0.42ms) |
| `npm run validate:ui -- --boot-candidate` | **19/19 admit** (validator-set 0.1.1 — BQ-UI-IMPL-01 resolved by the author, §7) |
| Headless-Chromium smoke (harness/manual-ui.mjs precedent; script `/tmp/ui-v2/smoke-ui-v2.mjs`) | **26/26 PASS** — precedence×3, flip×2, colorful×2, blind×2, tape×3 (0.64px fixity), caretStyle×3, font×3, live toggles×2, randomTheme×2, zero js errors in all scenes |
| Server probes (bootApp) | 37-key GET; new-key PUTs 200; `customThemeId` PUT 422; bad caretStyle 422; list/get/404; byte-identical reads |
| `node worker/build.mjs` + `node --check worker/bundle.mjs` + `node worker/smoke.mjs` | bundle rebuilt (embeds final style.css incl. tape padding fix), syntax OK, **ALL PASS**; `/api/themes[/:name]` + `/shared/themes.js` probed in the Workers fetch model |
| **`npm run pdd:loop` (FINAL)** | **GREEN, EXIT=0**: structural admit (42) → behavioral admit (73) → operational admit (16) → ui admit (19/19, "all must invariants pass, 0 should-level gaps") → evidence build → verify OK; **admission 9/9 protocols** (theme-catalog admitted, 10 checks / 2 evidence blocks) |

**Before/after loop**: BEFORE (`loop-before.log`) — red at layer 1:
S-CFG-001 (deployed 24-key config vs sealed v1.2.0 schema; loop stopped before
behavioral). INTERIM (pre-resolution) — layers 1–3 admit, ui 18/19 (BQ-UI-IMPL-01).
FINAL (`loop-final.log`) — **full loop green, 9/9 admit**. No previously-green
check regressed at any point.

**Interim evidence note (author's stage-3 scoping flag)**: the patched suite
(0.1.1) still covers the v1-era invariant set. The NEW v2 invariants —
B-UI-007 blind, B-UI-008 tape anchored caret, B-UI-009 quick-restart,
B-UI-010 flip/colorful, B-UI-011 randomTheme, caretStyle/smoothCaret and the
live-stats display — get their FORMAL validators in the separate stage-3
extension. Until then their evidence is this stage's: the 26/26
headless-Chromium smoke (per-invariant assertions quoted in §4) + the 13
ui-v2 unit tests + harness layers for the config/catalog sides.

## 7. Blocking questions

- **BQ-UI-IMPL-01 (CLOSED — resolved by the author)**: validator suite patched
  to 0.1.1 (both token readers now the sealed nine); authored-token clause
  validates against the v2-sealed schema; 19/19 verified against this
  candidate and re-verified here by the full green loop. See
  `blocking-questions-ui-v2.md`.
- **ADV-UI-IMPL-01 (advisory, open for stage 3)** — smoothCaret default vs
  per-keystroke ±2px tracking tolerance; a positional slide remains
  unshippable under the v1 measurement timing, so the fade-ease form ships.
  Reconciliation (if a slide is wanted) belongs to the v2 validator stage.

## 8. Residual risk

- Custom-slot validation lives at application time (per the sealed loose
  schema); a fully-populated but band-violating custom theme renders as-is
  (charter bands gate only catalog admission — B-UI-005 seals pattern, not
  bands, for custom slots). Matches the sealed text; flagged for stage 3.
- The formal v2 validator extension (blind/tape/flip/colorful/randomTheme
  checks, caret/live-stats display, v3.0 baseline admission per approved
  O-UI-005 retirement) remains the stage-3 work; interim evidence listed above.
