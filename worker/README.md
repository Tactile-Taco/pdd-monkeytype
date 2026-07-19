# Cloudflare Workers deployment (v2-workers candidate)

The project is deployed as a single Cloudflare Worker at:

**https://pdd-monkeytype.pdd-typing.workers.dev**

## What this demonstrates (PDD substitutability)

The Worker is a *second candidate implementation* against the same sealed
protocol bundles. All protocol-critical modules are shared verbatim with the
Node candidate (`shared/stats.js`, `anticheat/index.js`, `server/validate.js`,
plus the isomorphic engine files served to the browser). Only the platform glue
changed: Express routes -> fetch router; JSON-file store -> KV-backed store
(`pdd-monkeytype-store`). This is the paper's protocol-level substitutability:
same protocol, different realization, zero re-negotiation.

## Topology

- Worker script: `pdd-monkeytype` (module format, `compatibility_date` 2025-09-01,
  `nodejs_compat` for `node:crypto` scrypt/HMAC).
- KV namespace: `pdd-monkeytype-store` bound as `PDD_STORE`.
- Static frontend embedded in the bundle (index/css/app.js + engine modules).

## Known limitations (documented, demo-scoped)

- The file-based RVL Dynamic Evidence Ledger is Node-only; this deployment runs
  without it. Runtime attestation for this candidate is out of band.
- Token signing secret is a demo constant (`pdd-demo-token-secret`), not env-provided.
- KV is eventually consistent: leaderboard updates may lag a write by moments.

## Regenerating the bundle

The bundle is a build artifact (not committed): concatenate
`implementation/src/shared/stats.js`, `implementation/src/anticheat/index.js`,
`implementation/src/server/validate.js`, the embedded-assets map
(`implementation/public/*` + engine/shared modules), and the Workers glue
(see `docs/09-cloudflare-deployment.md` for the full recipe and deployment record).
