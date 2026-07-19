# Ambiguity log — result-anticheat
## Resolved assumptions
- Reference anticheat module is closed-source; semantics authored from observable bounds plus team-agreed plausibility rules [orchestrator].
- Stat-mismatch tolerance 1.0 wpm absorbs client roundTo2 on ms-measured durations [orchestrator correction].
- Key-spacing floor of 20ms average and zero-variance detector cover >=50 keystroke samples only (short tests skip timing analysis).
## Open questions
- Whether per-mode spacing floors need tuning with real traffic (runtime evidence will tell).
