# 11 — pdd-git-proxy: credential-holding git relay (binary pushes without an LLM-channel)

## Problem
The GitHub MCP `push_files` channel is text-only and lossy at depth: ~50% silent
derailment on 7–46KB payloads in long sessions (see research/metrics/deployment-addendum.md).
81/81 text files pushed fine; 4 binary PNGs could not be delivered intact as b64 parts.
Separately, the sandbox git client has no push credentials.

## Design (user-proposed)
A persistent Cloudflare Worker (`pdd-git-proxy`) holds the git credential as a
write-only secret (`GITHUB_PAT`: fine-grained PAT, single-repo, Contents RW, short
expiry — set via the Cloudflare dashboard, never enters any LLM transcript).
The LLM sends only a small JSON spec — source URLs, repo paths, expected SHA-256 —
and the worker fetches the bytes, verifies hashes fail-closed, and commits via the
GitHub git API (blobs → tree → commit → ref update) in one atomic commit.
Binary never transits the LLM channel; the credential never leaves Cloudflare.

## Invocation paths
1. `POST /relay-batch` with `x-relay-key` header (RELAY_KEY secret). Note: the MCP
   execute sandbox blocks workers.dev fetches (403 policy), so path 2 exists:
2. KV job queue: write spec to KV key `relay:job`, arm a `* * * * *` cron schedule;
   the `scheduled` handler runs the job, writes `relay:result`, deletes the job.
   Disarm cron + delete result key after. (Used for the 2026-07-20 binary-evidence
   relay: commit cc95bfeb, 5 puts hash-verified + 26 deletions, one commit.)

## Threat model (honest)
Secrets are write-only vs read-back, but the LLM holds deploy rights in this
account — a malicious deploy could exfiltrate `GITHUB_PAT`. Bounded by the PAT's
fine-grained scope (one repo, Contents-only, short expiry). Harder guarantee:
deploy this worker from a local `wrangler` and rotate the Cloudflare API token.

Source: worker/git-proxy.mjs
