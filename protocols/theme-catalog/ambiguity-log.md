# Ambiguity log — theme-catalog

## v1.0.0 (NEW bundle — brownfield roadmap D4a; SEALED 2026-07-20)

Topology adjudicated (roadmap-author-r1 §2.3, accepted roadmap-orchestrator-r2):
catalog-as-data stays OUT of ui-presentation sealing (round-1 precedent:
"multi-theme registry as protocol data (catalog is transient)" rejected); this
bundle seals only the handshake shape + charter conformance. Custom themes are
NOT here — they are config-carried slots in user-config v1.2.0 (per-slot
values; application-time conformance in ui-presentation theme resolution).

## Resolved assumptions
- Starter set ~10 themes this iteration; the full ~150-theme reference import
  is a delegated DATA task — catalog contents transient across deploys,
  byte-deterministic within a deploy (B-THM-003). [orchestrator instruction]
- Token slot list sealed ADDITIVELY per C2, RATIFIED round 4 (BQ-THM-01):
  nine slots — bg, main, caret, sub, sub-alt, text, error, error-extra,
  colorful-error. If the reference's 9th differs at data import, the data
  adjusts; protocol slots stand. [C2 + round-4 ruling]
- Catalog themes must pass the charter bands STATICALLY (O-THM-003): pure
  color math over hex tokens, no browser — the same bands ui-presentation
  checks in Chromium (O-UI-001..003), shifted earlier at near-zero cost.
  [author addition; catches non-conformant themes at admission time]
- Public unauthenticated read (reference theme list is public); zero writes.
  [assumption]
- Theme NAME conventions (serika_dark vs serika-dark), ordering of the list,
  and extra per-theme metadata (e.g. preview swatches) are delegated.
  [author; cosmetic]
- Share-as-URL/JSON is client chrome over the config-carried slots; no
  protocol surface here. [author; delegated]

## Round-4 ruling record
- BQ-THM-01 → nine slots RATIFIED (see S-THM-002); data adjusts to protocol,
  never the reverse.
- BQ-THM-02 → NO band exceptions. Every catalog theme passes O-THM-003
  static charter bands at admission; a failing starter theme is hex-adjusted
  minimally with the delta documented (PSN-UI-01 precedent: charter =
  persistent intent, values = delegated). Starter-10 names/values arrive as
  implementation data (delegated).
- Open at sealing: none.
