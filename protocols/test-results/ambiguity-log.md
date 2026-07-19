# Ambiguity log — test-results
## Resolved assumptions
- Idempotency keyed on client hash field per reference behavior [orchestrator, REF].
- PB tuple: (mode, mode2, language, punctuation, numbers) [orchestrator, REF].
- chartData/key arrays may be elided in list responses ('toolong' elision in reference) [orchestrator, REF]; v1 stores them, elides in history list.
## Open questions
- Result deletion and tag management deferred to a future protocol version.
