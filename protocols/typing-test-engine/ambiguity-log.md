# Ambiguity log — typing-test-engine
## Resolved assumptions
- WPM/raw formulas and kogasa consistency mapping confirmed against reference [orchestrator, REF].
- keyConsistency drops the final spacing sample [orchestrator, REF].
- Chart arrays cap at 122 samples [orchestrator, REF].
- charStats emitted as tuple [correct, incorrect, extra, missed] (negotiation C1: provider yielded to consumer).
## Open questions
- Pace-caret and replay features (deferred; not protocol-visible for v1).
