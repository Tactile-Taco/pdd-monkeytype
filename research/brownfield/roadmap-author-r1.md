# Brownfield roadmap — Negotiation Round 1: Author counterproposal

Counterparty: orchestrator. Basis: `research/brownfield/feature-inventory.md`,
`/mnt/agents/work/plan-brownfield.md`, survey of all 8 sealed bundles
(`protocols/`), negotiation records (`research/negotiation/round-01..03`),
docs/10 (CA-001). Nothing sealed by this document; all bundle changes below are
proposed version events executed per-domain at authoring time.

Headline positions:

- **D1 = typing-test-engine v2.0.0 major version event** (not a new bundle). §2.1.
- **D2 = user-config additive MINOR events only** (v1.1.0, v1.2.0, ...), flat key
  space preserved, zero data migration. I recommend AGAINST a nested-schema
  v2.0.0. §2.2.
- **D4 = NEW bundle `theme-catalog` + ui-presentation version event.** Font
  catalog forces a MAJOR (2.0.0) decision on O-UI-004 — blocking ground-truth
  question Q1. §2.3.
- **D5 splits**: test-results minor (tags) + NEW read-only bundle `result-stats`.
- **D8 = NEW bundle `user-profile`; user-account stays frozen.** It is the
  identity provider for every other bundle; lowest blast radius wins.
- **Inventory corrections:** D5 PBs, D6 submit/rate, per-quote PB are ALREADY
  sealed in the MVP (§5). Their domains shrink.

## 1. Verdicts on the draft domain map

| # | Draft domain | Verdict | Lands as |
|---|---|---|---|
| D1 | test-config | **Accept, split** — keystroke/generation semantics → engine v2.0.0; tape + quick-restart are presentation → ui-presentation event; min-threshold "failed test" needs ground-truth (C6) | typing-test-engine 2.0.0 + ui-presentation event |
| D2 | commands-settings | **Accept, modified** — settings schema = user-config additive minors; presets = user-config minor (same storage shape); command palette = NOT a protocol (client chrome, no cross-candidate contract) → delegate, optional should in ui-presentation event | user-config 1.1.0/1.2.0/1.3.0 |
| D3 | languages-wordlists | **Accept, re-scoped** — NEW bundle `wordlists` providing a `wordlist` handshake; engine v2.0.0 seals consumption of the abstract handshake with internal lists as default provider, so D3 does NOT block D1 | wordlists 1.0.0 |
| D4 | themes-appearance | **Accept, split** — catalog data = NEW `theme-catalog`; presentation behaviors = ui-presentation version event (minor OR major, gated on Q1) | theme-catalog 1.0.0 + ui-presentation 1.1.0 or 2.0.0 |
| D5 | results-history | **Accept, split** — tags CRUD/history filters = test-results minor (removes "tags CRUD" from out_of_scope); aggregates/charts/calendar = NEW read-only `result-stats` consuming stored-result-reader; result sharing (screenshot URL) → reject for sealing, delegate (image validators: cost > value) | test-results 1.2.0 + result-stats 1.0.0 |
| D6 | quote-management | **Accept, shrunk** — submit/approve/rate already sealed (v1.0.0); residual = favorites, search, refused state (additive `state` field, C5); per-quote PB already works via B-RES-003 (mode2=quote id, S-ENG-003) | quote-library 1.1.0 |
| D7 | leaderboards-expansion | **Accept, minus XP** — daily/all-time/language boards = leaderboards minor; window semantics blocking (C7); XP accrual moves to D8 (profile owns XP/level, consumes stored-result-reader) | leaderboards 1.1.0 |
| D8 | profile-progression | **Accept, re-homed** — NEW `user-profile` consuming auth-token + stored-result-reader (streaks, XP, badges, bio/links/avatar-URL); user-account untouched | user-profile 1.0.0 |
| D9 | public-api | **Accept** — NEW `public-api` (ApeKeys, scoped tokens, rate-limited REST re-exposing stored-result-reader/profile/quote); rate-limit validator needs clock discipline (§4) | public-api 1.0.0 |
| — | exclusions (ads, payments, oauth, captcha, admin, PSA) | **Accept** — record in each affected bundle's out_of_scope at next version event; no bundle needed | — |

## 2. The three flagged topology decisions

