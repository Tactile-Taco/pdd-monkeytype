# Brownfield roadmap — Orchestrator Round 2 adjudication

Date: 2026-07-20. Input: research/brownfield/roadmap-author-r1.md. Counterparty: protocol author.

## Topology verdicts — ALL ACCEPTED
- D1 → typing-test-engine v2.0.0 MAJOR (keystroke-rule modes are engine-core; B-ENG-005
  becomes config-gated; tape + quick-restart carved to ui-presentation; abstract
  `wordlist` handshake sealed so D3 plugs in with zero re-versioning).
- D2 → user-config additive MINORs only (1.1.0/1.2.0/1.3.0), flat keys batched per
  consuming phase, defaults-merge = zero migration. Nested-schema v2.0.0 REJECTED
  (breaks consumers for cosmetic gain). Command palette = delegated, not a protocol.
- D4 → NEW theme-catalog bundle + ui-presentation event gated on C1 (confirmed: MAJOR).
- D5 → test-results minor (tags) + NEW read-only result-stats. D6/D7 minors.
- user-account frozen as identity provider. D8 new user-profile. D9 public-api last.
- Inventory corrections accepted: quote submit/rate + PBs already sealed (quote-library
  1.0.0, B-RES-003/S-ENG-003) — D5/D6 shrink accordingly.
- Q2 (budget): engine MAY exceed 12 musts (~17 accepted for this legacy bundle only);
  ≤12 budget stands for all NEW bundles. Composite mode-matrix invariants approved.
- Execution order accepted: cfg 1.1.0 → engine 2.0.0 → cfg 1.2.0 → theme-catalog →
  ui-presentation event → test-results 1.2.0 → result-stats → wordlists →
  quote-library 1.1.0 → leaderboards 1.1.0 → user-profile → public-api.

## Ground-truth rulings (orchestrator, reference access)
- **C1 CONFIRMED — ui-presentation v2.0.0 MAJOR.** The reference offers proportional
  fonts; sealed O-UI-004 (mandatory monospace) contradicts parity. Amendment direction:
  O-UI-004 becomes "font family is configurable; the DEFAULT is monospace; per-state
  distinguishability (O-UI-003) and caret legibility hold regardless of chosen font."
  Keep the amendment minimal per your LOW-cost assessment (B-UI-001/002/003 carry the
  contract). This is the second instance of the CA-001 pattern: a sealed cosmetic
  assumption (monospace-everything) turns out behavior-visible once configurability exists.
- **C2:** extend the sealed token list ADDITIVELY (`--sub-alt` at minimum — reference
  custom themes expose ~9 slots). Exact slot list [verify at theme-catalog authoring];
  additive tokens = minor, folded into the v2.0.0 event window anyway.
- **C3:** engine MAJOR confirmed (this message is the decision).
- **C4:** daily leaderboards = ROLLING 24-hour window (not UTC-midnight reset)
  [verify at leaderboards authoring; seal window semantics explicitly either way].
- **C5:** quote moderation = persisted tri-state pending/approved/refused (refused
  retained with metadata), not a boolean [verify]; quote-library minor.
- **C6:** min-threshold "failed test" = result flagged failed, EXCLUDED from PBs and
  leaderboards, still visible in history [verify]. No conflict with B-AC-002
  (anticheat envelope is a distinct mechanism; failed-flag is config-domain).
- **C7:** PB keying = (mode, mode2, language, punctuation, numbers) tuple
  [verify tag interaction at authoring]; seal the tuple explicitly.
- **C8:** zen = unbounded word stream, manual end (esc/enter), result savable under
  mode "zen" [verify scope at engine v2 authoring].

## Instruction
Begin authoring per the order above: (1) user-config v1.1.0 draft, (2) typing-test-engine
v2.0.0 draft (mediated Q&A as needed — engine-v2 mode semantics annex follows by message).
Keep drafts unsealed; I adjudicate each before sealing.
