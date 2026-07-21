#!/usr/bin/env bash
# CI deploy of the Workers candidate (replaces the manual KV-staged MCP upload).
# Requires env: CF_API_TOKEN, CLOUDFLARE_ACCOUNT_ID. Usage: deploy-ci.sh <script-name>
set -euo pipefail
SCRIPT="${1:?script name required}"
test -s worker/bundle.mjs
cat > /tmp/cf-metadata.json <<'JSON'
{"main_module":"worker.mjs","compatibility_date":"2025-09-01","compatibility_flags":["nodejs_compat"],"bindings":[{"type":"kv_namespace","name":"PDD_STORE","namespace_id":"ef988c65a91c43c680f4ad1e440dd347"}]}
JSON
sha256sum worker/bundle.mjs
resp=$(curl -sS -X PUT "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${SCRIPT}" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -F "metadata=@/tmp/cf-metadata.json;type=application/json" \
  -F "worker.mjs=@worker/bundle.mjs;type=application/javascript+module;filename=worker.mjs")
echo "$resp" | python3 -c "import json,sys; r=json.load(sys.stdin); r.get('success') or sys.exit('CF error: '+json.dumps(r.get('errors'))); print('deploy ok:', r['result'].get('id'), 'size:', r['result'].get('bundleSize'))"
curl -sS -X POST "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${SCRIPT}/subdomain" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json" -d '{"enabled":true}' > /dev/null
echo "deployed: https://${SCRIPT}.pdd-typing.workers.dev"
