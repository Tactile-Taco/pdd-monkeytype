# Protocol-Driven Development × Visual Design: A Two-Tier Contract for Persistent Visual Intent

## 1. Introduction

### 1.1 Background and Motivation

Protocol-Driven Development (PDD) inverts the conventional relationship between specification and code: the protocol — a sealed bundle of structural, behavioral, and operational invariants with typed handshakes, validator mappings, and evidence requirements — is the primary engineering artifact, and implementations are admitted only when machine-checked validators produce signed evidence of conformance [1]. In the PDD reference architecture, "generation proposes; validation decides": an implementation generator never self-declares validity, and admission is an evidence-chained event over the tuple of protocol, implementation, validators, and results [1]. The approach has been positioned as a governance answer to generated software, where the volume and opacity of machine-written code make review-centric quality assurance untenable [2].

PDD's strength is precisely its demand for exactitude — and that demand is also its boundary. Visual design is a counterexample waiting to happen. A user interface carries genuine persistent intent (the word stream must read in order; error states must be perceptually distinct; the palette must remain a dark, red-accented family), but that intent resists exact protocolization: pixel-perfect sealing would freeze every cosmetic decision into the contract and destroy implementer latitude and candidate substitutability, while pure delegation would lose the coherence that makes the product recognizable. Whether a presentation layer can be absorbed into PDD without either failure mode — friction explosion on one side, coherence collapse on the other — is an open, empirical question.

### 1.2 Research Gap and Problem Statement

The pdd-monkeytype project previously applied PDD to a seven-protocol typing-test system derived from the monkeytype reference application, covering engine semantics, results, accounts, configuration, quotes, leaderboards, and anticheat — all non-visual concerns (`docs/02-protocol-derivation.md`, `docs/08-retrospective.md`). The presentation layer was deliberately left outside the sealed perimeter. This paper reports the follow-on experiment that protocolized it (`/mnt/agents/work/plan-ui-research.md`). The research question: *how can transient, non-essential decisions (visual design) with some persistent consistency requirements be absorbed into PDD with minimal friction?* The problem statement is concrete and falsifiable: define a contract that (i) carries persistent visual intent in machine-checkable form, (ii) leaves transient cosmetics to implementer latitude, and (iii) keeps measured friction — negotiation rounds, blocking questions, version events, validator cost — within pre-registered budgets, failing which the approach is rejected.

### 1.3 Contributions

This paper makes four contributions, each grounded in the project's recorded artifacts.

#### 1.3.1 A two-tier contract for visual intent (H1)

We define and seal a contract splitting visual intent into (i) machine-checkable presentation invariants — DOM-structural assertions, behavioral coupling to engine handshakes, and computed-style constraints such as WCAG contrast floors — and (ii) a design-token charter of named CSS custom properties governed by tolerance bands rather than exact values (`protocols/ui-presentation/`). The sealed bundle carried 14 `must` and 3 `should` invariants, and its delegated space subsequently absorbed a real palette defect at zero friction cost (§5.2.2).

#### 1.3.2 Negotiation-scoped orchestration as a friction-control mechanism (H2)

We operationalize a hard rule — the orchestrator affects visuals only by negotiating with the protocol author, never by instructing implementers on interpretation — and account its friction: 2 negotiation rounds, 4 blocking questions all adjudicated in a single round, 1 version event, and 0 blocking questions during implementation (`research/negotiation/`, `research/implementation/blocking-questions.md`).

#### 1.3.3 A costed validator toolchain for presentation

We show that presentation invariants are economically machine-checkable with a specific toolchain — headless-Chromium computed-style assertion, WCAG luminance and RGB→HSL mathematics, canvas `measureText` monospace checks, MutationObserver mutation confinement, an engine-oracle keystroke fuzzer, and host-pinned screenshot similarity with explicit tolerance bands — admitting the candidate on iteration 1 in 92.9 s (`research/metrics/validator-loop.md`).

#### 1.3.4 An honest defect and failure record

We report the failures as faithfully as the successes: an internal contradiction in the stakeholder's own intent set surfaced only by the counterparty (P2); an *unverified admission claim* that both parties missed and that a new defect class is required to name (PSN-UI-01); two pre-existing implementation defects exposed by the sealed invariants (R1/R2); and 10 protocol-text insufficiencies found during validator authoring (`research/negotiation/round-03-postsealing-note.md`, `research/metrics/validator-authoring.md`).

### 1.4 Paper Organization

Section 2 reviews PDD, the critical-ambiguity mechanism, and the host system. Section 3 states the hypotheses, the design options compared, and the metrics. Section 4 describes the negotiation method and friction accounting. Section 5 reports results stage by stage, including the deployment arm. Section 6 interprets the findings and their tradeoffs. Section 7 lists threats to validity, Section 8 future work, and Section 9 concludes.