### 2.1 D1: engine v2.0.0, NOT a new bundle

Keystroke-rule modes (stop-on-error letter|word, confidence/no-backspace,
freedom, strict-space, opposite-shift, blind) modify the same semantic core as
sealed B-ENG-005..B-ENG-007. A wrapper bundle cannot reach them without the
engine exposing a keystroke-interception handshake — that multiplies coupling
and validator cost for zero substitutability gain (same argument class as
round-1 P6). Generation decoration (punctuation, numbers, lazy-mode accents,
custom mode2 bounds) is already inside the engine's sealed purpose ("word
stream generation ... pure computation over injected word lists and config",
O-ENG-003) and currently ungoverned — sealing it is gap-closure, not scope
creep. Precedent for the version-event path: engine 1.0.0→1.1.0 (CA-001),
test-results 1.0.0→1.1.0.

The MAJOR (not minor) is forced by C3: B-ENG-005's backspace rule is sealed
unconditionally and must be parameterized by config (confidence/freedom gate it)
— a behavior-changing edit to sealed text. Engine v2.0.0 also seals consumption
of the abstract `wordlist` handshake (schema: language id, word array, group
metadata) with today's internal lists as default provider — so D3's `wordlists`
bundle later plugs in with NO engine re-versioning (provider substitutability).

Carve-outs to ui-presentation's event (not engine): tape mode (scroll
behavior), quick-restart Tab (keybinding). Carve-out needing ground-truth:
min speed/acc thresholds (C6).

### 2.2 D2: user-config additive minors, never a nested v2.0.0

Current schema: flat, closed (`additionalProperties: false`, S-CFG-001), GET
merges defaults. Recommended strategy:

- **Additive flat keys, batched per consuming phase** (§4): each batch = one
  MINOR version event. Old stored configs remain valid automatically (defaults
  merge); **zero data migration, no dual-read, no negotiation handshake.**
- Rejected alternative — restructure into nested namespaces (behavior/input/
  sound) as v2.0.0 major: breaks the sealed `user-config` handshake consumed by
  typing-test-engine AND ui-presentation, forces consumer re-versioning and a
  stored-config migration, and buys only cosmetics. Grouping is achieved by key
  naming convention at zero cost.
- Substitutability consequence to record honestly: a v1.0.0 candidate
  fail-closes on v1.1.0 keys (S-CFG-001 unknown-key rejection). Candidates are
  re-admitted per minor; the deployed line upgrades atomically per pdd:loop.
  This is the designed cost of a closed schema; batching keeps it to 3 events.
- Presets (named config bundles save/apply) ride the final minor as additive
  handshakes — same storage shape, capability manifest unchanged
  (max_writes_per_request: 1 holds). Import/export JSON = the existing config
  schema round-trip; no new invariant beyond schema conformance.
- Command palette: no protocol. Client chrome with no cross-candidate contract
  surface; sealing it would repeat the rejected "pixel-exact" class of
  over-specification. Delegate; optionally one should-level invariant in the
  ui-presentation event (palette exists + keyboard-invoked + filters actions).

### 2.3 D4: theme-catalog (new) + ui-presentation event (size gated on Q1)

Round-1 already rejected "multi-theme registry as protocol data (catalog is
transient)" and round-2 sealed B-UI-005 as should with the upgrade path noted.
Honoring both:

- **`theme-catalog` 1.0.0 (new server bundle):** named-theme catalog read,
  custom theme CRUD (9-slot payloads), share-as-JSON. Catalog CONTENTS stay
  transient; the handshake schema is the contract. Validators: contract +
  schema — trivial.
- **ui-presentation MINOR 1.1.0** if fonts stay monospace-constrained: B-UI-005
  should→must (theme application from config + unknown-theme fallback, the
  pre-noted upgrade), additive token names if ground-truth confirms extra slots
  (C2), additive behaviors (live preview applies tokens pre-commit, flip test
  colors swaps text/bg roles, colorful error mode recolors per O-bands, random
  theme per test resolves deterministically), tape mode + quick-restart from D1.
