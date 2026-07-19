# Protocol-Driven Development × Visual Design — Paper Outline

Working title: **Protocol-Driven Development × Visual Design: A Two-Tier Contract for Persistent Visual Intent**

Type: empirical case study (single-case, mixed case-study + empirical style). Register: academic, third person, exact numbers from source artifacts only. Project artifacts cited inline by path; external works numbered in References.

Research question (from `/mnt/agents/work/plan-ui-research.md`): How can transient, non-essential decisions (visual design) with some *persistent* consistency requirements be absorbed into PDD ("protocol is the primary engineering artifact") with minimal friction?

Contribution statement:
1. A **two-tier contract** for visual intent — sealed machine-checkable presentation invariants + a design-token charter with tolerance bands — shown to carry persistent visual intent while transient cosmetics stay delegated (H1).
2. **Negotiation-scoped orchestration** as a friction-control mechanism: orchestrator affects visuals only via negotiation with the protocol author (H2); measured friction ledger over the full pipeline.
3. A **validator toolchain for presentation** (headless-Chromium computed-style assertion, WCAG/HSL math, canvas measureText, MutationObserver confinement, engine-oracle fuzz, host-pinned screenshot similarity) with measured cost (92.9 s suite; admission on iteration 1).
4. An honest defect/failure record: P2 internal-conflict surfacing, the missed "unverified admission claim" (PSN-UI-01), pre-existing defects R1/R2, B-ACC-001 flake, 10 protocol-text insufficiencies.

# Paper Title

## Abstract (~250 words) — written LAST
### Research Summary
#### PDD governs generated software through sealed invariant protocols; visual design resists precise protocolization
#### RQ: absorb visual design into PDD with minimal friction
#### Method: 2-party negotiation → sealed ui-presentation bundle (14 must / 3 should) → isolated implementation → validator loop → deployment
#### Results: 2 negotiation rounds; 0 implementation blocking questions; admission iteration 1; 92.9 s suite; screenshot similarity 0.999897/0.9996 vs ≥0.85 floor; PSN-UI-01 absorbed at zero friction
#### Significance: persistent/transient split is the load-bearing mechanism; unverified admission claims identified as a new defect class

## 1. Introduction (~800 words)
### 1.1 Background and Motivation
#### 1.1.1 PDD: protocol is the primary engineering artifact [1][2]; evidence-chained admission
#### 1.1.2 The tension: visual design is intent-laden but resists exact specification; pixel sealing kills substitutability; pure delegation loses coherence
### 1.2 Research Gap and Problem Statement
#### 1.2.1 No recorded PDD application to a presentation layer; friction behavior unknown
#### 1.2.2 Problem statement: carry persistent visual intent, delegate transient cosmetics, bound friction
### 1.3 Contributions (4 items above, each previewing a result)
### 1.4 Paper Organization

## 2. Background (~900 words)
### 2.1 Protocol-Driven Development
#### 2.1.1 P=(S,B,O) invariants, must/should severity, sealing, handshakes [1]
#### 2.1.2 Validator loops and evidence chains E=H(P,I,V,R,t); "generation proposes; validation decides" [1]
### 2.2 Critical Ambiguity and CA-001
#### 2.2.1 Cosmetic vs critical taxonomy; rules (ask, never silently assume; version events) (docs/10-critical-ambiguity-CA-001.md)
#### 2.2.2 CA-001 case: B-ENG-005 "current word", v1.0.0→v1.1.0 remediation
### 2.3 The pdd-monkeytype System
#### 2.3.1 7 sealed protocols derived from monkeytype v26.28.0 (docs/02-protocol-derivation.md); 6-iteration first loop; defect attribution (docs/08-retrospective.md)
#### 2.3.2 Two co-admitted candidates: Node/Express + Cloudflare Workers v2.2 live (docs/09-cloudflare-deployment.md)

## 3. Hypotheses and Design (~900 words, 2 tables)
### 3.1 H1 — Two-Tier Contract
#### 3.1.1 Tier 1: sealed machine-checkable invariants (DOM structure, behavioral coupling, computed-style constraints)
#### 3.1.2 Tier 2: design-token charter — named tokens, tolerance bands, not exact values
### 3.2 H2 — Negotiation-Scoped Orchestration
#### 3.2.1 Orchestrator never instructs implementers on visual interpretation (hard rule)
#### 3.2.2 Predicted outcomes: coherence within tolerance; bounded churn; CA-001-triaged blocking questions
### 3.3 Options Compared (Table 1: pixel sealing / DOM-structural only / token charter [chosen] / pure delegation)
### 3.4 Metrics (Table 2: friction, coherence, cost metrics + failure-mode thresholds)

