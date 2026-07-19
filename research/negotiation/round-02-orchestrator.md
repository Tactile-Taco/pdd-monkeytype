# Negotiation Round 2 — Orchestrator adjudication

Date: 2026-07-19. Counterparty: protocol author (ui-presentation). Input: round-01-author.md.

## Adjudications
- **P1 (validator substrate)** — ACCEPTED: puppeteer-core + headless Chromium, one browser
  session; harness/manual-ui.mjs precedent. (Corrects orchestrator's jsdom assumption:
  no layout engine ⇒ no rects/contrast/screenshot fidelity.)
- **P2 (error contrast conflict)** — ACCEPTED author's resolution: error-on-bg floor 3.0
  via WCAG large-text rule (letters ≥24px computed, asserted same pass). Persistent intent
  ruled to be the *principled accessibility floor*, not the specific 4.5 value; reference
  palette (#ca4754 on #323437 = 2.70:1 measured) preserved. RESEARCH NOTE: negotiation
  surfaced an internal contradiction between two orchestrator intents (accessibility floor
  vs reference palette fidelity) that the orchestrator had not detected itself.
- **P3 (error saturation floor 0.45)** — ACCEPTED (avoids float-rounding flapping on #7e2a33).
- **P4 (caret is net-new)** — ACKNOWLEDGED; stage-2 implementation scope.
- **P5/Q1 (screenshot baseline)** — ACCEPTED v2.2 pre-caret baseline, with host-pinning
  refinement: validator harness captures its OWN baseline of the live v2.2 origin
  (https://pdd-monkeytype.pdd-typing.workers.dev) at authoring time, stored under
  protocols/ui-presentation/evidence/baseline/; same-host comparisons only; re-baseline
  post-caret via minor version event.
- **P6 (class vocabulary verbatim)** — ACCEPTED; single client dialect, indirection unjustified.
- **Q2 (multi-theme)** — B-UI-005 stays SHOULD; catalog transient, config value only, no theme
  endpoint. Rationale: friction minimization this iteration.
- **Q3 (live-stats region)** — stays DELEGATED; engine validates the math already.
- **Q4 (caret blink/shape)** — CONFIRMED delegated; validator uses 3-sample blink tolerance.
- **Merge levers** — not exercised; 14 musts approved at budget.

## Instruction
Author applies the above, finalizes + lints (check_bundle.py), finalizes ambiguity-log
(CA-UI-01 + cosmetic entries), seals v1.0.0, writes round-02-author.md.
