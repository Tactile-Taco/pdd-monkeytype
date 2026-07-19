## 3. Hypotheses and Design

### 3.1 H1 — The Two-Tier Contract

The first hypothesis concerns the shape of the contract itself (`/mnt/agents/work/plan-ui-research.md`):

> **H1.** A two-tier contract — (i) sealed, machine-checkable presentation invariants (DOM-structural assertions; behavioral coupling to engine handshakes; computed-style constraints such as WCAG contrast) plus (ii) a bounded design-token charter (named tokens with tolerance bands, not exact values) — can carry persistent visual intent through PDD while transient cosmetics stay delegated to implementer latitude.

#### 3.1.1 Tier 1: machine-checkable presentation invariants

Tier 1 pins what a machine can decide: the word stream exists as one element per engine target word in reading order (S-UI-001); every letter carries at most one state class from a sealed vocabulary `{correct, incorrect, extra}` (S-UI-002); exactly one active word tracks the engine's `wordIndex` (S-UI-003); a caret element tracks a *defined* logical caret position within 2 px after every keystroke (B-UI-001); per-letter classes equal the engine's accounting after every keystroke (B-UI-002); committed words are not re-rendered (B-UI-003, formulated as mutation confinement); the results view renders the CompletedEvent payload exactly (B-UI-004) (`protocols/ui-presentation/invariants/`). The common move is to seal *mechanism* (a DOM class, a defined position, an exact value) while delegating *style* (how the active word is decorated, what the caret looks like).

#### 3.1.2 Tier 2: the design-token charter

Tier 2 carries palette-level intent without freezing it: seven token *names* are sealed on `:root` (`--bg --main --caret --text --sub --error --error-extra`, S-UI-004), while token *values* are delegated within bands — WCAG contrast floors (text ≥ 4.5, error and caret ≥ 3.0 with a large-text clause, O-UI-001), a dark-family luminance band with a red error hue/saturation band (O-UI-002), pairwise four-state color distinction of ≥ 32 max-channel delta (O-UI-003), and monospace advance equality within 1 px (O-UI-004) (`protocols/ui-presentation/invariants/operational.yaml`). A single screenshot-coherence invariant (O-UI-005, ≥ 85% of pixels within per-channel delta 16 against a host-pinned baseline, two scenes) guards global coherence as a backstop rather than a primary mechanism. H1 predicts this split suffices: palette defects are repairable inside delegated space without escalation, and coherence holds without pixel sealing.

### 3.2 H2 — Negotiation-Scoped Orchestration

The second hypothesis concerns who may speak about visuals (`/mnt/agents/work/plan-ui-research.md`):

> **H2.** Under negotiation-scoped orchestration — the orchestrator affects visuals only by negotiating with the protocol author, never by instructing implementers on interpretation — visual coherence is preserved (screenshot similarity versus the reference-informed baseline within tolerance) with bounded churn (few version events; blocking questions triaged by the CA-001 critical-ambiguity mechanism).

The hard rule is absolute: all visual intent flows through negotiation into sealed bundle text; implementer ambiguities surface only as blocking questions relayed uninterpreted to the author, and resolve as version events or ambiguity-log entries. H2's predicted failure modes are friction explosion (too many blocking questions), coherence collapse (similarity below tolerance), and validator cost blow-up; the experiment is designed so that any of these falsifies it.

### 3.3 Options Compared

Four contract shapes were considered in the plan (`/mnt/agents/work/plan-ui-research.md`); Table 1 summarizes the tradeoffs that motivated the choice.

| Option | What is sealed | Coherence guarantee | Implementer latitude | Validator cost | Substitutability impact |
|---|---|---|---|---|---|
| (1) Full pixel sealing | Exact rendered output (screenshot equality) | Strongest, brittle | None — every cosmetic is contractual | High (host-pinned captures everywhere; flapping) | Severe: pins font rasterization, viewport, theme |
| (2) DOM-structural only | Structure, classes, reading order | Weak: a conformant DOM can still be illegible (contrast, indistinguishable states) | Full on all computed style | Low | Unaffected, but intent lost |
| (3) Token charter + tolerance bands (**chosen**) | Mechanism + token names + bands; one screenshot backstop | Moderate, explicit: bands + 0.85@Δ16 similarity | Values within bands; all unlisted cosmetics | Moderate (measured §5.4) | Preserved: constrains served client assets only |
| (4) Pure delegation (status quo ante) | Nothing | None — coherence is convention, not contract | Full | Zero | Unaffected; no evidence of anything |

Table 1: Contract-shape options for the presentation layer. Option 3 was chosen as the point that maximizes machine-checkable intent per unit of validator cost while keeping the Node/Express and Workers candidates co-admissible under one bundle.

The comparison turns on where each option puts the brittleness. Option 1 places it in the evidence: pixel equality is host-, font-, and timing-sensitive, so every admission becomes a negotiation with rasterization noise, and the one screenshot invariant that option 3 retains as a backstop would have to carry the entire contract. Option 2 places the brittleness in the intent: structure alone cannot distinguish a legible stream from an illegible one, so the contract would admit implementations that violate the aesthetic it exists to protect — coherence collapse by construction. Option 4 is the honest zero point and the status quo ante: it costs nothing and evidences nothing, leaving coherence to convention. Option 3 accepts a moderate, explicitly priced validator cost — the arithmetic bands of tier 2 plus one tolerance-banded screenshot invariant — in exchange for making the persistent/transient boundary itself a sealed, reviewable artifact.

### 3.4 Metrics

The plan pre-registers the measurement set (`/mnt/agents/work/plan-ui-research.md`); Table 2 lists each metric, its source artifact, and the failure mode it watches.

| Metric | Definition | Source | Failure mode watched |
|---|---|---|---|
| Negotiation rounds | Position/counterproposal rounds to seal | `research/negotiation/` | Friction explosion (budget: 2–3) |
| Blocking questions | Critical (behavior-changing, not decidable from text) questions, by class | `research/implementation/blocking-questions.md` | Friction explosion |
| Version events | Sealed-bundle version changes | `protocols/ui-presentation/protocol.yaml` | Churn |
| Must budget | Count of `must` invariants (≤ 14 approved) | `research/negotiation/round-02-author.md` | Validator cost blow-up |
| Validator count/runtime/failures | Checks, wall clock, fix iterations to admission | `research/metrics/validator-loop.md` | Validator cost blow-up |
| Screenshot similarity | Similar-pixel fraction (Δ16) vs host-pinned baseline, 2 scenes | O-UI-005 evidence | Coherence collapse (floor 0.85) |
| Contrast ratios | WCAG 2.x computed-style measurements | O-UI-001 evidence | Illegibility |
| Substitutability | Node + Workers candidates pass the same bundle | §5.6 | Bundle overreach onto server surface |

Table 2: Pre-registered metrics and the failure mode each one watches.

Two properties of this metric set matter for reading the results. First, every metric is *falsifying*: each has a pre-registered direction in which the corresponding hypothesis fails — rounds beyond 2–3, any critical blocking question left unresolved, version-event churn, similarity below 0.85, validator runtimes that price admission out of the loop. The experiment was therefore capable of losing, which is what makes the outcome evidence rather than narration. Second, the metrics are deliberately process-shaped rather than outcome-shaped: they measure the cost of carrying intent through the protocol (rounds, questions, events, seconds) alongside the coherence that intent bought (similarity, contrast). The separation lets §5 attribute causes — a coherence success with a friction explosion would have falsified H2 while confirming the bands, and the pre-registration prevents quietly re-weighting the ledger after the fact.
