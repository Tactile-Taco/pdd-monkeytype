# O-UI-005 CI-only rejection — root-cause diagnosis

Author: Validation Engineer. Date: 2026-07-20. Scope: CI (`pdd-ci` workflow,
ubuntu-latest + chrome-headless-shell 151, `CHROME_PATH`) rejects the candidate with
`1 must failures (O-UI-005)` while the authoring sandbox passes. Diagnosis performed in
the isolated copy `diag-o-ui-005` (source repo untouched; nothing committed or pushed).

## 1. TL;DR

- The documented two-phase CI flow — `--baseline-mode capture` from the replica, then
  `--boot-candidate` compare — is **sound and passes with the exact CI browser line**
  (chrome-headless-shell 151.0.7922.34): **0.999915 / 0.999701** vs the 0.85 floor.
- The CI failure signature reproduces **only** when the compare step reads a baseline
  that was not captured in the *same job, same runner, same browser*: the same-host
  guard fails closed — `cross-host comparison not admitted: baseline host sha256:76f2…
  != current sha256:7f18…` — and the verdict prints **exactly** `1 must failures
  (O-UI-005)` (experiments E1, E4).
- Font hypotheses are **refuted with numbers**: neither origin ships or references any
  web font (`document.fonts` is empty on both), and a DejaVu-only (ubuntu-like) font
  environment still passes **0.999912 / 0.999603** (E0b). Font *drift between the
  phases* is caught by the guard, not by the pixel floor (E4).
- Replica↔candidate asset drift is real but tiny by design: the residual diff in a
  passing run is **87 px (0.0085%)** on fresh-test and **379 px (0.037%)** on
  mid-test — the `#caret` bar and the live `wpm` digits. Even a *total* word-stream
  replacement stays above the floor (E2: 0.917 / 0.929).
- **Recommendation: (a) workflow fix** — run capture+compare atomically in one job with
  a job-level `CHROME_PATH`, replace the bare `|| true` with a baseline-freshness gate,
  and upload the evidence JSON. No validator or protocol change is needed (and the
  data shows relaxing the band would be wrong).

## 2. Reproduction environment (diag copy)

| Item | Value |
|---|---|
| node | v20.20.2 (deps via `npm install --no-bin-links`; the /mnt FS rejects symlinks) |
| python | 3.12.12, Pillow 12.3.0, numpy 2.2.5 (pngdiff deps) |
| browser | chrome-headless-shell **151.0.7922.34** via `npx @puppeteer/browsers install chrome-headless-shell@stable`, exported as `CHROME_PATH` |
| host | linux/x64 5.10.134-18.0.11.lifsea8 (authoring-class image), 1996 fontconfig fonts |
| commands | phase 1: `node protocols/ui-presentation/validators/run.mjs --replica --engine-semantics v1.0 --baseline-mode capture`; phase 2: `npm run validate:ui -- --boot-candidate --runs 50` |

## 3. Experiment matrix (all numbers from `harness/out/ui-presentation.json` + pngdiff.py)

| # | Setup (capture → compare) | O-UI-005 result | Reading |
|---|---|---|---|
| E0 | CHS-151, same env, exact CI commands (replica capture → candidate compare) | **pass 0.999915 / 0.999701** (repeat: 0.999915 / 0.999630) | intended flow works on any consistent host |
| E0b | both phases under a DejaVu/Liberation-only fontconfig (ubuntu-like fonts) | **pass 0.999912 / 0.999603** | font *availability* is irrelevant when both phases share the env |
| E1 | compare (CHS-151) vs **committed baseline** (Chrome/150, authoring host) | **fail — `cross-host comparison not admitted: baseline host sha256:76f2dfa0d4c2 != current sha256:7f18cc4f6fde`** | **reproduces CI verdict string verbatim** |
| E2 | same host/browser, but word stream replaced (`--shot-seed 9999` vs baseline 20260719) | pass 0.916868 / 0.929348 | even total content replacement can't breach 0.85 |
| E4 | baseline captured under Noto env → compare under DejaVu env (font drift mid-flow) | **fail — `cross-host comparison not admitted`** | guard detects font-env changes via the canvas fontProbe |
| A | pixel-only: replica CHS-151 capture vs replica Chrome/150 committed capture (same host, same content) | 0.927047 / 0.921490 | a browser-binary change *alone* eats ~8 of the 15-point budget |

