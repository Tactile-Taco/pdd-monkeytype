# Ambiguity log — quote-library
## Resolved assumptions
- Length groups fixed at [[1,100],[101,300],[301,600],[601,inf)] chars. [orchestrator: reference uses four configured ranges]
- Normalization for dedupe: trim + collapse whitespace + casefold. [assumption]
## Open questions
- Report/flag flow for bad quotes (deferred).
