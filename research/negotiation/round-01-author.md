# ui-presentation — Negotiation Round 1: Author counterproposal

Bundle draft: `protocols/ui-presentation/` (status: draft, version 0.1.0).
Linter: `check_bundle.py` PASS (17 invariants; every `must` validator-mapped).
**Must count: 14 (at your budget ceiling, with two pre-approved merge levers below to reach 12–13).**

## 1. Verdicts on your positions

| # | Position | Verdict | Where |
|---|---|---|---|
| 1a | Monospace word stream, reading order, active word class | **Accept** (3 musts) | S-UI-001/003, O-UI-004 |
| 1b | Caret exists, visible, tracks engine state per keystroke | **Accept, modified** — engine exposes no caret object; I *define* logical caret position = (wordIndex, len(inputs[wordIndex])) and seal tracking against it (±2px). Visibility gets explicit numeric bounds + blink-phase sampling. | B-UI-001, CA-UI-01 |
| 1c | Per-letter state classes; incorrect/extra differ from correct | **Accept, strengthened** — pairwise distinction across all four states {untyped, correct, incorrect, extra}, max channel delta ≥ 32 (your "differ from correct" alone lets incorrect = extra). | S-UI-002, O-UI-003 |
| 1d | Theme charter: tokens on :root, contrast ≥ 4.5, red error band, dark bg | **Accept, modified twice** — (i) error-on-bg ≥ **3.0** not 4.5 (P2 below); (ii) error saturation floor **0.45** not 0.50 (P3); (iii) token list adds `--error-extra` (needed for the extra state). Dark-family sealed as L(bg) ≤ 0.2 **and** L(text) > L(bg). | S-UI-004, O-UI-001/002, theme.schema.json |
| 1e | Results show wpm/acc matching payload | **Accept, precision added** — exact numeric match; display-rounding is non-conformant; decoration delegated. | B-UI-004 |
| 1f | Committed words don't reflow/re-render | **Accept, formalized** as mutation confinement: per keystroke, mutated words ⊆ {active_before, active_after} + caret/stats; full re-render allowed only on restart. | B-UI-003 |
| 2 | Delegated cosmetics | **Accept** — see ledger §3. | — |
| 3 | ≤14 musts; cheap validators; substitutability | **Accept** — 14 musts; one screenshot invariant; bundle constrains only served client assets, so Node + Workers candidates remain co-admissible. | §4 |
| 4 | Name `ui-presentation`, deps engine + config, consume both handshakes | **Accept** — `consumes` both protocols; handshakes reference (not redefine) the engine's schemas per fork rule. | protocol.yaml |

## 2. Pushbacks (where I need your adjudication)

- **P1 — Validator substrate correction.** You budgeted "jsdom-class" checks. jsdom has no layout engine (rects are zero, no canvas `measureText`, no computed-style cascade fidelity, no screenshots). Caret tracking (B-UI-001), reading order (S-UI-001), monospace metrics (O-UI-004), and contrast math (O-UI-001) all require real layout. The repo already carries `puppeteer-core` + Chromium (`harness/manual-ui.mjs` precedent). **Counter: all UI validators run in one headless-Chromium session; ~30–60 assertions per page context keeps total suite ≈ 15–30s.** Same or cheaper than a jsdom harness you'd have to extend with a layout shim.
- **P2 — Error contrast: your two intents conflict.** You specified error-on-bg ≥ 4.5. The reference-informed palette you supplied measures **#ca4754 on #323437 = 2.70:1** (computed, WCAG formula). Sealing 4.5 forces a palette shift away from your reference aesthetic; sealing 2.70 violates your accessibility floor. **My draft resolves via WCAG large-text: letters render ≥ 24px computed (asserted in the same pass), so ≥ 3.0 conforms.** Override me if the 4.5 floor is the persistent intent and the palette is transient — one-line change to O-UI-001, but expect the screenshot baseline (O-UI-005) to shift with it.
- **P3 — Saturation floor 0.50 → 0.45.** Reference extra-error #7e2a33 measures s = 0.500 *to rounding*; a 0.50 floor flaps on float error. 0.45 keeps the reference admissible with no perceptible latitude loss.
- **P4 — The caret does not exist in the current UI.** 1b is net-new implementation work, not a constraint on existing behavior (active word is currently an underline only). Accepted anyway — it is machine-checkable and central to the aesthetic — but flag it for stage-2 effort.
- **P5 — Screenshot baseline identity (Q1, blocking for O-UI-005 finalization).** v2.2 live is pre-caret. A caret adds ~0.01% pixels — absorbed by the 0.85 threshold — so a v2.2 baseline is *coherent*. Recommend: capture v2.2 baseline at stage 0, re-baseline as a minor version event once the caret lands. Also: baseline/candidate captures must be host-pinned (system monospace rasterization differs across hosts; cross-host comparison is not admitted).
- **P6 — Class vocabulary sealed verbatim.** `correct`/`incorrect`/`extra`/`active` are contract points. Alternative (mechanism-free "any attribute") multiplies validator config for zero substitutability gain. If you foresee a second client with a different DOM dialect, say so in round 2 — that would justify the indirection.