Residual-diff localization for the E0 pass (candidate vs replica captures, matched env):
`fresh-test` 87 px >Δ16 (0.0085%), band y 4–32; `mid-test-5-words` 379 px (0.037%) in two
bands — y 132–143 (live `wpm` digits) and y 175–203 (the `#caret` bar, Δ=176 =
`#e2b714` on `#323437`). Everything else is pixel-identical.

## 4. Hypothesis 1 — font loading/availability: REFUTED

- In-page probe (CHS-151, both origins): `document.fonts.status = "loaded"`,
  `loaded_faces = []` — **zero FontFace objects**; no `@font-face`, no font `<link>`,
  no `FontFace()` construction anywhere in the replica or the candidate. The
  `document.fonts.ready` wait in `captureScenes` is a no-op; there is no font-loading
  race to be lost.
- Computed style identical on both: `font-family: ui-monospace, "Cascadia Mono", Menlo,
  monospace`, 25.6 px; glyph advances identical (i = m = 15.3587 px).
- The stack resolves through fontconfig (this host: Noto Sans Mono; ubuntu-latest:
  DejaVu Sans Mono). Absolute glyphs differ across hosts, but the two-phase flow only
  ever compares **within one host**, so availability cancels (E0b passes at 0.9996+).
- When fonts *do* drift between capture and compare (E4), the guard's canvas fontProbe
  (which rasterizes the exact same stack) flips `host_image_id` and the check fails
  closed with the cross-host message — never with a similarity number.

## 5. Hypothesis 2 — replica-vs-candidate asset differences: QUANTIFIED, immaterial

- `index.html`: byte-identical. `engine/words.js`, `engine/countChars.js`,
  `shared/stats.js`: byte-identical → with the seeded `Math.random` (shot-seed
  20260719) the rendered word stream is identical. `engine/session.js` differs only in
  backspace semantics (v1.1), which the two scenes never exercise.
- `style.css`: adds `#caret` rules + `#words { position: relative }`, refactors colors
  to `var()` with identical values, and lifts `--error #ca4754 → #cf5763`. The error
  lift is Δ=16 per channel — exactly the tolerance, so those pixels still count as
  similar, and the scenes type five *perfect* words (no error pixels anyway).
- Net effect measured: ≤ 379 px (0.037%) — the caret bar and timing-dependent wpm
  digits. Two orders of magnitude inside the budget.

## 6. Hypothesis 3 — scene composition/determinism: bounded

`fresh-test` is pixel-identical run-to-run (authoring measurement, re-confirmed);
`mid-test-5-words` jitters only in the live-stats `wpm` digits (0.99963–0.99970 band).
E2 shows that even *every word being different* only costs ~8 points (0.917) — text
covers ~8–10 % of the frame. A sub-0.85 numeric failure requires theme/layout/
typography-scale change (palette flip, font-stack change, unstyled/broken CSS), not
content or timing drift.

## 7. Root cause

`runScreenshotSimilarity` compares against
`protocols/ui-presentation/evidence/baseline/` and refuses cross-host comparison via
`manifest.host_image_id` = sha256(chromium_version, platform/arch, os.release(),
canvas fontProbe of the ui-monospace stack, viewport). The committed baseline was
captured on the authoring host (Chrome/150.0.7871.114, lifsea kernel) and **can never
match** a GitHub ubuntu-latest + HeadlessChrome/151 runner. The only way CI gets its
observed verdict is that the compare step saw a baseline not captured on that runner
with that browser — i.e. the phase-1 capture's writes did not reach the phase-2
workspace (separate jobs without artifact passing, a re-checkout between steps, or a
silently failing capture step masked by `|| true`; note capture mode returns
`O-UI-005:pass` unconditionally, so "pass in that run" says nothing about whether the
baseline landed). Cross-browser numbers (A: 0.92) show the guard is correct to refuse.

