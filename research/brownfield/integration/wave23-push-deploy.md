# wave-2+3 — push + deploy integration report

Date: 2026-07-21 (UTC). Agent: Integration Engineer (pdd-monkeytype). Playbook: `research/brownfield/integration/ui-v2-push-deploy.md` + `docs/09-cloudflare-deployment.md` + `docs/11-git-proxy.md`.

## 1. Starting state

- Local `/mnt/agents/work/pdd-monkeytype` HEAD was `5d8b734` (ui-v2 wave); waves 2+3 sat uncommitted on top (31 modified + 77 new = **108 files, 623,711 B**). Committed locally as **`07b7ae4`** ("waves 2+3: tags, result-stats, wordlists, quote moderation/rating/favorites/search, leaderboards daily/percentile/XP, user-profile, public-api/ApeKeys; validators 13/13 admit; ui-v2 integration report"). A 2-hour-stale 0-byte `.git/index.lock` (crashed process, no live git) was removed before committing.
- Remote main at `332b74c1` (ui-v2 CI-gate fix, green).
- Pre-push state per wave reports: 13/13 protocols admit, validator loop green (~175 s), `node --test` 88/88 (`research/brownfield/implementation/wave2-report.md`, `wave3-report.md`, `research/brownfield/validators/wave2-validation.md`, `wave3-validation.md`).

## 2. Runtime constraint (drove the split of labor)

This subagent runtime could not emit any `mcp__plugin-*` tool call (github push_files, cloudflare execute, notion — 15+ attempts, 100% silent substitution to shell noops; `select_tools` reported them loaded; zero credentials exist in the sandbox: no gh/PAT, no CF token, no relay key, anonymous GitHub browser session). Split adopted with the lead: **this agent staged + hash-verified everything and wrote ready-to-fire specs; the lead fired the writes via MCP execute from a working runtime.**

## 3. Push (mission 1) — remote head `332b74c1 → 1629a79d`

Method per playbook: fresh anonymous HTTP/1.1 clone → `/mnt/agents/work/push-scratch3` @ `332b74c1`; rsync overlay WITHOUT `--delete` (remote-only files preserved: `.github/workflows/pdd-ci.yml` + `pdd-deploy.yml`, `worker/deploy-ci.sh`, `worker/git-proxy.mjs`); changeset diff = exactly the 108-file wave set, all 108 byte-identical local↔scratch (sha256).

Transport: **100% hash-gated KV relay** (litterbox @72 h + pdd-git-proxy v4.2, namespace `ef988c65a91c43c680f4ad1e440dd347`, cron KV queue, sha256 fail-closed per file). All 108 files uploaded to litterbox and **round-trip sha256-verified 108/108** before any relay job was written; specs in `/mnt/agents/work/relay-jobs.json` (9 jobs × 12 puts, protocols-first ordering so bundles land before harness/implementation).

| Part | Commit | Contents |
|---|---|---|
| 1 | `c878aa7` | protocols: leaderboards, public-api (start) |
| 2 | `2dabf95` | protocols: public-api, result-stats (start) |
| 3 | `bcfa2cd` | protocols: result-stats |
| 4 | `b12f24d` | protocols: result-stats end, test-results, typing-test-engine, ui-presentation |
| 5 | `4cf8bf5` | protocols: user-profile |
| 6 | `a3a474f` | protocols: wordlists (bundle complete) + implementation/assets/wordlists (start) |
| 7 | `892ca13` | implementation: wordlist assets, public/app.js, server app+validate, shared modules |
| 8 | `adea659` | implementation: shared end + wave2/3 tests; harness validators+boot; worker/build.mjs |
| 9 | **`1629a79d0ea344d886b1ec13976a3ab9be61c8c0`** | worker/glue.mjs + research docs |

Verification: `git ls-tree -r` of the remote head vs locally computed `git hash-object` — **108/108 blob SHAs match**. Mission-named three: `implementation/src/shared/profile.js` `095a1de052ce…`, `implementation/src/shared/apekeys.js` `0d958e6b47ff…`, `harness/validate-behavioral.mjs` `a9e7482de748…`. Remote-only files confirmed preserved. (Anonymous REST API was rate-limited on this egress IP; verification done over git protocol — actually stronger, no API truncation risk.)

## 4. CI — pdd-validator-loop: GREEN

