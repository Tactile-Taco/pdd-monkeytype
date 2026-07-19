## 5. Results

### 5.1 Negotiation Outcomes

The bundle sealed as `ui-presentation` v1.0.0 after **2 negotiation rounds**, inside the pre-registered 2–3 budget (`research/negotiation/round-02-author.md`). The sealed contract carries **17 invariants: 14 `must` and 3 `should`** — exactly at the approved must-budget ceiling, with the author's two merge levers offered and not exercised. Table 3 is the friction ledger.

| Friction item | Count | Detail |
|---|---|---|
| Negotiation rounds | 2 | Positions (`round-01-orchestrator.md`) → counterproposal (`round-01-author.md`); adjudication → seal (`round-02-orchestrator.md`, `round-02-author.md`) |
| Author pushbacks adjudicated | 6 (P1–P6) | All accepted or confirmed in round 2 |
| Blocking questions (negotiation) | 4 (Q1–Q4) | All adjudicated in one round; none open at sealing |
| Critical (behavior-changing) items | 2 | CA-UI-01 (caret semantics, resolved by definition); P2 (internal intent conflict, orchestrator-adjudicated) |
| Cosmetic resolutions logged | 11 | All tagged in `protocols/ui-presentation/ambiguity-log.md` |
| Version events | 1 | 0.1.0 draft → 1.0.0 seal; no post-seal edits |
| Post-sealing conformity notes | 1 | PSN-UI-01 (§5.2.2); normative text unchanged |

Table 3: Negotiation friction ledger (`research/negotiation/`, `protocols/ui-presentation/ambiguity-log.md`).

Two pushbacks are load-bearing results in themselves. **P1 corrected the orchestrator's validator-substrate assumption**: the orchestrator had budgeted "jsdom-class" checks, but jsdom has no layout engine — no rects, no canvas `measureText`, no computed-style fidelity, no screenshots — so all UI validators were re-specified for one headless-Chromium session, at estimated equal-or-lower cost than extending jsdom with a layout shim (`round-01-author.md` §2). **P6 sealed the class vocabulary verbatim** (`correct`/`incorrect`/`extra`/`active`): with a single client dialect, a renaming-indirection layer would multiply validator configuration for zero substitutability gain.

### 5.2 Ambiguity and Conflict Record

#### 5.2.1 CA-UI-01 and the P2 internal conflict

One classical critical ambiguity was found and resolved by definition: **CA-UI-01** — "caret tracks engine caret state" is undefined because the engine exposes no caret object, only `wordIndex` and `inputs[wordIndex]`. Of three observably distinct readings, the author chose reading A (caret = insertion point after the last typed character of the active word), formalized it in B-UI-001 as the logical caret position $(wordIndex, n)$ with a ±2 px tracking band, and recorded the revealing test (type two characters, backspace once: the caret must sit between letters 0 and 1, not at word end) (`protocols/ui-presentation/ambiguity-log.md`).

The more instructive event was **P2**: the orchestrator had specified an error-on-background contrast floor of ≥ 4.5 *and* supplied a reference palette whose error color measures **2.70:1** (`#ca4754` on `#323437`, WCAG formula) — two of its own intents in conflict, which the orchestrator had not detected. The author surfaced the conflict rather than choosing silently; adjudication ruled the persistent intent to be the *principled accessibility floor* rather than the specific number, and sealed ≥ 3.0 with the WCAG large-text clause (letters ≥ 24 px computed, asserted in the same pass) (`round-01-author.md` §2, `round-02-orchestrator.md`, `protocols/ui-presentation/invariants/operational.yaml` O-UI-001). The round-2 orchestrator record flags this explicitly as a research note: negotiation corrected the stakeholder's *intent set*, not merely the protocol text.

#### 5.2.2 PSN-UI-01 — the miss, and the zero-friction absorption

