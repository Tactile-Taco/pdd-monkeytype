# ui-presentation validator suite (v1.0.0 bundle, stage 3a)

Browser-substrate validator suite for the sealed `ui-presentation` bundle.
Substrate per `validators/validation-plan.yaml`: **puppeteer-core + headless
Chromium** (real layout engine — no jsdom). One browser process is amortized
across all checks; each scenario gets an isolated incognito context.

## Layout

```
validators/
  run.mjs                       runner CLI (target-origin agnostic)
  validation-plan.yaml          sealed plan (layers, tolerances, environment)
  validator-set.yaml            sealed validator identities/versions
  lib/
    browser.mjs                 browser/context factory: viewport 1280x800 dsf1,
                                seeded Math.random, pinned quote/config APIs,
                                POST /api/results capture, served-engine-module
                                rewrite (feed() capture), MutationObserver
                                recorder (value-aware), request log
    dom.mjs                     in-page word-stream/computed-style scanners
    driver.mjs                  keystroke replay + per-keystroke trace; seeded
                                stream generator (B-UI-002 fuzz)
    oracle.mjs                  engine-state oracle (v1.1 sealed / v1.0 legacy)
                                + self-test vs implementation/src/engine/session.js
    scenarios.mjs               shared scripted + fuzz scenarios
    color.mjs                   WCAG 2.x luminance/contrast, RGB->HSL, channel delta
    hostmeta.mjs                host_image_id / chromium_version / font probe
    selectors.mjs               discovery selectors (all overridable via --set)
    tinyyaml.mjs                YAML-subset parser for the two sealed plan files
    pngdiff.py                  O-UI-005 pixel diff (Pillow+numpy; Δ16, >=0.85)
  checks/                       one module per validator-set id
    dom-structure.mjs           S-UI-001, S-UI-002, S-UI-003, B-UI-006(should)
    keystroke-contract.mjs      S-UI-005(should)
    caret-tracking.mjs          B-UI-001
    dom-state-fidelity.mjs      B-UI-002 (+ mutation-sanity self-test)
    dom-mutation-confinement.mjs B-UI-003
    results-fidelity.mjs        B-UI-004
    computed-style-metrics.mjs  S-UI-004, O-UI-001..004, B-UI-005(should)
    screenshot-similarity.mjs   O-UI-005 (+ baseline capture mode)
    request-audit.mjs           O-UI-006
  reference-origin/             byte-faithful pinned replica of the live v2.2 origin
    serve.mjs                   local static+API server (zero deps)
    assets/                     git-pinned v2.2 bytes (provenance.json)
```

## Running

```bash
# against a locally served candidate
node protocols/ui-presentation/validators/run.mjs --origin http://localhost:8787

# against the live v2.2 origin (egress-capable host)
node protocols/ui-presentation/validators/run.mjs \
  --origin https://pdd-monkeytype.pdd-typing.workers.dev --engine-semantics v1.0

# against the pinned v2.2 replica (offline / egress-restricted hosts)
node protocols/ui-presentation/validators/run.mjs --replica --engine-semantics v1.0

# (re)capture the O-UI-005 baseline into protocols/ui-presentation/evidence/baseline/
node protocols/ui-presentation/validators/run.mjs --replica --engine-semantics v1.0 --baseline-mode capture
```

Key flags: `--runs N` (fuzz property runs; default 50 = plan
`property_runs_default`, nightly 200 via `UI_PBT_RUNS=200`), `--seed N`
(deterministic replay), `--engine-semantics v1.1|v1.0` (oracle backspace
semantics; v1.0 only for the pre-CA-001 v2.2 origin), `--baseline-mode
compare|capture|skip`, `--set key=value` (selector overrides),
`--init-script FILE` (inject an in-page fixture/shim into every scenario page —
testing aid used to verify validator pass-paths), `--smoke` (research run;
writes `harness/out/ui-presentation.smoke.json` and never touches the
admission path), `--ledger` (append signed block to
`protocols/ui-presentation/evidence/runtime-ledger.jsonl`).

## Harness integration

- `npm run validate:ui -- --origin http://localhost:8787` (package.json script).
- Results JSON: `harness/out/ui-presentation.json` (candidate runs) with the
  harness result shape `{invariant_id, layer, severity, outcome, evidence}`
  plus the bundle's evidence-requirements fields (protocol_version,
  implementation_artifact_hash, validator_versions, validation_results,
  dependency_manifest, discovery_log, baseline_screenshot_manifest).
- `harness/build-evidence.mjs` consumes it when present (prefix `UI`);
  should-severity gaps are reported but do not block admission per the plan's
  admission_rule (all `must` pass; screenshot within band; zero open
  mutation-suspect flags).
- Verdict: `admit` iff zero must-failures and zero mutation-suspects.

## Determinism notes

- Word content is client-generated; the runner pins `Math.random` (mulberry32,
  same algorithm as the engine) per page load and pins quote/config API
  responses, as O-UI-005 requires ("quote/config API responses pinned by the
  validator").
- Live-stats digits (wpm) in scene 2 are timing-dependent; the 0.85/Δ16 band
  absorbs them (measured: fresh scene pixel-identical, mid-test >= 0.9996).
- Screenshot comparisons are admitted only between captures with the same
  `host_image_id` (chromium version + OS + font rasterization probe).
