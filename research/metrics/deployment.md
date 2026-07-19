# Deployment / distribution log

## GitHub mirror push (2026-07-20)

- Repo mirrored to GitHub `Tactile-Taco/pdd-monkeytype` branch `main` via the
  GitHub MCP `push_files` tool (local git has no push credentials; anon clone).
- **History divergence (expected):** the MCP-created commits have different
  SHAs from the local history they were imported from — one-line record, do
  not attempt to reconcile by force-push.
- Binary payloads (4 PNGs: 2 O-UI-005 baseline scenes + 2 A/B research
  screenshots) were pushed as lossless 76-char-wrapped base64 split into
  message-sized parts (`*.png.b64.part-*`); reassemble with
  `cat <name>.png.b64.part-* | base64 -d > <name>.png`. See
  `protocols/ui-presentation/evidence/baseline/README.md`.
- Commit-batching deviation: the brief's "2-3 commits" was infeasible — the
  MCP channel carries file content inline in tool messages (per-call practical
  ceiling ~77KB), so the push was split into size-batched, directory-grouped
  commits (24 total: 12 text batches + 12 base64 parts).
- Verification: full-tree hash check — every pushed text file and reassembled
  PNG fetched back from `raw.githubusercontent.com/Tactile-Taco/pdd-monkeytype/
  main/<path>` and SHA-256-compared against the local checkout (repo is
  public); plus MCP `get_file_contents` spot-checks
  (protocols/ui-presentation/protocol.yaml, research/paper/pdd-visual-design.md,
  research/metrics/validator-loop.md).