Both parties then missed a defect. The round-1 rationale claimed the sealed 3.0 floor "preserves the reference aesthetic," but that claim had been verified per palette *family*, not per token: it holds for `--text` (8.05:1), `--main`, and `--caret`, and is **false for `--error`** — the computed 2.70:1 was weighed only against the proposed 4.5 floor, never against the 3.0 floor actually sealed. The implementer discovered the arithmetic conflict in stage 2, classified it as decidable from normative text (S-UI-004 seals token *names* and delegates token *values* within bands; P2 had adjudicated the persistent intent), and repaired it locally: `--error` lifted `#ca4754 → #cf5763` — contrast **3.09:1**, hue 354.0° → 354.0°, saturation 0.553 → 0.556, inside the O-UI-002 red band. The protocol author's post-sealing note ratified the identical value and classification, and named the new defect class: an **unverified admission claim** — a rationale of the form "this bound admits the reference" that was not verified numerically for every token it covers — distinct from critical ambiguity, now a binding authoring rule (`research/negotiation/round-03-postsealing-note.md`, `protocols/ui-presentation/ambiguity-log.md`, `research/implementation/blocking-questions.md` item 1). Friction cost of the entire episode: **zero blocking questions, zero orchestrator round-trips, zero version events**.

### 5.3 Implementation Under the Firewall

Stage 2 touched only the served-assets surface (`implementation/public/`: style.css, app.js; index.html unchanged) — no server, engine, or shared-module changes — so both candidates remained co-admissible (`research/implementation/stage-02-report.md` §1). The firewall held completely: **0 blocking questions** were issued; **11 delegated decisions** (D1–D11) were logged with author-veto-grade reasoning, of which D1 is the PSN-UI-01 palette repair. The pre-existing validator loop was undisturbed end-to-end: structural 19 pass / 0 fail, behavioral 37 / 0, operational 12 / 0, evidence admission 7/7 — identical before and after the change (stage-02 report §2).

Two findings deserve emphasis because they are *defects the sealed invariants found in code that predated them*. **R1**: the pre-existing `refreshActiveWord()` ran `classList.remove("active")` on every word per keystroke; Chromium records an `attributes` mutation even for a no-op remove, so committed words were being "re-classed" by later keystrokes — precisely what B-UI-003's mutation-confinement formulation forbids. **R2**: the keydown handler branched to completion before refreshing, leaving the final word's last letters with stale untyped classes after the completing keystroke — a B-UI-002 gap invisible to any user. Both were repaired in stage 2 (stage-02 report §5). The implementer's own scripted self-check (headless Chromium, DOM asserted after every keystroke against a Node-side engine mirror) logged 388 assertions, all passing (stage-02 report §3).

### 5.4 Validator Loop

**The candidate was admitted on iteration 1 — zero implementation defects found by the sealed validators.** All 14 `must` and all 3 `should` invariants passed on the first full-suite run, plus the two suite-hygiene checks (bundle lint; oracle agreement), 19/19 (`research/metrics/validator-loop.md` §1–2; `evidence/admission-summary.json` records `ui-presentation: admit, 19 checks`). The full project loop then exited 0 with **8/8 protocol admissions** and all runtime ledgers verifying (`validator-loop.md` §8). Table 4 reports wall-clock costs.

| Run | Target | Result | Wall clock |
|---|---|---|---|
| Suite, `--runs 50`, seed 42 | candidate (`http://localhost:8787`) | **admit (19/19), iteration 1** | **92.9 s** |
| Suite inside `pdd:loop` (`--boot-candidate`) | candidate | admit | 97.6 s (UI layer); **130 s loop total** |
| Research smoke, `--runs 50` | v2.2 pinned replica | reject: B-UI-001, S-UI-004, O-UI-001, O-UI-002 (all adjudicated pre-caret/pre-charter gaps) | 90.7 s |
| Research smoke, `--runs 3` | v2.2 pinned replica | reject (expected gaps) | 16.2 s |
| Nightly projection (`UI_PBT_RUNS=200`) | any | — | ≈ 5 min (fuzz ≈ 1.4 s/run dominates) |

