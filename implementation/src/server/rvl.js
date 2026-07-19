// Runtime Verification Layer (pdd-runtime-verifier): observes the monitorable
// projection of protocols from OUTSIDE implementation verdict paths.
// Monitorable projection v1:
//   - error-envelope shape on 4xx/5xx          (structural, per-request)
//   - recorded anticheat decision on 2xx POSTs (structural, per-request)
//   - rolling latency p95 vs route budgets     (operational, heartbeat)
// Attest-pass blocks are appended by a heartbeat when monitors are green;
// attest-violation blocks fire immediately on violation (fail-closed paths).
import { appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash, createHmac } from "node:crypto";
import { join } from "node:path";

const KEY = process.env.PDD_EVIDENCE_KEY || "dev-only-insecure-key";
const sha = (s) => "sha256:" + createHash("sha256").update(s).digest("hex");
function sortDeep(o) {
  if (Array.isArray(o)) return o.map(sortDeep);
  if (o && typeof o === "object")
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortDeep(o[k])]));
  return o;
}
const canon = (o) => JSON.stringify(sortDeep(o));
const sign = (d) => "hmac-sha256:" + createHmac("sha256", KEY).update(d).digest("hex");

export function appendLedger(ledgerPath, protocol, implVersion, observations, decision) {
  mkdirSync(join(ledgerPath, ".."), { recursive: true });
  let prev = "sha256:" + "0".repeat(64);
  if (existsSync(ledgerPath)) {
    const lines = readFileSync(ledgerPath, "utf8").trim().split("\n").filter(Boolean);
    if (lines.length) prev = JSON.parse(lines[lines.length - 1]).digest;
  }
  const block = { previous: prev, protocol, implementation_version: implVersion,
                  observations, decision, time: new Date().toISOString() };
  block.digest = sha(canon(block));
  block.signature = sign(block.digest);
  appendFileSync(ledgerPath, JSON.stringify(block) + "\n");
  return block;
}

const ERROR_CODES = ["invalid_request", "unauthorized", "forbidden", "not_found",
                     "conflict", "unprocessable", "rate_limited", "internal"];

// route-class latency budgets (from capability manifests)
const BUDGETS = [
  [/^\/api\/config$/, 50, "O-CFG-002"],
  [/^\/api\/quotes/, 50, "O-QT-002"],
  [/^\/api\/results/, 100, "O-RES-002"],
  [/^\/api\/leaderboards/, 100, "O-LB-001"],
  [/^\/api\/account/, 100, "O-ACC-003"],
];

export function makeRvl({ implVersion, ledgerDir, heartbeatMs = 15000 }) {
  mkdirSync(ledgerDir, { recursive: true });
  const ledgerPath = join(ledgerDir, "runtime-ledger.jsonl");
  const lat = new Map(); // budget key -> samples[]
  let violationsSinceBeat = 0, requestsSinceBeat = 0;

  const timer = setInterval(() => {
    const report = [];
    let green = violationsSinceBeat === 0;
    for (const [re, budget, inv] of BUDGETS) {
      const samples = lat.get(re.source) ?? [];
      if (samples.length) {
        const sorted = [...samples].sort((a, b) => a - b);
        const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
        report.push({ route: re.source, p95: Math.round(p95 * 100) / 100, budget, n: samples.length });
        if (p95 > budget) {
          green = false;
          appendLedger(ledgerPath, { monitorable_projection: inv }, implVersion,
                       { invariant: inv, p95, budget, n: samples.length }, "attest-violation");
        }
      }
      lat.set(re.source, []);
    }
    appendLedger(ledgerPath, { monitorable_projection: "rvl-v1" }, implVersion,
                 { heartbeat: true, requests: requestsSinceBeat,
                   violations: violationsSinceBeat, routes: report },
                 green ? "attest-pass" : "attest-violation");
    violationsSinceBeat = 0; requestsSinceBeat = 0;
  }, heartbeatMs);
  timer.unref?.();

  function rvl(req, res, next) {
    const start = process.hrtime.bigint();
    const origJson = res.json.bind(res);
    res.json = (body) => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      requestsSinceBeat++;
      for (const [re] of BUDGETS) if (re.test(req.path)) {
        const arr = lat.get(re.source) ?? []; arr.push(ms); lat.set(re.source, arr);
      }
      const violations = [];
      if (res.statusCode >= 400) {
        const ok = body && body.error && ERROR_CODES.includes(body.error.code) &&
                   typeof body.error.message === "string";
        if (!ok) violations.push({ invariant: "error-envelope", route: req.path });
      }
      if (req.path === "/api/results" && req.method === "POST" && res.statusCode < 300) {
        if (!(body && body.anticheat && body.anticheat.decision === "admit")) {
          violations.push({ invariant: "S-RES-002 recorded verdict", route: req.path });
        }
      }
      if (violations.length) {
        violationsSinceBeat += violations.length;
        appendLedger(ledgerPath, { route: req.path }, implVersion,
                     { violations, latency_ms: ms, status: res.statusCode }, "attest-violation");
      }
      return origJson(body);
    };
    next();
  }
  rvl.stopHeartbeat = () => clearInterval(timer);
  return rvl;
}
