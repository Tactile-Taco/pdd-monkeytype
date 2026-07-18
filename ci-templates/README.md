# CI workflow templates

The four PDD GitHub Actions workflows live here as templates because the automation token used to author this repo lacks GitHub's `workflow` OAuth scope (pushing files under `.github/workflows/` is correctly refused by the API).

Install them (with credentials that have the `workflow` scope):

```bash
mkdir -p .github/workflows
cp ci-templates/pdd-*.yml .github/workflows/
git add .github/workflows && git commit -m "ci: install PDD workflows" && git push
```

- `pdd-pr-gates.yml` — bundle lint + cross-protocol compatibility on every PR.
- `pdd-validator-loop.yml` — full three-layer Validator Loop + evidence build/verify on push to main; uploads evidence artifacts.
- `pdd-nightly.yml` — scheduled (03:00 UTC) extended property runs (5000 cases), mutation report, evidence-chain verify; opens an issue on failure.
- `pdd-release-gate.yml` — tag gate: all protocols sealed + full loop before release.