Table 4: Validator runtimes (`research/metrics/validator-loop.md` §2, §7; `research/metrics/validator-authoring.md` §2).

The v2.2 smoke run doubles as a discrimination check: the suite rejects the pre-charter baseline on exactly the four `must` invariants the candidate had to close, and passes every v2.2-conformant behavior — no false positives (`validator-authoring.md` §3). Suite volumes on the candidate: 55 scripted keystrokes plus 50 fuzz runs (2,093 steps) for per-letter fidelity, with the fuzz mutant killed; 27,581 mutation records evaluated for confinement (versus 46,018 on v2.2 — the R1 repair eliminated the no-op record storm, a 40% drop); 67 requests audited across 7 page sessions, all same-origin (`validator-loop.md` §3).

Validator **authoring** surfaced **10 protocol-text insufficiencies** in the sealed v1.0.0 text (`validator-authoring.md` §5) — under-specifications such as unsealed DOM identity hooks (#1), completing-keystroke scoping (#2), MutationObserver no-op semantics (#3), and an unmeasurable theme-schema clause (#5). Friction accounting: **0 blocking** — 8 were worked around cleanly at authoring time, 2 remain latent but non-blocking for divergent candidates (#1, #5), and none required protocol patching or implementation fixes during the loop (`validator-loop.md` §5). One pre-existing flake was observed and reported without being patched: `pdd:loop` run #1 stopped at `validate:behavioral` on B-ACC-001 (account signup case-insensitive uniqueness), which then admitted 4/4 times; the flake predates stage 3, lives in the user-account layer, and is independent of the UI layer (`validator-loop.md` §6).

### 5.5 Visual Coherence Measurements

Table 5 collects the coherence evidence. Screenshot coherence (O-UI-005) against the host-pinned v2.2-lineage baseline — two scenes at 1280×800, deviceScaleFactor 1, pinned quote/config APIs, seeded `Math.random`, ≥ 85% of pixels within per-channel delta 16 required — measured **0.999897 (fresh test) and 0.9996 (mid-test after five perfectly typed words)** on the admitted candidate; the deltas are the caret bar plus live-stats digit jitter, matching the author's round-1 prediction that the caret's ~0.01% pixel footprint would be absorbed by the 0.85 threshold (`validator-loop.md` §3; `protocols/ui-presentation/invariants/operational.yaml`). The stage-2 A/B proxy against git-HEAD assets (identical seeded word list) measured 0.999897 / 0.999754, confining the stage-2 rendering delta to the caret footprint (stage-02 report §3). Determinism: the fresh scene was pixel-identical across independent capture runs (SHA-256 `395bec8d…`), and the mid-test scene differed only in timing-dependent wpm digits at 0.9997 similar (`validator-authoring.md` §3).

| Measurement | Value | Contract floor |
|---|---|---|
| O-UI-005 fresh-test similarity | 0.999897 | ≥ 0.85 (Δ16) |
| O-UI-005 mid-test similarity | 0.9996 | ≥ 0.85 (Δ16) |
| Contrast `--text` on `--bg` | 8.05:1 | ≥ 4.5 |
| Contrast `--error` on `--bg` (lifted `#cf5763`) | 3.09:1 | ≥ 3.0 (large-text) |
| Contrast `--caret` on `--bg` | 6.55:1 | ≥ 3.0 |
| Letter computed font-size | 25.6 px | ≥ 24 px (large-text clause) |
| `--bg` relative luminance | 0.0341 | ≤ 0.2, and L(text) > L(bg) |
| Error hue / saturation | h 354.0°, s 0.556 (error); h 353.6°, s 0.500 (error-extra) | h ∈ [0,15] ∪ [340,360], s ≥ 0.45 |
| Four-state pairwise color delta | 60–166 max-channel | ≥ 32 |
| Monospace advance | adv('i') = adv('m') = 15.36 px | equality ± 1 px |

Table 5: Coherence and charter measurements on the admitted candidate (`research/metrics/validator-loop.md` §3).

### 5.6 Deployment

The conformant build deployed on 2026-07-19 as a **new** Cloudflare Workers script `pdd-monkeytype-ui` — `https://pdd-monkeytype-ui.pdd-typing.workers.dev` — alongside the untouched baseline `pdd-monkeytype` (its `modified_on` timestamp verified unchanged pre/post deploy), both bound to the same KV namespace so accounts, results, and quotes are common to the two arms (`research/metrics/deployment.md`). The 69,814-byte bundle (gzip 21,610 bytes; SHA-256 `b907d708…`) staged in 12 chunks × ~2,500 characters under the KV-staged hash-gated pattern. The hash gate proved load-bearing again: **chunk 1 failed the gate twice** (2,482 and 2,483 characters staged versus 2,500 — silent agent-side re-emission losses), and after splitting into 625-character sub-chunks, **sub-chunk 1.1 failed deterministically** (a 1-character insertion `TJ`→`TqJ` at offset 336); all three corruptions were caught, re-staged clean, and the deploy call verified every chunk, the assembled chunk 1, and the full-bundle SHA-256 server-side before upload — fail-closed, zero corrupted bytes shipped (deployment.md, "Chunk staging"). Local pre-deploy smoke passed 21/21; live browser probes passed on all seven endpoints (`GET /` renders the typing UI; `/style.css` carries the `:root` charter with `--error: #cf5763`; `/app.js` carries the caret code; the isomorphic engine module serves verbatim; quotes and leaderboard shapes conform; unknown routes return the O-RES-004 envelope 404).

Figures 2 and 3 are the orchestrator-captured A/B screenshots of the two live arms.

![A/B baseline: live v2.2 (pdd-monkeytype)](../screenshots/ab-v22-baseline.png)

Figure 2: Live baseline arm `pdd-monkeytype` (v2.2, pre-caret) (`research/screenshots/ab-v22-baseline.png`). Orchestrator-captured; cross-host, qualitative only.

![A/B candidate: live v3.0 (pdd-monkeytype-ui)](../screenshots/ab-v30-candidate.png)

Figure 3: Live candidate arm `pdd-monkeytype-ui` carrying the ui-presentation v1.0.0-conformant build; the caret bar and active-word underline are visible on the first word (`research/screenshots/ab-v30-candidate.png`). Orchestrator-captured; cross-host, qualitative only — word lists differ between captures, so no pixel comparison is claimed.

Qualitatively, the candidate arm is aesthetically indistinguishable from the baseline at a glance — same dark family, same accent, same stream geometry — with the net-new caret and active-word marking now present, consistent with the O-UI-005 measurements of 0.999897/0.9996 (§5.5). Substitutability held as designed: the bundle constrains served client assets only, and the Workers candidate serves the same three public assets, so one sealed bundle governs both the Node/Express and Workers realizations with zero re-negotiation (§5.3; `round-01-author.md` §7).

### 5.7 Hypothesis Verdicts

**H1 is supported.** The two-tier contract carried persistent visual intent through sealing, implementation, and admission; its decisive stress case was unplanned — PSN-UI-01 — where a real palette defect was absorbed entirely inside delegated space at zero friction, "the sealed floor doing exactly its one job" (`round-03-postsealing-note.md`). **H2 is supported on friction and coherence**: 2 rounds, 4 negotiation blocking questions adjudicated in one round, 1 version event, 0 implementation blocking questions, admission on iteration 1, and screenshot similarity far inside the 0.85 tolerance (0.999897/0.9996); none of the three pre-registered failure modes (friction explosion, coherence collapse, validator cost blow-up) materialized. The deployment arm adds a live A/B demonstration with both candidates admitted under the same bundle. These are single-case results; §7 bounds their generality.
