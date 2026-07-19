# ui-presentation — Negotiation Round 2: Author record of adjudication + SEAL

**Outcome: SEALED as ui-presentation v1.0.0** (`protocol.status: sealed`).
`harness/check_bundle.py protocols/ui-presentation` → PASS (17 invariants,
every `must` validator-mapped, handshake refs resolve). Two rounds total —
inside the expected 2–3. No invariant text changed behaviorally between draft
0.1.0 and sealed 1.0.0 except where adjudications below required; all edits
were recorded in-rationale (no silent text).

## 1. Adjudications applied

| Item | Decision | Applied at |
|---|---|---|
| P1 substrate | puppeteer-core + headless Chromium, one browser session | validation-plan.yaml `substrate` (was already drafted so; confirmed) |
| P2 error contrast | floor 3.0 + large-text clause; persistent intent = principled accessibility floor, not the 4.5 number | O-UI-001 rationale rewritten to record the internal-conflict adjudication; also logged in ambiguity-log.md as the negotiation-surfaced conflict case |
| P3 saturation | floor 0.45 | O-UI-002 (already in draft text; rationale now records adjudication) |
| P4 caret net-new | acknowledged, stage-2 scope | B-UI-001 rationale |
| P5/Q1 baseline | v2.2 pre-caret origin, **harness-captured** at validator-authoring time → `protocols/ui-presentation/evidence/baseline/`, same-host only, re-baseline post-caret = minor version event | O-UI-005 statement+rationale; validation-plan `environment`; evidence-requirements `baseline:` block; new `evidence/baseline/README.md` (capture requirements) |
| P6 class vocabulary | sealed verbatim | S-UI-002 rationale |
| Q2 multi-theme | B-UI-005 stays should; config value only, no theme endpoint | B-UI-005 rationale + upgrade path noted |
| Q3 live-stats | stays delegated | ambiguity-log.md resolved entry |
| Q4 blink/shape | delegated; 3-sample tolerance | B-UI-001 rationale |
| Merge levers | not exercised; 14 musts approved | none needed |

## 2. Final sealed ledger

**Sealed MUST (14):**
S-UI-001 stream structure + reading order · S-UI-002 letter state vocabulary
{correct, incorrect, extra} / untyped = none · S-UI-003 exactly one active word
= engine wordIndex · S-UI-004 token set on :root (--bg --main --caret --text
--sub --error --error-extra) · B-UI-001 caret existence/visibility/position
tracking (logical caret = (wordIndex, n), ±2px) · B-UI-002 per-letter state
fidelity to engine accounting after every keystroke · B-UI-003 committed-word
mutation confinement · B-UI-004 results view exact wpm/acc from CompletedEvent
· O-UI-001 contrast: text ≥4.5, error ≥3.0 (large-text), caret ≥3.0 · O-UI-002
token bands: L(bg) ≤0.2 + L(text) > L(bg); error hues h∈[0,15]∪[340,360],
s ≥0.45 · O-UI-003 four-state pairwise color distinction ≥32 channel delta ·
O-UI-004 monospace advance equality (±1px) · O-UI-005 screenshot coherence
(2 scenes, ≥0.85 pixels within Δ16, host-pinned v2.2 baseline) · O-UI-006
same-origin rendering, zero third-party requests.

**Sealed SHOULD (3):** S-UI-005 keystroke-schema conformance at producer ·
B-UI-005 theme application + unknown-theme fallback · B-UI-006 active word in
scrollport.

**Delegated (transient, implementer latitude):** exact hex values within bands
· font stack within monospace metrics · spacing scale, radii, caret shape/blink,
animation timing · theme catalog and names · results decoration · live-stats
region · responsive breakpoints · chart rendering.

## 3. Ambiguity balance sheet

Critical (behavior-changing) items found: 2 — CA-UI-01 (caret semantics,
resolved by definition in B-UI-001, confirmed round 2) and the P2 internal
conflict (orchestrator-adjudicated). Cosmetic resolutions: 11 (all logged with
criticality tags). Blocking questions issued: 4 (Q1–Q4), all adjudicated in
one round. Open at sealing: 0. Version events: 1 (0.1.0 draft → 1.0.0 seal;
no post-seal edits).

## 4. Hand-off notes for stage 2/3

- The caret (B-UI-001) and token migration (S-UI-004) are the only net-new
  build items; everything else constrains existing behavior of
  implementation/public/ (verified against index.html / style.css / app.js).
- Validator substrate: puppeteer-core (repo devDependency); all 11 validators
  in validator-set.yaml run in one Chromium session; est. suite ≈1 min default
  (fuzz 50 runs), ≈5 min nightly (200).
- Baseline PNGs do NOT exist yet by design: captured by the validator harness
  from the live v2.2 origin at validator-authoring time per
  evidence/baseline/README.md. Stage 3 must record SHA-256 + host image id +
  Chromium version per capture.
- Substitutability preserved: bundle constrains served client assets only;
  Node/Express and Workers candidates co-admissible unchanged.
