// Runtime drill: Dynamic Evidence Ledger in action.
// Phase 1: clean traffic -> heartbeat attest-pass.
// Phase 2: chaos latency injection -> attest-violation (O-CFG-002).
// Phase 3: remediation -> chaos removed, operational layer re-pass, remediation-outcome block.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { bootApp } from "./boot.mjs";
import { appendBlock, verifyLedger } from "./evidence.mjs";
import { execSync } from "node:child_process";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ledgerDir = mkdtempSync(join(tmpdir(), "pdd-ledger-"));
const ledgerPath = join(ledgerDir, "runtime-ledger.jsonl");
const readBlocks = () =>
  existsSync(ledgerPath) ? readFileSync(ledgerPath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];

async function driveTraffic(app, n = 60) {
  const token = await app.signup("drill" + Math.random().toString(36).slice(2, 6));
  for (let i = 0; i < n; i++) await app.call("/api/config", { token });
  for (let i = 0; i < 10; i++) await app.call("/api/leaderboards/15");
  for (let i = 0; i < 5; i++) await app.call("/api/quotes/random?language=english");
}

console.log("phase 1: clean traffic");
const app1 = await bootApp({ ledgerDir, heartbeatMs: 1200 });
await driveTraffic(app1);
await sleep(1600);
app1.close();
app1.app.locals.rvl?.stopHeartbeat?.();
let blocks = readBlocks();
console.log("  blocks:", blocks.map((b) => b.decision));

console.log("phase 2: chaos injection (PDD_CHAOS=:/api/config:120)");
process.env.PDD_CHAOS = ":/api/config:120";
const app2 = await bootApp({ ledgerDir, heartbeatMs: 1200 });
await driveTraffic(app2);
await sleep(1600);
app2.close();
app2.app.locals.rvl?.stopHeartbeat?.();
blocks = readBlocks();
const violations = blocks.filter((b) => b.decision === "attest-violation");
console.log("  violation blocks:", violations.length);
const cfgViolation = violations.find((b) =>
  JSON.stringify(b.observations).includes("O-CFG-002"));
console.log("  O-CFG-002 violation captured:", !!cfgViolation);

console.log("phase 3: remediation");
delete process.env.PDD_CHAOS;
const repairContext = {
  classification: "implementation-defect",
  violated_invariant: "O-CFG-002",
  layer: "operational",
  observation: cfgViolation?.observations ?? null,
  original_violation_digest: cfgViolation?.digest ?? null,
  action: "chaos latency source removed; candidate regenerated as v1.1",
};
// re-admission gate: operational layer must pass again on the repaired candidate
execSync("node harness/validate-operational.mjs", { stdio: "inherit" });
appendBlock(ledgerPath, { remediation: "O-CFG-002 latency regression" }, "candidate-v1.1",
            { repair_context: repairContext, regression_check: "validate-operational: admit" },
            "remediation-outcome");
blocks = readBlocks();
console.log("  final decisions:", blocks.map((b) => b.decision));
console.log("  ledger integrity:", JSON.stringify(verifyLedger(ledgerPath)));
console.log("  ledger at:", ledgerPath);
