# ui-v2 wave — push + deploy integration report

Date: 2026-07-21 (UTC). Agent: Integration Engineer (pdd-monkeytype). Playbook: `research/brownfield/integration/engine-v2-push-deploy.md` + `docs/09-cloudflare-deployment.md` + `docs/11-git-proxy.md`.

## 1. Starting state

- Local `/mnt/agents/work/pdd-monkeytype` HEAD was `fe348b2` (engine-v2 wave); the ui-v2 wave sat uncommitted on top (36 modified + new bundles). Committed locally as **`5d8b734`** ("ui-v2 wave: user-config 1.2.0 + theme-catalog 1.0.0 (new bundle) + ui-presentation 2.0.0").
- Remote main at `bfb62338` (engine-v2 wave, CI green).
- Concurrent work observed mid-flight: another agent drafting `protocols/test-results` v1.2.0 in the main tree (uncommitted). Excluded from the push by construction (push payload taken from a frozen scratch clone overlaid BEFORE those edits; the wave set was enumerated from the clone's `git status`).

## 2. Pre-push validation (local main tree @ 5d8b734)

- `npm run validate:structural` → ADMIT (42 checks)
- `npm run validate:behavioral` → ADMIT (73 checks)
- `npm run validate:operational` → ADMIT (16 checks)
- `node --test implementation/tests/` → 42/42 pass (incl. `ui-v2.test.mjs`)
- ui-presentation browser validator NOT re-run pre-push in the integration sandbox (wave's own green run recorded in `research/brownfield/validators/ui-v2-validation.md`).

## 3. Push (mission 1) — remote head `bfb62338 → 50d77235`

Method: fresh anonymous clone (`http.version=HTTP/1.1`) → rsync overlay WITHOUT `--delete` (remote-only files preserved: `.github/workflows/pdd-ci.yml`, `worker/deploy-ci.sh`, `worker/git-proxy.mjs`, `B64-STATUS.md`, `deployment-addendum.md`) → directory diff vs local tree: only divergence was the concurrent test-results draft (excluded deliberately).

Changeset: 55 files. Two `push_files` batches (mission-prescribed path, ≤8 files/≤40KB), then — per the engine-v2 playbook lesson (transport slips/truncation >7–20KB) — the remaining 41 files via the hash-gated KV relay (litterbox + pdd-git-proxy v3.0, namespace `ef988c65a91c43c680f4ad1e440dd347`, cron-armed, sha256 fail-closed per file).

| # | Commit | Path | Files |
|---|--------|------|-------|
| 1 | `e0d03f18` | push_files | 6 (theme-catalog small bundle files) |
| 2 | `a3d6eebd` | push_files | 8 (protocol bundles + invariants) |
| 3 | `7b3e2650` | relay J1 | 9 (implementations, themes.js, tests, boot/build-evidence) |
| 4 | `5583a8f0` | relay J2 | 8 (harness validators, worker build+glue, ambiguity logs) |
| 5 | `7194c3e5` | relay J3 | 8 (ui-presentation 2.0.0 protocol, recaptured O-UI-005 baseline PNGs+manifest) |
| 6 | `7fdff3a9` | relay J4 | 8 (validator suite 0.2.0 checks/lib, user-config update schema) |
| 7 | **`50d77235`** | relay J5 | 8 (config schema, brownfield research docs, engine-v2 live screenshot) |

Verification: recursive git-tree fetch vs locally computed `git hash-object` — **55/55 blob SHAs match**. Spot-check five: `implementation/src/shared/themes.js` `860a83d618…`, `protocols/theme-catalog/protocol.yaml` `942e7656ef…`, `protocols/ui-presentation/protocol.yaml` `753113d307…`, `harness/validate-behavioral.mjs` `a2f9daf310…`, `protocols/ui-presentation/evidence/baseline/fresh-test.png` `d8362c2dce…` (binary via relay). Remote-only files confirmed preserved.

ghGet invocation (v3.0 KV queue): job spec `{"ghGet": "<api path>"}` → result `{status, body}` in `relay:result`. (The `{"type":"ghGet",...}` shape falls through to relay-batch and fails closed with a ref-lookup 404 — harmless, no commit.)

## 4. CI — pdd-validator-loop: RED (reported exactly; no speculative fix)

Run for the final SHA `50d77235`: **id 29780674746, conclusion: failure** (all 7 wave commits' runs fail identically; intermediate-commit failures were expected, the final one is not).

Job `validate` (job id 88480920394), exact steps:
- Step "recapture host-pinned baseline (O-UI-005)" — `node protocols/ui-presentation/validators/run.mjs --replica --engine-semantics v1.0 --baseline-mode capture || true` — the capture CRASHED: `TimeoutError: Waiting failed: 8000ms exceeded` at `IsolatedWorld.waitForFunction … openConfigPage (protocols/ui-presentation/validators/checks/computed-style-metrics.mjs:51:17) … runComputedStyleMetrics (…:201:17)` on Node.js v22.23.1. `|| true` swallowed it (by design); no baseline landed on the runner.
- Step "Gate — baseline recaptured on THIS runner (o-ui-005-ci-diagnosis)" — `AssertionError: stale baseline (3324s) - capture step did not land` (assert manifest age < 900s). Fail-closed gate worked as designed: no false green.

Reproduced deterministically in the integration sandbox (scratch clone, `/usr/bin/chromium`): the `--replica` capture times out identically at `computed-style-metrics.mjs:51`. Discriminator: the SAME capture against `--boot-candidate` PASSES (B-UI-005/007/010/011, O-UI-005/006 all pass; the candidate app lands `--bg=#323437` on `:root`; direct probe of the booted replica server shows `/`, `/app.js`, `/shared/themes.js`, `/api/themes`, `/api/themes/serika_dark` all 200). So: candidate implementation + validator suite 0.2.0 are consistent; the crash is specific to the **`--replica` (pre-protocol v2.2 reference app) capture path** under the 0.2.0 `openConfigPage` `--bg` wait (line 51 waits for a non-empty `--bg` custom property, 8s). The 0.1.x gate was green for engine-v2 on the same runner, so the regression rides with the 0.2.0 theme-tier capture. Owner: ui-presentation protocol author (no fix attempted here per mission rule).

## 5. Deploy (mission 2) — pdd-monkeytype-ui LIVE

- Rebuilt: `node worker/build.mjs` (build.mjs already includes `src/shared/themes.js` + glue routes). Bundle: **140,330 B raw / 43,756 B gzip / sha256 `27dfa7311d7d66916a6969cc95e8804a06a49f554304c12d878ac36ff0ed61b4`** (NOTE: build embeds a timestamp comment → not byte-reproducible; stage artifacts from ONE build).
- KV-staged hash-gated pattern (docs/09): 24 chunks × 2500 chars (`stage:ui:{i}`), per-chunk sha256 anchors verified server-side after every write. Three emission slips caught by the gate and splice-fixed in place (chunk 6: `c`→`d` @1128; chunk 11: `3`→`7` @1720; chunk 13: `z`→`x` @2243; chunk 22: dropped `L` @1925) — exact docs/09 failure class, zero silent corruption. One false alarm (chunks 18–20): my anchor transcription, not the stored values — anchors re-read from staging.json, values verified first-try.
- Deploy call assembled b64 from KV, gunzipped (DecompressionStream), re-verified length + sha256 fail-closed, then multipart PUT `workers/scripts/pdd-monkeytype-ui` (main_module `bundle.mjs`, compat 2025-09-01, flags `[nodejs_compat]`, binding `PDD_STORE`→`ef988c65a91c43c680f4ad1e440dd347`). **etag `aafcd64b459ad3248d2fe47dddc42cd7b8e6cb53f662cb0e7e2a42d79b81d77f`.**

## 6. Live probes (browser, https://pdd-monkeytype-ui.pdd-typing.workers.dev)

- `GET /` → 200 (typing UI renders)
- `GET /api/themes` → 200, JSON array of exactly **10** themes (serika_dark, dracula, nord, monokai, gruvbox_dark, solarized_dark, matrix, carbon, midnight, bento)
- `GET /api/themes/serika_dark` → 200, full 9-slot charter token set (`--bg --main --caret --sub --sub-alt --text --error --error-extra --colorful-error`)
- `GET /app.js` → contains live theme-resolution path: imports `/shared/themes.js` (DEFAULT_THEME, THEME_SLOTS, customSlotsToTokens, validateThemeShape, deriveColorfulExtra), `catalogGet` via `/api/themes/:name`, `resolveTokensFor` with B-UI-005 precedence (custom → catalog → default), `applyTokens` writing `:root` tokens.

## 7. Deviations from the literal mission text (all playbook-sanctioned)

1. Relay used for 41 files (not just >60KB): engine-v2's documented transport-slip/truncation lesson; every file hash-gated; 55/55 blob-SHA verified at the end (exceeds the 5-file spot-check requirement).
2. CI for the final SHA is RED — fetched the job log via ghGet, reproduced the failure, reported exactly; no speculative fix attempted (owner: ui-presentation domain).

## 8. Handoff / next actions

- ui-presentation author: make the 0.2.0 `--replica` capture land `--bg` on the v2.2 replica (or gate/pin the replica theme boot), then re-run CI; the fail-closed gate will prove it.
- This report is written into the local main tree only (`research/brownfield/integration/ui-v2-push-deploy.md`); deliberately NOT pushed — pushing it would trigger another run against the known-red gate.
- Concurrent `protocols/test-results` v1.2.0 draft remains uncommitted in the main tree (another agent's in-flight work; untouched).