- **ui-presentation MAJOR 2.0.0** if the font catalog admits proportional
  fonts: sealed O-UI-004 (advance equality ±1px AND monospace generic fallback)
  is directly contradicted. Amendment shape: advance-equality applies to the
  sealed default font; declared `config.fontFamily` fonts exempt; B-UI-001
  caret ±2px and B-UI-002/003 already carry the real interaction contract, so
  marginal validator cost is LOW (no new mechanisms; O-UI-005 screenshot band
  absorbs glyph changes, re-baseline = the event's mechanics). Recommendation:
  admit proportional fonts — reference parity is the project goal and the
  safety net holds — but this is YOUR call (Q1); it is the only behavior-
  breaking amendment in the whole roadmap besides engine 2.0.0.

## 3. Scope triage (must budgets)

Rule applied: ≤12 musts for NEW bundles; version-evented bundles carry legacy
musts, marginal additions held to ≤4 and composite invariants used where one
property covers a mode matrix (precedent: B-ENG-002 covers three consistency
functions). Note: typing-test-engine already carries 14 musts; after D1 it
carries ~17. If you want a hard ≤12 ceiling applied to legacy bundles, that is
a separate refactoring event (folding, not dropping) — say so in round 2.

| Bundle (event) | New musts | Sketch |
|---|---|---|
| user-config 1.1.0 (D1 keys) | +1 | expanded schema conformance (S-CFG-001 amendment); defaults unchanged |
| typing-test-engine 2.0.0 | +3 | B-ENG-008 input-rule mode matrix (stop-on-error/confidence/freedom/strict-space/opposite-shift/blind, one composite property); B-ENG-009 generation decoration (punctuation/numbers/lazy/custom-mode2); B-ENG-005 amendment (config-gated) is an edit, not an addition |
| user-config 1.2.0 (D2 keys + presets) | +2 | schema expansion; preset save/apply round-trip handshake |
| theme-catalog 1.0.0 | 8 | catalog read schema; theme read by name; custom CRUD auth+round-trip; share-JSON schema; slot validation vs token names; error envelope; unknown-name handling; determinism |
| ui-presentation 1.1.0 or 2.0.0 | +3 | B-UI-005→must (edit); tape containment; quick-restart binding; (2.0.0 adds O-UI-004 amendment, not a count change) |
| test-results 1.2.0 (tags) | +2 | tag CRUD + assignment handshake; tag filter on history (B-RES-005 extension) |
| result-stats 1.0.0 | 8 | aggregate correctness per mode; wpm-over-time series; acc histogram buckets; activity calendar counts; rolling 10/100 averages; auth scoping; empty-history behavior; schema conformance |
| wordlists 1.0.0 | 8 | list schema (id/language/size tier); group membership; wordlist handshake conformance; unicode/lazy-source integrity; quote-language filter feed; determinism; size-tier bounds; error envelope |
| quote-library 1.1.0 | +2 | favorites handshake; search/browse query contract (+ `state` field consistency: approved=true ⇔ state=approved) |
| leaderboards 1.1.0 | +3 | daily board window semantics (post-C7); all-time rank+percentile; language board keys |
| user-profile 1.0.0 | 10 | profile read schema; public/private field rules; streak current/max math; XP accrual per admitted result; level curve; badge award rules; PB display source; avatar URL-only; name-change history append-only; error envelope |
| public-api 1.0.0 | 10 | ApeKey create/revoke auth; scope enforcement; token opacity; rate-limit 429 envelope; per-endpoint schema re-exposure parity; error envelope; no session-token leakage; revoked-key fail-closed; docs endpoint presence; determinism |

Delegated everywhere (non-exhaustive stance, per ui-presentation precedent):
theme names/hex within bands, badge art/names, chart rendering, palette UI,
avatar blobs, XP curve constants (sealed only as documented-deterministic),
wordlist contents beyond schema, docs page layout.

## 4. Dependency-ordered execution plan + validator cost estimates

Cost vocabulary per ui-presentation precedent: trivial <2s (contract/schema),
cheap ~5s (HTTP flows), moderate ~30–60s (property suites / seeded datasets),
expensive = screenshot-class (avoided; one legacy invariant only).

| Order | Item | Blocks on | Validator mechanisms | Est. suite delta |
|---|---|---|---|---|
| P0 | Ground-truth answers C1–C7 (§5) | — | orchestrator-only reference reads | — |
| 1 | user-config 1.1.0 (D1 key batch) | — | schema-conformance, contract-tests | trivial (+~5s) |
| 2 | typing-test-engine 2.0.0 | 1 | property-check mode-matrix fuzz (reuse fast-check harness), determinism replay across matrix, contract-tests; NO browser | moderate (+~45–60s; largest single addition, worth it) |
| 3 | user-config 1.2.0 (behavior/sound/caret/theme keys + presets) | — | contract-tests, round-trip property | trivial (+~5s) |
| 4 | theme-catalog 1.0.0 | 3 | contract-tests, schema-conformance, auth negative tests | trivial–cheap (+~10s) |
| 5 | ui-presentation 1.1.0 **or** 2.0.0 | 4, C1, C2 | reuse one Chromium session: computed-style passes (token slots, flip, colorful-error), caret assert unchanged, tape/quick-restart DOM checks; 2.0.0 adds screenshot re-baseline (host-pinned, same 0.85@Δ16 band) | cheap–moderate (+~15–30s inside existing browser boot) |
| 6 | test-results 1.2.0 (tags) | — | contract-tests, property-check tag filters | cheap (+~10s) |
| 7 | result-stats 1.0.0 | 6 | property-check on seeded fixture datasets (deterministic aggregates, injected clock) | cheap–moderate (+~20–30s) |
| 8 | wordlists 1.0.0 | — (engine 2.0.0 already consumes abstract handshake) | batch schema-conformance over ~60 lists, decoration property-checks (pure functions) | cheap (+~15s) |
| 9 | quote-library 1.1.0 | — | contract-tests | trivial (+~5s) |
| 10 | leaderboards 1.1.0 | C7 | property-check seeded results + injected clock (daily window), rank/percentile math | cheap–moderate (+~20s) |
| 11 | user-profile 1.0.0 | 7 | property-check streak/XP math with injected clock + date-boundary fuzz, contract-tests | moderate (+~30s) |
| 12 | public-api 1.0.0 | 7, 9, 11 | contract-tests, scope negative tests, rate-limit burst test — FLAG: needs deterministic token-bucket clock injection, else tolerance band on window edge (authoring-time decision) | cheap–moderate (+~20s) |

Deviations from your draft order (D2→D1→D4→D5→D3→D6→D7→D8→D9): D3 demoted
below D5/D6/D7 — engine 2.0.0 consumes the abstract wordlist handshake, so
wordlists is a pure provider plug-in with no dependents; everything else
matches. D8 after D7 only because XP display wants leaderboards settled;
strictly it needs only stored-result-reader (post-6) if you want it earlier.

Phase totals: no domain exceeds moderate; the only expensive-class mechanism in
the program remains the single legacy screenshot invariant (O-UI-005), at most
re-baselined once (if 2.0.0). Cumulative suite growth ≈ +3–4 min against the
current ≈1 min baseline — inside discipline.

## 5. Conflict risks in MVP sealed text — needing YOUR ground-truthing

These are places where sealed MVP text and the inventory intent may collide.
I cannot read the reference; classify/answer each before the affected domain's
authoring round. Blocking flags shown.

- **C1 (BLOCKING D4; decides ui-presentation 1.1.0 vs 2.0.0).** O-UI-004 seals
  monospace advance equality + monospace generic fallback. Does the reference
  font catalog include proportional fonts, and is admitting them persistent
  intent? If yes → major event, O-UI-004 amendment per §2.3. If catalog is
  monospace-only → minor event, per-font advance check added to theme-catalog
  validation instead.
- **C2 (blocking D4 minor path).** S-UI-004 seals exactly 7 token names
  (--bg --main --caret --text --sub --error --error-extra). Reference custom
  theme editor slot count/names: inventory says "9 slots bg/main/caret/sub/
  text/error". Confirm exact slot list. Additions only (e.g. --sub-alt) =
  additive minor; any RENAME of a sealed token = behavior-changing, escalate.
- **C3 (decision confirmation, not research).** Engine 2.0.0 requires editing
  sealed B-ENG-005 to be config-gated (confidence disables backspace; freedom
  lifts retreat restrictions). Confirm you accept a MAJOR engine event rather
  than scoping confidence/freedom out of D1.
- **C4 (blocking D7).** leaderboards v1.0.0 seals boards keyed (time,
  15/60, english) and B-LB-003 read-time recomputation. Reference "daily"
  semantics: UTC calendar-day bucket or rolling 24h? Observable difference,
  behavior-changing — resolve before leaderboards authoring (CA discipline:
  pre-sealing resolution, not post-hoc).
- **C5 (D6 authoring input).** quote.schema.json seals `approved: boolean`.
  Reference refused state: does it persist refused quotes (visible to
  submitter)? If yes I add an additive `state` enum + consistency invariant
  (approved=true ⇔ state=approved) in a MINOR; if refused = dropped from
  queue, no schema change at all. Do NOT break the boolean (would force major).
- **C6 (blocking D1 residue).** "Min speed/acc custom thresholds [verify]":
  confirm reference semantics — does a below-threshold test abort as "failed"
  (unsubmitted) client-side, or submit flagged? B-AC-002 already rejects
  acc<75 server-side; a user threshold that produces MORE rejections needs a
  completed-event marker (engine 2.0.0 can carry it additively) or the feature
  is pure client chrome (delegate). Also verify: does the reference submit
  failed tests to history at all?
- **C7 (D5/D8 input, non-blocking).** Reference PB keying: sealed B-RES-003
  tuple is (mode, mode2, language, punctuation, numbers). Confirm the reference
  does NOT key PBs on additional D1 flags (stop-on-error, confidence, etc.).
  If it does, PB tuple extension = test-results version event with behavioral
  weight — tell me BEFORE test-results 1.2.0 so one event carries both.
- **C8 (verify-only).** Zen mode scope flagged [verify] in inventory;
  B-ENG-007 seals "zen never self-completes" — confirm no additional reference
  zen semantics (e.g. no backspace variant) that D1 should absorb.

## 6. Inventory corrections (already sealed in MVP — shrink the domains)

Ground-truthed against sealed bundles, not the reference:

1. D6 "quote submission + rating" — ALREADY SEALED: quote-library 1.0.0
   (submit→pending, approve, 1–5 star rating with averages). D6 residual:
   favorites, search/browse, refused state.
2. D5 "personal bests per mode/config" — ALREADY SEALED: B-RES-003 PB per
   (mode, mode2, language, punctuation, numbers). D5 residual: tags, filters,
   aggregates, chart/calendar data.
3. D6/D5 "per-quote personal best" — ALREADY WORKS: mode2 carries quote id
   (S-ENG-003), so B-RES-003 keys per-quote PBs with no new text. Confirm
   reference displays them; if so the residual work is ui-presentation-side.
4. D1 punctuation/numbers config surface — keys ALREADY in sealed config schema
   (punctuation, numbers, stopOnError, blindMode, lazyMode, difficulty). What
   is ungoverned is engine HONORING them (no generation invariants exist) —
   that is the actual D1 gap, and it is engine-internal.
5. Anticheat vs new modes — NO conflict found: B-AC-001/002 bounds are
   mode-generic (350/420 wpm caps, acc floors); custom mode2 values pass
   through. No result-anticheat version event needed for D1. (Stop-on-error
   forcing acc≈100 is engine behavior, admission-neutral.)

## 7. Open questions for round 2

1. Q1 = C1 (fonts; decides D4 event size). The only roadmap-blocking intent
   question besides C3/C4.
2. Q2: hard ≤12 ceiling on LEGACY bundles too (requires folding events on
   engine), or marginal-addition rule as proposed in §3?
3. Q3: command palette — confirm delegate (my recommendation) or should-level
   in ui-presentation event?
4. Q4: result sharing (screenshot URL) — confirm reject-for-sealing/delegate.
5. Q5: D8 placement — after D7 as planned, or pull forward to post-6?

## 8. Metrics posture (for the paper)

Per round-01-orchestrator convention, collect per domain: negotiation rounds;
accept/modify/reject per position; blocking questions cosmetic vs critical
(CA-001 class); version events (this roadmap plans: 1 major engine, 1 major OR
minor ui-presentation, 3 minor user-config, 1 minor test-results, 1 minor
quote-library, 1 minor leaderboards, 4 new-bundle seals = 12 events total,
2 of them majors); validator runtime deltas (§4); post-sealing conformity
notes (PSN class). Friction ledger starts at 4 blocking questions (C1, C3, C4
+ one reserve) + 4 ground-truth verifies (C5–C8).
