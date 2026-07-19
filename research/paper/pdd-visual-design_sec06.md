## 6. Discussion

### 6.1 Why Friction Stayed Low

The pre-registered worry was friction explosion: a presentation layer was expected to generate a stream of "what did you mean by *this*?" questions from an implementer forbidden to ask for clarification informally. Zero blocking questions materialized. Retrospectively, the mechanism is visible in the data: every ambiguity that actually arose during implementation was decidable from normative text because the two-tier split had already routed each decision to the right place. Mechanism questions (what position is the caret? which words may mutate?) were settled by tier-1 definitions — CA-UI-01's resolution-by-definition is the clearest case, converting an unbounded design question into a 2 px arithmetic one. Value questions (which exact red?) were settled by tier-2 delegation — PSN-UI-01 is the decisive case: the implementer did not need anyone's permission to move `#ca4754` to `#cf5763`, because S-UI-004 seals names and delegates values within bands, and the P2 adjudication had already established that the floor, not the palette, was the persistent intent. The contract did not merely tolerate the repair; it made the repair *unremarkable*, which is exactly the behavior the hypothesis claimed.

A second contributor echoes the prior retrospective's finding that "constraint-driven specificity is a feature, not a cost" (`docs/08-retrospective.md` §4): negotiation forced intents into testable statements before code existed. The P2 episode extends that finding in a direction worth stating plainly — the counterparty surfaced a contradiction *inside the stakeholder's own intent set* (accessibility floor versus palette fidelity) that the stakeholder had not detected itself, and negotiation corrected the intent, not just the text. Negotiation here functioned as an intent-debugging protocol, not a requirements-handoff ceremony.

### 6.2 The Toolchain That Made Presentation Machine-Checkable

Six tools did the work, each mapping to a class of visual intent (`research/metrics/validator-authoring.md`, `protocols/ui-presentation/validators/`):

#### 6.2.1 Headless-Chromium computed-style assertion

The single most important tooling decision was P1's substrate correction: presentation invariants are layout claims, and only a real layout engine can evaluate them. One amortized browser session (Chrome/150.0.7871.114) carries the whole suite, keeping the 19-check admission run at 92.9 s with fuzz dominating (~1.4 s/run).

#### 6.2.2 WCAG and HSL mathematics

Contrast floors and hue/saturation bands reduce palette intent to arithmetic over computed colors (WCAG 2.x relative luminance; RGB→HSL). The color module was verified against every protocol-cited reference value (`#ca4754`/`#323437` = 2.700; `#7e2a33` s = 0.500; extra~untyped Δ = 60) before it was trusted to judge candidates — validators need their own admission discipline.

#### 6.2.3 Canvas `measureText`

"Monospace" became adv('i') = adv('m') within 1 px under the computed font — the machine-checkable essence of the property without sealing any font stack.

#### 6.2.4 MutationObserver confinement