## 3. Sealed-vs-delegated ledger

**Sealed (14 must):** stream structure + reading order (S-UI-001) · letter state vocabulary (S-UI-002) · single active word = wordIndex (S-UI-003) · token names on :root (S-UI-004) · caret existence/position/visibility (B-UI-001) · letter-state fidelity to engine (B-UI-002) · committed-word mutation confinement (B-UI-003) · results exact wpm/acc (B-UI-004) · contrast floors (O-UI-001) · token bands: dark family + red error hue (O-UI-002) · 4-state color distinction ≥32Δ (O-UI-003) · monospace advance equality (O-UI-004) · screenshot coherence, 2 scenes, 0.85@Δ16 (O-UI-005) · same-origin rendering (O-UI-006).

**Sealed as should (3, no admission weight):** keystroke-schema conformance at the producer (S-UI-005; engine already fail-closed via S-ENG-002) · theme application + unknown-theme fallback (B-UI-005; pending Q2) · active word stays in scrollport (B-UI-006).

**Delegated (your §2, confirmed):** exact hex values (within bands) · font stack (within monospace metrics) · spacing scale, radii, caret shape/blink, animation timing · theme catalog/names · results decoration · live-stats region (ungoverned, Q3) · breakpoints/responsive behavior · chart rendering.

**Explicitly rejected for sealing (nothing you asked; pre-empting):** pixel-exact layout (kills implementer latitude; screenshot band carries the intent) · animation/perf micro-budgets (validator cost > value) · multi-theme registry as protocol data (catalog is transient).

## 4. Friction assessment (validator cost per must)

| Invariant | Mechanism | Est. cost | Verdict |
|---|---|---|---|
| S-UI-001/002/003 | DOM queries + rects, one page context | ~1–2s | trivial |
| S-UI-004 | getComputedStyle(:root) token parse | <1s | trivial |
| B-UI-001 | scripted stream (~40 keys), rect assert per key, 3-sample visibility | ~5–8s | cheap |
| B-UI-002 | scripted + fast-check fuzz in-page (50/200 runs) | ~30s default | moderate — largest DOM cost, worth it |
| B-UI-003 | MutationObserver during B-UI-002's streams | ~0 marginal | trivial (piggyback) |
| B-UI-004 | login + perfect words-mode run, intercept POST /api/results, text compare | ~5s | cheap |
| O-UI-001/002/003 | one computed-style pass, WCAG/HSL math | <1s | trivial |
| O-UI-004 | canvas measureText ×2 | <1s | trivial |
| O-UI-005 | 2 screenshots + PIL compare (Δ16, ≥0.85 similar) | ~4–6s | moderate — the one allowed screenshot invariant |
| O-UI-006 | request log audit during above flows | ~0 marginal | trivial |

Total suite ≈ 1 min default, ≈ 5 min nightly. One browser boot amortized. Merge levers if you want headroom: fold O-UI-003 into O-UI-001 (→13), fold B-UI-006-side rect checks + drop S-UI-005 entirely (→12).

## 5. Critical-ambiguity record

One critical ambiguity found and resolved by definition: **CA-UI-01** (caret position semantics, B-UI-001) — full record in `protocols/ui-presentation/ambiguity-log.md`. Chosen reading A (insertion point after last typed char); revealing test specified. All other resolved items are cosmetic (logged with criticality tags). No silent assumptions.

## 6. Open questions for round 2

1. **Q1 (blocking O-UI-005):** baseline = v2.2 pre-caret (recommend + re-baseline later as minor version event) or first conforming candidate?
2. **Q2:** multi-theme shipping + live switching persistent? (B-UI-005 should→must?) If yes, how is the theme catalog delivered — config value only, or a theme endpoint (new handshake)?
3. **Q3:** govern live-stats/timer region or leave delegated?
4. **Q4:** confirm caret blink/shape delegated (validator uses 3-sample blink tolerance).

## 7. Substitutability note

The bundle constrains *served client assets and their runtime DOM behavior only*; no server-side surface is touched. Node/Express and Workers candidates serve identical assets per docs/09, so both remain admitted under one bundle. Validators run against any origin serving the assets (`npm start` locally, or the live Workers URL for the A/B arm).
