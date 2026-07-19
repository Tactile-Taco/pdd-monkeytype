# Negotiation Round 1 — Orchestrator opening position (ui-presentation bundle)

Date: 2026-07-19. Counterparty: pdd_protocol_author subagent (ui-presentation instance).

## Context
Research project: carry visual design through PDD with minimal friction. Orchestrator may
ONLY influence visuals via this negotiation (never by instructing implementers).

## Persistent intents proposed for sealing (all machine-checkable)
1. Monospace word stream, reading order, active word visually distinguished (DOM class).
2. Caret element exists, visible, position tracks engine caret state per keystroke/word-commit
   (behavioral vs engine keystroke-state handshake, see implementation/src/shared/engine/session.js).
3. Per-letter state classes: correct / incorrect / extra / untyped distinguishable;
   incorrect+extra visually differ from correct via computed style.
4. Theme charter: named CSS custom-property tokens on :root (--bg, --main, --text, --sub,
   --error, --caret); contrast(text,bg) ≥ 4.5 and contrast(error,bg) ≥ 4.5 (WCAG formula);
   error token in red hue band (HSL h∈[0,15]∪[340,360], s≥50%); dark-family: --bg low luminance.
5. Results screen presents wpm + acc matching completed_event payload (DOM text vs schema).
6. Typed-history stability: committed words don't reflow on later keystrokes.

## Delegated (transient) — implementer latitude
Exact hex values, font stack, spacing scale, animation timing, radii, caret shape.

## Constraints
- Friction budget: ≤ 14 `must` invariants; every must → cheap validator (jsdom DOM /
  computed-style; PIL screenshot similarity with tolerance band for ≤ 2 operational invariants).
- Substitutability: same bundle must admit Node/Express and Cloudflare Workers candidates.
- Proposed: name `ui-presentation`; depends_on typing-test-engine, user-config; consumes
  keystroke-event + completed-event handshakes.

## Metrics to collect for the paper
Negotiation rounds; per-position accept/modify/reject; blocking questions (cosmetic vs critical
per CA-001); version events; validator runtime/failures; screenshot similarity vs v2.2 baseline.