"No reflow of committed words" became a set-inclusion assertion over per-keystroke mutation records. The value-aware recorder (ignoring no-op attribute touches) was itself a negotiation-adjacent decision: a literal reading fails the reference aesthetic, which fires no-op `classList.remove` calls (insufficiency #3) — and once the candidate repaired that cause (R1), record volume dropped 40% (46,018 → 27,581), a rare case where a validator's workaround and an implementation fix corroborate each other.

#### 6.2.5 Engine-oracle fuzz

Per-letter fidelity (B-UI-002) is a coupling claim between DOM and engine state; it was checked by replaying seeded, state-aware keystroke streams against an independent engine oracle — itself cross-checked against the repository engine over 25 seeded streams, with a mutation-sanity step proving the comparator non-vacuous. 2,093 fuzz steps passed on the admitted candidate.

#### 6.2.6 Host-pinned screenshot similarity with tolerance

The one screenshot invariant worked because its determinism was engineered, not hoped for: seeded `Math.random`, pinned APIs, fixed viewport, and a host image identity (`sha256` over Chromium version, OS, font-rasterization probe, viewport) that makes cross-host comparison fail closed rather than silently flap. The 0.85@Δ16 band then absorbed exactly the deltas it was designed to absorb — the caret footprint and live-stats digit jitter — and nothing more.

A seventh tool belongs to this list even though it sits outside the validator suite: the **KV-staged hash-gated deployment channel**. The v2.2 postmortem had shown the paste-based upload channel to be lossy (two silent string-literal corruptions, each detected only by hashing; `docs/09-cloudflare-deployment.md`), and the pattern built in response — per-chunk SHA-256 gates, server-side assembly, full-bundle verification before upload — proved itself again in this deployment, catching **three** silent corruptions in one 12-chunk transfer (chunk 1 twice at 18- and 17-character losses; a 1-character `TJ`→`TqJ` insertion in sub-chunk 1.1) (`research/metrics/deployment.md`). The lesson generalizes the validator-loop theme: *fail-closed verification gates are load-bearing at every trust boundary, including the one between the agent and its own tools.* A deploy channel without the hash gate would have shipped a corrupted bundle while reporting success — the deployment analogue of a blind validator that looks exactly like a passing one (`docs/08-retrospective.md` §3).

### 6.3 Failures and Surprises

Four honest negatives temper the positive ledger. First, the **P2 contradiction**: the orchestrator — the party with the most context — was the one that missed its own internal conflict; detection required a counterparty incentivized to reconcile intents against measurements. Second, the **unverified admission claim**: having correctly surfaced P2, both parties then believed the 3.0 floor "preserved the reference aesthetic" without checking the one token it fails. The defect class matters more than the instance: rationale text makes admission claims about bounds, and those claims are checkable arithmetic that nobody checked. The new authoring rule (verify "this bound admits the reference" numerically for every covered value before sealing) is a direct generalization. Third, **R1/R2**: the sealed invariants exposed two genuine pre-existing defects — a mutation storm and a completing-keystroke staleness — in a UI that had passed every prior loop and looked correct in manual testing; invariant-first contracts find bugs that aesthetic inspection does not. Fourth, operational surprises: the sandbox egress block forced the O-UI-005 baseline to be captured from a byte-faithful pinned replica rather than the live origin (with the host-pinning rule making this fail-closed: recapture on the validation host is mandatory, not optional), and the pre-existing B-ACC-001 flake reappeared once during the final loop — reported, reproduced as passing 4/4, and deliberately left unpatched outside the delegated scope (`validator-loop.md` §6).

### 6.4 Tradeoffs

The chosen point in the design space is not free, and the artifacts price it. **Class-vocabulary sealing versus portability**: sealing `correct`/`incorrect`/`extra` verbatim buys cheap, unambiguous validators, but a second client with a different DOM dialect would not merely need re-validation — it would need a contract change (P6 accepted this consciously; insufficiency #1 records the same tension one level down, where the unsealed identity hooks `.word`/`#words`/`data-wi`/`#caret` are today's workaround and tomorrow's proposed minor text event). **Host-pinned baselines**: they make screenshot coherence reproducible and make cross-host comparison impossible — portability of the evidence is traded for its integrity. **Tolerance-band fragility**: every band edge is a potential flap point; P3 (saturation floor 0.50 → 0.45 because the reference value measures 0.500 to rounding) shows bands must be set with measurement error in the room, and the ~150× absorbance margin measured for the screenshot band is the kind of headroom evidence a band needs (`validator-authoring.md` §7). **Validator authoring cost**: the suite is not cheap to write — 10 protocol-text insufficiencies had to be resolved at authoring time — and the runtime estimates survived contact with reality (≈ 1 min default estimated, 92.9 s actual; ≈ 5 min nightly estimated and projected) only because the substrate was corrected during negotiation (P1) rather than discovered mid-build. Against this stands the measured operating cost: 92.9 s per admission, zero fix iterations, and a one-time authoring investment that any future candidate reuses unchanged.
