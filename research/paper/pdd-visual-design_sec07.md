## 7. Threats to Validity

### 7.1 Construct Validity

Screenshot similarity is a weak proxy for "visual coherence." The 0.999897/0.9996 measurements establish that the candidate did not drift from the baseline — they do not establish that the baseline is good, that users perceive the two arms as equivalent, or that the bands encode the right intents. The contract operationalizes coherence as *measured conformance to a reference-informed baseline plus arithmetic bands*; broader claims (aesthetics, usability) are outside its evidence. Likewise, "friction" is counted in rounds, questions, version events, and seconds — the ledger is exact, but it measures process cost, not cognitive effort.

### 7.2 Internal Validity

Three confounds qualify the friction result. (i) The **orchestrator was reference-informed**: it negotiated with the live v2.2 aesthetic in view, so the contract was fitted to an outcome already known to be achievable; a greenfield intent set would likely cost more rounds. (ii) **No independent re-implementation** was attempted: a single implementer built a single candidate, so "0 blocking questions" is one draw, and the implementer's reference lineage (it modified the existing UI rather than writing from the bundle alone) stacks the deck toward decidability. (iii) The **engine oracle shares lineage** with the repository engine it judges (cross-checked over 25 seeded streams, with a killed mutant as the non-vacuity guard) — adequate here, but not an independent specification. The B-ACC-001 flake is reported as observed; its mechanism was not isolated.

### 7.3 External Validity

This is a single case: one UI (a typing-test front end with an unusually regular, text-dominated surface), one team of agents, one negotiation pair, one host image. The word-stream UI is arguably *easy* for this method — its intents discretize cleanly into classes, positions, and color bands; image-heavy, animation-heavy, or responsive-multi-breakpoint interfaces may not. The baseline itself was captured from a pinned replica under an egress block (byte-faithfulness verified for the stylesheet; `validator-authoring.md` §2), and the A/B screenshots are cross-host and qualitative. Single cases suggest; they do not prove (`case-study` discipline). The substitutability claim is likewise bounded: both candidates serve identical client assets by construction, so the experiment demonstrates *co-admission* of two server realizations, not two independently designed UIs.

## 8. Future Work

### 8.1 Mockup-Driven Iteration

The negotiation protocol currently transmits intent as text and measured palettes. A natural extension lets the orchestrator supply mockups as baseline artifacts — replacing the reference-informed-origin assumption with an intent-artifact the contract can point to — and re-baselining as a governed minor version event, the path already recorded for the post-caret re-baseline (O-UI-005).

### 8.2 Multi-Theme Promotion

Q2 deferred multi-theme support to keep this iteration's friction low: B-UI-005 sits at `should`, the catalog is transient, and themes arrive as a config value. The recorded upgrade path — promote B-UI-005 to `must` and add a catalog handshake as a minor version event (`protocols/ui-presentation/invariants/behavioral.yaml`) — is a clean next experiment, because it tests whether the charter scales from one governed theme to a governed family without renegotiating the bands.

### 8.3 Sealing the DOM Identity Hooks

The validator's own top recommendation (insufficiency #1): seal the discovery hooks — `.word`, `#words`, `data-wi`, the caret selector — or mandate a `data-*` contract, so that divergent-but-conformant candidates are discoverable without validator configuration. Insufficiency #5 (theme schema's authored-hex clause versus computed `rgb()` values) needs a one-line adjudication in the same text event.

### 8.4 Replication and Hardening

Priorities: an independent implementer working from the bundle alone (the sharpest test of the firewall claim); a second team and a non-reference-informed orchestrator; live-origin baseline recapture on the CI host that will run candidate validation (mandatory under the same-host rule before first admission there, `validator-authoring.md` §4); cross-host baseline strategies if the evidence must travel; and tolerance-band sensitivity studies to learn how much headroom bands need before they stop flapping and start biting.
