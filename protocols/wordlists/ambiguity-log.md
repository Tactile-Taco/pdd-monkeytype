# Ambiguity log — wordlists

## v1.0.0 (NEW bundle — brownfield D3; SEALED 2026-07-20)

## Round-5 ruling record
- BQ-WL-01 → list-level registry ids APPROVED (english_1k-style): entries
  are individual lists carrying language+tier metadata, no second dimension
  table. Applied to schemas/language-registry.schema.json (lists array;
  entry = id + name + language + optional tier) and S-WL-002 (asset's
  language field equals the entry id).
- BQ-WL-02 → engine internal default provider RETIRES: the english list
  migrates into this bundle's assets as the builtin package (single
  authority; B-WL-001 fail-closed boot admission covers integrity).
  Zero-dependency boot preserved — assets are static same-origin files,
  not a service. Engine metadata minor (consumes: wordlist: wordlists)
  applied with this sealing as typing-test-engine v2.0.1.
- Open at sealing: none.

Adjudicated path (roadmap-author-r1 D3, accepted r2): engine v2.0.0 sealed
the ABSTRACT wordlist handshake (S-ENG-004) with internal lists as default
provider, so this bundle plugs in with no engine re-versioning. An additive
metadata minor on typing-test-engine (adding `consumes: wordlist: wordlists`)
is queued for this bundle's sealing window — recorded, not blocking.

## Resolved assumptions
- Starter set ~6 languages as implementation data (orchestrator instruction);
  full ~60-language import + size tiers (10k/200 etc.) are delegated DATA
  tasks — contents transient across deploys, byte-deterministic within one
  (B-WL-002). [orchestrator]
- Registry fields minimal (id, name, optional group); extra per-language
  metadata (rtl flags, diacritics tables for lazy mode, bcp47 codes) is
  additionalProperties-permitted and delegated this iteration. [author;
  verify reference fields at data import]
- Boot admission fail-closed (B-WL-001) is checked by a boot-time sweep over
  static assets — cheap schema validation, no runtime dependency. [author]
- Public same-origin static delivery; no auth. [reference posture; assumption]
- Quote language filter and language-specific leaderboards consume THIS
  registry at their own version events (quote-library 1.1.0, leaderboards
  1.1.0) — recorded for those rounds, nothing sealed here about them.
  [roadmap cross-reference]