Discriminating check on the next CI run: if `harness/out/ui-presentation.json` shows
the **cross-host message**, it is this workflow defect. If it instead shows **numeric
similar < 0.85 with matching host ids**, the environment is exonerated and the pushed
candidate rendered materially differently (theme/layout/typography scale — the
in-flight engine v2.0.0 wordlist/decoration work is the suspect) — that reject would
be a *true positive* and the fix belongs in the candidate PR.

## 8. Recommended patch — (a) workflow fix (no protocol-owner approval needed)

```yaml
env:
  CHS: chrome-headless-shell/linux-151.0.7922.34/chrome-headless-shell-linux64/chrome-headless-shell
jobs:
  pdd-ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with: { node-version: "22" }
      - run: npm install --no-audit --no-fund
      - run: npx @puppeteer/browsers install chrome-headless-shell@151
      - name: O-UI-005 baseline recapture (same job, same runner, same browser)
        env: { CHROME_PATH: ${{ github.workspace }}/${{ env.CHS }} }
        # capture exits 1 because the v2.2 replica legitimately fails pre-charter
        # invariants; the baseline write happens regardless — gate on that below.
        run: node protocols/ui-presentation/validators/run.mjs --replica --engine-semantics v1.0 --baseline-mode capture || true
      - name: Gate — baseline must have been recaptured on THIS runner
        run: python3 - <<'EOF'
          import json, datetime, sys
          m = json.load(open('protocols/ui-presentation/evidence/baseline/manifest.json'))
          t = datetime.datetime.fromisoformat(m['captured_at'].replace('Z', '+00:00'))
          age = (datetime.datetime.now(datetime.timezone.utc) - t).total_seconds()
          assert age < 900, f'stale baseline ({age:.0f}s) — capture step did not land'
          assert 'HeadlessChrome/151' in m['chromium_version'], m['chromium_version']
          print('baseline fresh:', m['captured_at'], m['host_image_id'][:27])
        EOF
      - name: Candidate validation
        env: { CHROME_PATH: ${{ github.workspace }}/${{ env.CHS }} }
        run: npm run validate:ui -- --boot-candidate --runs 50
      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        if: always()
        with: { name: ui-presentation-evidence, path: |
          harness/out/ui-presentation.json
          harness/out/ui-captures/ }
```

Key properties: (1) capture and compare share one job/runner/browser, so the
same-host rule holds by construction; (2) the freshness gate converts the silent
`|| true` into a loud failure when the capture didn't land; (3) the evidence artifact
makes the next occurrence self-diagnosing (guard message vs numeric similarity).
Also: **commit this workflow to `ci-templates/`** — it currently exists only on the
remote (not in the repo), which is exactly how the two-phase contract broke.

Explicitly **not** recommended:
- (b) validator fix (relax host-pinning or the 0.85 band) — requires protocol-owner
  approval and is contradicted by the data: a browser-binary change alone costs
  0.92→0.85−ε margin (A); a band that admits cross-host captures would admit real
  rendering regressions. The fontProbe/host-pin caught every drift we induced (E4).
  Optional, still approval-gated: append "recapture baseline on this host" hint text
  to the cross-host evidence string.
- (c) baseline semantics change — unnecessary;
  `research/metrics/validator-authoring.md` §4 already mandates "recapture on the CI
  host that will run candidate validation is REQUIRED"; the workflow just has to do it
  atomically. No orchestrator adjudication needed once (a) lands.

## 9. Residual risk / open questions

- The remote `.github/workflows/pdd-ci.yml` and the CI run's evidence JSON were not
  visible from the sandbox; §7's primary mechanism (phase writes not shared) is
  inferred from the exact verdict string + E1/E4 reproductions. If the artifact shows
  numeric < 0.85 with matching host ids, pivot to diffing the pushed candidate commit
  (engine v2.0.0 WIP) against the v2.2 replica.
- The diag host is authoring-class (lifsea), not ubuntu-latest; absolute glyph shapes
  differ there, but E0/E0b show the verdict is host-agnostic given a consistent env.
- Experiment artifacts: `/home/kimi/diag/{e1,e2,e3,e4}-*.json`, baselines under
  `/home/kimi/diag/baseline-*`; E0 evidence in `harness/out/ui-presentation.json`.
