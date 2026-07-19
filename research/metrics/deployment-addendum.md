# Deployment addendum — GitHub MCP push outcome (final, this session)

Supersedes the batch-count line in `deployment.md` ("24 total: 12 text batches + 12
base64 parts"). Actual outcome is more complex; this file is the accurate record.

## Verified GOOD on GitHub (git blob SHA == local `git hash-object`)
- All 77 text files from `git diff --name-only origin/main HEAD`, including:
  - `research/paper/pdd-visual-design_{sec00..sec07,sec09}.md` and `.agent.outline.md`
  - `research/metrics/validator-loop.md` (blob 94a09a5385319e2589d5fc0cd41aecf46ca4857b)
  - `protocols/ui-presentation/**` (all text)
  - `validators/**`, `research/implementation/**`, `research/negotiation/**`, worker glue
- `protocols/ui-presentation/evidence/baseline/fresh-test.png.b64.part-005/006/007`
  (see `protocols/ui-presentation/evidence/baseline/B64-STATUS.md`)

## CORRUPT on GitHub (silently truncated by MCP transport; do not use)
- `package-lock.json.part-001` (38,002 B vs local 37,998 B) and `.part-002`
  (38,867 B vs 38,869 B). Reassemble target: 76,867 B total. Fix: re-split
  `split -C 10000 -d -a 3 package-lock.json` → 8 parts, re-push all.
- `research/paper/pdd-visual-design.md` (61,186 B vs local 61,179 B). Its content is
  recoverable NOW by concatenating sec00..sec09 which are hash-verified good. Proper
  fix: `split -C 10000 -d -a 3 research/paper/pdd-visual-design.md` → 7 parts, push as
  `pdd-visual-design.md.part-001..007`, then overwrite the corrupt full file with a
  pointer note (or delete it).
- All `*.png.b64.part-*` except fresh parts 005-007 (see B64-STATUS.md).

## Root cause
MCP `push_files` content strings are silently truncated at a stochastic per-call
threshold (observed ~7-47KB, shrinking as session context grows). Failed JSON never
creates a commit; but cleanly-closed truncated content DOES create corrupt blobs.
Mitigation that worked: parts of 130 base64 lines (~10KB) early in the session;
90 lines (~7KB) later. Every large part MUST be verified post-push via directory
listing blob SHA vs local `git hash-object`.

## Divergence (unchanged)
GitHub main = origin/main + MCP-authored commits; local HEAD diverges. Do not
reconcile by force-push. Canonical staging area with part files, hash manifests
(`part-hashes-p130.txt`, `part-hashes-p90.txt`) and ledger (`push-state.md`):
`/mnt/agents/output/push-staging/`.