## 4. Method (~800 words, 1 mermaid figure)
### 4.1 Roles and Negotiation Protocol
#### 4.1.1 Orchestrator (reference-informed) ↔ protocol author; positions → counterproposals → adjudication → seal
#### 4.1.2 Friction accounting: rounds, blocking questions, version events, must-budget ≤14
### 4.2 Pipeline (Stages 0–4) (Figure 1: mermaid flow)
#### 4.2.1 Stage 0 baseline; Stage 1 negotiate+seal; Stage 2 isolated implementation; Stage 3 validator loop; Stage 4 deploy
### 4.3 Interpretive Firewall and Data Sources
#### 4.3.1 Implementer receives ONLY sealed bundle; blocking questions relayed uninterpreted
#### 4.3.2 Research data: negotiation transcript, stage reports, validator metrics, harness outputs

## 5. Results (~1,900 words, 4 tables)
### 5.1 Negotiation Outcomes
#### 5.1.1 2 rounds (expected 2–3); 17 invariants sealed as v1.0.0: 14 must / 3 should (Table 3: friction ledger)
#### 5.1.2 Pushbacks P1–P6; questions Q1–Q4 adjudicated in one round
### 5.2 Ambiguity and Conflict Record
#### 5.2.1 CA-UI-01 caret semantics resolved by definition; P2 internal conflict surfaced by author, missed by orchestrator
#### 5.2.2 PSN-UI-01: unverified admission claim missed by BOTH parties; delegated absorption (#ca4754→#cf5763, 2.70→3.09:1), zero friction
### 5.3 Implementation Under the Firewall
#### 5.3.1 0 blocking questions; 11 delegated decisions; repairs R1 (mutation storm) and R2 (completing keystroke)
#### 5.3.2 Regression: 19/37/12 pass before→after; 388-assertion scripted self-check
### 5.4 Validator Loop
#### 5.4.1 Admission on iteration 1 (19/19 checks); 92.9 s standalone; 130 s full loop (Table 4: runtimes)
#### 5.4.2 10 protocol-text insufficiencies: 0 blocking, 8 worked around, 2 latent; B-ACC-001 pre-existing flake
### 5.5 Visual Coherence Measurements
#### 5.5.1 O-UI-005: fresh 0.999897, mid-test 0.9996 (floor 0.85, Δ16); caret footprint ~0.01% as predicted (Table 5)
#### 5.5.2 Contrast/bands: text 8.05, error 3.09, caret 6.55; 25.6px large-text; 4-state deltas 60–166 ≥ 32; adv equality 15.36px
### 5.6 Deployment (structure in place; numbers [TBD: deployment.md])
### 5.7 Hypothesis Verdicts
#### 5.7.1 H1 supported (with PSN-UI-01 as the decisive zero-friction absorption case)
#### 5.7.2 H2 supported on friction/coherence; deployment arm pending [TBD]

## 6. Discussion (~1,400 words)
### 6.1 Why Friction Stayed Low
#### 6.1.1 The two-tier split did the work: every stage-2/3 ambiguity was decidable from normative text
#### 6.1.2 Negotiation as intent-correction (P2), not just text-correction; mediated specificity (echoes docs/08)
### 6.2 The Toolchain That Made Presentation Machine-Checkable
#### 6.2.1 Headless-Chromium substrate (P1 correction of jsdom assumption); computed-style + WCAG/HSL math; canvas measureText; MutationObserver confinement; engine-oracle fuzz; host-pinned screenshot similarity
### 6.3 Failures and Surprises (honest ledger)
#### 6.3.1 P2 contradiction missed by orchestrator; admission claim missed by both → "unverified admission claim" defect class
#### 6.3.2 R1/R2 pre-existing defects; B-ACC-001 flake; replica-captured baseline (egress block)
### 6.4 Tradeoffs
#### 6.4.1 Class-vocabulary sealing vs portability; host-pinned baselines; tolerance-band fragility; validator authoring cost (10 insufficiencies)

## 7. Threats to Validity (~400 words)
### 7.1 Single UI, single team, single negotiation pair
### 7.2 Reference-informed orchestrator; no independent re-implementation; oracle shares lineage with repo engine
### 7.3 Screenshot similarity as a weak proxy for coherence; replica baseline; single host image

## 8. Future Work (~350 words)
### 8.1 Mockup-driven iteration; 8.2 multi-theme promotion (B-UI-005 should→must + catalog handshake); 8.3 seal DOM identity hooks (validator recommendation); 8.4 live-origin baseline recapture; cross-host strategies; replication

## 9. Conclusion (~250 words)
### 9.1 Summary of contributions with actual numbers; 9.2 takeaway sentence

# References
1. Paper A — Protocol-Driven Development: Governing Generated Software Through Invariants and Continuous Evidence (arXiv:2605.12981v3)
2. Paper B — Post-Deterministic Distributed Systems (arXiv:2606.01722v1)
3. monkeytype reference (github.com/monkeytypegame/monkeytype @ v26.28.0)
4. W3C WCAG 2.x (relative luminance / contrast ratio)
5. openkedge/pdd-protocol-author skill

# Appendix A: Artifact index (path → role table)

## Word budget total: ~7,900 words. Tables: 5. Figures: 1 mermaid.
