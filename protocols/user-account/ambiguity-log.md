# Ambiguity log — user-account
## Resolved assumptions
- Auth provider abstracted to opaque HMAC bearer tokens (reference uses external IdP). [orchestrator]
- Username regex ^[a-zA-Z0-9_-]{3,16}$; uniqueness case-insensitive. [orchestrator]
- Token expiry 24h (reference delegates expiry to provider). [assumption]
- Password storage: scrypt salted hashes. [assumption]
## Open questions
- None blocking. Moderator flag semantics owned by quote-library moderation flow.
