# Brownfield — Round 5: adjudication applied + SEAL record (D5a/D5b/D3)

**Outcome: test-results v1.2.0 SEALED, result-stats v1.0.0 SEALED (NEW),
wordlists v1.0.0 SEALED (NEW), typing-test-engine v2.0.1 (metadata patch).**
`harness/check_bundle.py` → PASS on all four (13 / 7 / 7 / 18 invariants).
Five BQs adjudicated in one round, all applied pre-seal.

## 1. Rulings applied

| BQ | Ruling | Applied at |
|---|---|---|
| BQ-RES-01 (13 musts) | Legacy exception GRANTED; B-RES-006(e) stays must ("filter integrity is user-visible correctness"). Ledger: engine 18, ui-presentation 19, test-results 13 | test-results ambiguity log; this record |
| BQ-STS-01 (time typing) | sum(testDuration) [verify at implementation; afk subtraction = one-line formula amendment] | B-STS-002 text + log |
| BQ-STS-02 ((mode,mode2)) | APPROVED — aggregates keyed per (mode, mode2) pair | aggregates.schema.json (+required mode2); B-STS-002 formulas |
| BQ-WL-01 (registry ids) | List-level ids (english_1k-style); entries carry language+tier metadata, no second table | language-registry.schema.json (lists[]: id+name+language+tier?); S-WL-002 (asset.language == entry id; 1:1 closure) |
| BQ-WL-02 (default provider) | RETIRE internal lists — english migrates to wordlists assets as builtin package; static files preserve zero-dep boot | typing-test-engine v2.0.1: consumes + wordlist: wordlists; S-ENG-004 rationale; both logs |

## 2. Final sealed ledgers

### test-results v1.2.0 (MINOR, D5a) — 13 musts (exception-listed)
B-RES-001 storage disposition (zen never persisted — admitted verdict +
non-stored indicator, no record; minThresholdFailed persisted, history-visible)
· B-RES-003 PB rule (C7 tuple explicit; flagged never PB) · B-RES-006 tags
composite (CRUD/assign/filter/delete-cascade/scoped-PB-read). Schemas:
stored-result +minThresholdFailed/+tags; tag.schema.json NEW; completed-event
copy +unit/+minThresholdFailed parity. Capability: +data/tags.json write.
Consumer queue: leaderboards 1.1.0 amends B-LB-001 for flagged-result exclusion.

### result-stats v1.0.0 (NEW, D5b) — 7 musts
Read-only derivation; formulas documented in B-STS-002 (per-(mode,mode2)
counts/sums/means, UTC-day activity, chronological series, empty→0); PB table
from stored isPb flags (single authority); flagged/bailed included in
activity, excluded from PB table [verify reference inclusion]. Validators:
determinism + fixture recompute-consistency; no browser.

### wordlists v1.0.0 (NEW, D3) — 7 musts
Provider for the S-ENG-004 handshake: list-level registry (S-WL-002 closed
1:1 with assets), asset conformance to the engine's schema (S-WL-001),
public same-origin static delivery (S-WL-003), boot admission fail-closed
(B-WL-001), per-deploy byte-determinism (B-WL-002), zero-write/no-egress +
p95≤50ms (O-WL-001/002). ~6 starter lists = data; ~60-language import
delegated. Quote-language filter + language boards consume this registry at
quote-library 1.1.0 / leaderboards 1.1.0 rounds.

### typing-test-engine v2.0.1 (patch)
Additive metadata only: depends_on/consumes + wordlists; S-ENG-004 rationale
records provider retirement. No invariant text changed.

## 3. Version-event ledger (program cumulative: 10 events; 2 majors, 2 patches)

Events 1–6 per round-04 record. 7. test-results 1.1.0→1.2.0 minor ·
8. result-stats 0.1.0→1.0.0 new · 9. wordlists 0.1.0→1.0.0 new ·
10. typing-test-engine 2.0.0→2.0.1 patch. Blocking questions this round: 5,
all one-round. Critical ambiguities: 0 new. Exception ledger: engine 18,
ui-presentation 19, test-results 13 musts; new bundles ≤12 (result-stats 7,
wordlists 7). Validator patches: 1 (computed-style-metrics 0.1.1, round-4).

## 4. Hand-off notes
- test-results 1.2.0: disposition branch in the POST path (zen short-circuit
  post-verdict), flag persistence, tags store + queries. Validator delta:
  cheap (+~10s contract/property).
- result-stats 1.0.0: four read endpoints + fixture harness. Cheap–moderate
  (+~20–30s).
- wordlists 1.0.0: static asset dir + boot sweep (cheap schema checks);
  english builtin package migration. Trivial–cheap (+~15s incl. sweep).
- Watch item carried: B-UI-008 fixity wording at next ui-presentation minor
  (logged in its ambiguity log; candidate satisfies both readings).