Run for the final SHA `1629a79d`: **id 29792245283, conclusion: success**, total 4 m 15 s (job `validate` 88516312231, 4 m 10 s), artifact `pdd-evidence-29792245283` (282 KB). Sole annotation: Node.js-20 deprecation warning on actions/* (benign, pre-existing). The 8 intermediate parts' runs red/short as expected (intermediate commits are not a consistent tree — same as prior waves); only the final SHA's run is the gate, and it is **success**.

## 5. Deploy (mission 2) — pdd-monkeytype-ui LIVE

- Rebuilt via `node worker/build.mjs` from the committed tree (`07b7ae4`), single build staged (timestamp comment ⇒ not byte-reproducible): bundle **200,109 B raw / 61,029 B gzip / 81,372 b64 chars**; sha256 bundle **`e99f65855b294696c34099f8937a83bfda30b95adf8f410406f2c49e451d28cd`**, gzip `2ffa02b23bef90f3c0c7e0f3d87ab5b6ea988d2e05c133e3286ddafd479853af`, b64 `9dd129ad1f77f44c625964a7a0f89093d2b44c092216e57eff7b2a570f3756d0`.
- KV-staged hash-gated pattern (docs/09): 33 chunks × 2500 chars uploaded @72 h, **33/33 round-trip verified against build anchors**; full reassembly chain (chunks → b64 → gzip → gunzip) proven **byte-exact** against `worker/bundle.mjs` locally before handoff. Spec: `/mnt/agents/work/deploy-spec.json`.
- Lead executed the deploy via pdd-git-proxy v4.2 KV-staged path: gzip sha + bundle sha re-verified fail-closed before upload, multipart PUT `workers/scripts/pdd-monkeytype-ui` → 200 (main_module `bundle.mjs`, compat 2025-09-01, flags `[nodejs_compat]`, binding `PDD_STORE`→`ef988c65a91c43c680f4ad1e440dd347`).

## 6. Live probes (browser tool, https://pdd-monkeytype-ui.pdd-typing.workers.dev)

- `GET /` → **200**, typing UI renders (fresh word sequence post-deploy).
- `GET /api/themes` → **200**, `{"themes":[…]}` exactly **10** themes (serika_dark, dracula, nord, monokai, gruvbox_dark, solarized_dark, matrix, carbon, midnight, bento).
- `GET /api/leaderboards/15` → **200**, board key `{mode:time, mode2:15, language:english, timeWindow:alltime}`; entries carry the **new v1.1.0 fields `percentile` (100) and `xp` (17)** — proves the wave-2 bundle, not the old deploy.
- `GET /wordlists/registry.json` → **200**, 6 lists (english/spanish/french/german/italian/portuguese). NOTE: the implementation's registry route is `/wordlists/registry.json` (embedded same-origin asset, B-WL-001 boot-admitted); no `/api/wordlists/*` route exists by design.
- `POST /api/apekeys` unauthenticated → **401 envelope**. Verified two ways: (a) live `GET /api/apekeys` → 401 via browser (same auth gate on the route); (b) POST exactly → **401 `{"error":{"code":"unauthorized","message":"token required","correlation_id":…}}`** by invoking the deployed bundle bytes (sha `e99f6585…`, hash-verified pre-upload) directly in Node 20 with an in-memory KV stub. (Sandbox shell cannot reach workers.dev — documented 403 policy — hence browser + deployed-bytes harness instead of curl.)

## 7. Deviations from the literal mission text (all playbook-sanctioned)

1. Relay used for ALL 108 files (not push_files batches): the integration runtime could not emit MCP calls at all (§2); the KV relay is the playbook's own hash-gated fallback and every byte was sha256-verified both directions (round-trip pre-relay, git blob SHA post-relay — 108/108, exceeds the ≥10 spot-check requirement).
2. Probe #4 hit `/wordlists/registry.json` (implementation's actual registry route; mission text allowed "or the registry route per implementation").
3. Probe #5's POST evidence gathered by executing the hash-verified deployed bytes locally + live GET-gate confirmation, because the sandbox blocks workers.dev from shell and the browser tool cannot issue raw POSTs.

## 8. Handoff / next actions

- This report is pushed as a single-put relay job (report-only commit; CI expected green on the already-admitted tree).
- No known-red gates remain: ui-v2's O-UI-005 replica-capture issue was fixed in `332b74c1`; wave-2/3 CI green at `1629a79d`; deploy live and probed.
