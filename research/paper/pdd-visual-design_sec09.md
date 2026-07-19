## 9. Conclusion

Visual design can live inside Protocol-Driven Development, but only after it is split in two. In this case study, the split — machine-checkable presentation invariants plus a design-token charter with tolerance bands, negotiated under a rule that keeps all visual intent inside sealed text — carried a real presentation layer from negotiation to live deployment with 2 negotiation rounds, 14 `must` and 3 `should` invariants, 4 negotiation blocking questions resolved in one round, 0 implementation blocking questions, and validator admission on iteration 1 at 92.9 s per run, while screenshot coherence held at 0.999897/0.9996 against a 0.85 floor. The contract's hardest test was one it did not anticipate: a palette defect both negotiating parties missed, repaired by the implementer inside delegated space at zero friction — the two-tier design doing its one job. The same discipline that made the loop work also named its own failures, from a stakeholder's self-contradictory intent set to the new defect class of unverified admission claims. The takeaway: what makes visual intent protocolizable is not precision about pixels, but precision about which decisions are persistent and which are permitted to be free.

# References

[1] *Protocol-Driven Development: Governing Generated Software Through Invariants and Continuous Evidence*, arXiv:2605.12981v3. (Assessed in `docs/01-skill-assessment.md`.)

[2] *Post-Deterministic Distributed Systems*, arXiv:2606.01722v1. (Assessed in `docs/01-skill-assessment.md`.)

[3] monkeytype reference application, `github.com/monkeytypegame/monkeytype` @ master (v26.28.0). Derivation inventory in `docs/02-protocol-derivation.md`.

[4] W3C, *Web Content Accessibility Guidelines (WCAG) 2.x* — relative-luminance and contrast-ratio definitions used by O-UI-001/O-UI-002 and `validators/lib/color.mjs`.

[5] `openkedge/pdd-protocol-author` skill package (bundle anatomy, sealing workflow, linter). Assessment in `docs/01-skill-assessment.md`.

# Appendix A: Artifact Index

| Path | Role in this paper |
|---|---|
| `/mnt/agents/work/plan-ui-research.md` | Research question, H1/H2, metrics, options, stages |
| `research/negotiation/round-01-orchestrator.md` | Round-1 opening positions (six persistent intents, delegated cosmetics, budgets) |
| `research/negotiation/round-01-author.md` | Round-1 counterproposal (verdicts, P1–P6, Q1–Q4, cost estimates) |
| `research/negotiation/round-02-orchestrator.md` | Round-2 adjudications, P2 research note |
| `research/negotiation/round-02-author.md` | Seal record (14 must / 3 should; ambiguity balance sheet) |
| `research/negotiation/round-03-postsealing-note.md` | PSN-UI-01: unverified admission claim, zero-friction absorption |
| `protocols/ui-presentation/` | Sealed bundle v1.0.0 (protocol.yaml, invariants/, ambiguity-log.md, validators/, evidence/baseline/) |
| `research/implementation/stage-02-report.md` | Implementation record (11 delegated decisions, R1/R2, regressions, 388-assertion self-check) |
| `research/implementation/blocking-questions.md` | 0 blocking questions; decidable-item reasoning |
| `research/metrics/validator-authoring.md` | Suite structure, 90.7 s smoke vs v2.2, 10 insufficiencies, baseline manifest |
| `research/metrics/validator-loop.md` | Iteration-1 admission, 92.9 s / 130 s runtimes, insufficiency friction accounting, B-ACC-001 flake |
| `research/metrics/deployment.md` | `pdd-monkeytype-ui` deploy: 69,814 B bundle, 12 chunks, 3 caught corruptions, live probes |
| `research/screenshots/ab-v22-baseline.png`, `ab-v30-candidate.png` | Live A/B captures (Figures 2–3) |
| `docs/08-retrospective.md`, `docs/09-cloudflare-deployment.md`, `docs/10-critical-ambiguity-CA-001.md` | Prior-loop retrospective; deployment pattern + postmortem; CA-001 mechanism |
| `harness/out/ui-presentation.json`, `evidence/admission-summary.json` | Machine-readable admission evidence (ui-presentation: admit, 19 checks; 8/8 protocols) |
