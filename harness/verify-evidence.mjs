// Verifies every Dynamic Evidence Ledger under evidence/ (tamper detection).
import { readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyLedger } from "./evidence.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "evidence");
let bad = 0;
if (!existsSync(root)) { console.log("no evidence yet"); process.exit(1); }
for (const proto of readdirSync(root)) {
  if (!statSync(join(root, proto)).isDirectory()) continue;
  const ledger = join(root, proto, "runtime-ledger.jsonl");
  if (!existsSync(ledger)) continue;
  const v = verifyLedger(ledger);
  console.log(`${proto}: ${v.ok ? "OK" : "TAMPERED"} (${v.blocks} blocks)`);
  if (!v.ok) { bad++; console.log("  divergence:", v); }
}
process.exit(bad ? 1 : 0);
