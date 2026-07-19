// Validator: request-audit (validator-set 0.1.0, operational layer)
// Covers O-UI-006: during the full test flow (load, session, results) the page
// issues no requests to third-party origins. Audits the aggregated request log
// of every scenario page opened during the suite run.
export function evaluateRequestAudit(ctx) {
  const metas = ctx.artifactMetas;
  const thirdParty = metas.flatMap((m) => m.thirdParty);
  const total = metas.reduce((n, m) => n + m.requests.length, 0);
  const sameOriginApi = new Set();
  for (const m of metas) for (const r of m.requests)
    if (r.sameOrigin && new URL(r.url).pathname.startsWith("/api/")) sameOriginApi.add(new URL(r.url).pathname.split("/").slice(0, 3).join("/"));
  return [{ invariant_id: "O-UI-006", layer: "operational", severity: "must",
    outcome: thirdParty.length === 0 ? "pass" : "fail",
    evidence: thirdParty.length
      ? `third-party requests attempted: ${[...new Set(thirdParty.map((r) => r.url))].slice(0, 5).join(", ")}`
      : `${total} requests audited across ${metas.length} page sessions; all same-origin (apis touched: ${[...sameOriginApi].join(", ") || "none"})` }];
}
