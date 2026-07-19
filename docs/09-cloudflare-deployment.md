# Cloudflare deployment record — v2-workers candidate

**Live URL: https://pdd-monkeytype.pdd-typing.workers.dev**

Deployed 2026-07-19 as a second candidate implementation against the same sealed
protocol bundles — a live demonstration of the paper's protocol-level
substitutability: same protocol, different realization (Workers + KV instead of
Node + Express + JSON files), zero re-negotiation.

## Account topology

| Resource | Value |
|---|---|
| Cloudflare account | Lahill3030@gmail.com's Account (`96e74222…`) |
| workers.dev subdomain | `pdd-typing` (registered during deployment) |
| Worker script | `pdd-monkeytype` (ES module, `nodejs_compat`, date 2025-09-01) |
| KV namespace | `pdd-monkeytype-store` → bound as `PDD_STORE` |

## What was ported vs. what stayed identical

- **Identical (protocol-critical)**: `shared/stats.js`, `anticheat/index.js`,
  `server/validate.js`, and the isomorphic engine files served to the browser
  (`engine/session.js`, `engine/countChars.js`, `engine/words.js`, `shared/stats.js`).
- **Ported (platform glue)**: Express router → `fetch(request, env)` router;
  `Store` (JSON file) → `KvStore` (KV + in-memory cache); auth kept `node:crypto`
  scrypt/HMAC via `nodejs_compat`.
- **Dropped for the demo**: file-based RVL Dynamic Evidence Ledger (Node-only);
  token secret is a demo constant; KV is eventually consistent.

## Verification performed on the live URL

- Home page renders (HTML/CSS/JS + ES-module engine all served correctly).
- `GET /api/quotes/random` → valid quote JSON (S-QT-001).
- `GET /api/leaderboards/15` → valid board JSON (S-LB-001).
- Unknown route → 404 with envelope (O-RES-004 choke point holds).
- Full signup flow via the real UI (dialog → `POST /api/account/signup` → token
  persisted → header shows `@demo_luke`, logout button). Auth path verified live.

## Deployment mechanics (for the record)

The Workers API upload requires the full bundle in one multipart request; the
Code-Mode execute sandbox blocks general outbound fetch, so the bundle was
transferred as gzipped base64 chunks (DecompressionStream decode server-side),
with per-chunk length diagnostics — an approach worth reusing for any large
script upload through this MCP. One redeploy occurred: the first version served
`/` with the wrong content-type (fell through to `text/javascript`), fixed in v2.1
(content-type now keyed on exact path match first).

## Postmortem addendum (v2.2 deploy)

The chunk-paste channel proved lossy: two independent ~2.5KB string literals were
silently corrupted during agent-side re-emission (one 4-char loss, one 1-char
substitution), each detected only by hashing. Resolution: stage chunks in KV via
the bulk endpoint, verify per-chunk SHA-256 prefixes server-side, and assemble
the bundle from KV inside the deploy call (hash-gated, fail-closed). Any large
upload through this MCP should use the KV-staging pattern rather than inline
string assembly.
