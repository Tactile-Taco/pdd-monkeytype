// Evidence Chain + Dynamic Evidence Ledger (JS) — E = H(P, I, V, R, t).
// Canonicalization: recursive key sort. Signing: HMAC-SHA256 (dev key from env).
import { createHash, createHmac } from "node:crypto";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

const KEY = process.env.PDD_EVIDENCE_KEY || "dev-only-insecure-key";
export const sha = (s) => "sha256:" + createHash("sha256").update(s).digest("hex");
export function sortDeep(o) {
  if (Array.isArray(o)) return o.map(sortDeep);
  if (o && typeof o === "object") return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortDeep(o[k])]));
  return o;
}
export const canon = (o) => JSON.stringify(sortDeep(o));
export const digestObj = (o) => sha(canon(o));
export const sign = (d) => "hmac-sha256:" + createHmac("sha256", KEY).update(d).digest("hex");

export function hashTree(root) {
  const h = createHash("sha256");
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.isFile() && !name.startsWith(".")) { h.update(name); h.update(readFileSync(p)); }
    }
  };
  walk(root);
  return "sha256:" + h.digest("hex");
}

export function buildEvidence({ protocol, implDigest, validators, results, meta = {} }) {
  const body = { protocol, implementation: { artifact_digest: implDigest },
                 validators, results,
                 provenance: { time: new Date().toISOString(), node: process.version,
                               platform: process.platform, ...meta } };
  body.digest = digestObj(body);
  body.signature = sign(body.digest);
  return body;
}

export function appendBlock(ledgerPath, protocol, implVersion, observations, decision) {
  mkdirSync(dirname(ledgerPath), { recursive: true });
  let prev = "sha256:" + "0".repeat(64);
  if (existsSync(ledgerPath)) {
    const lines = readFileSync(ledgerPath, "utf8").trim().split("\n").filter(Boolean);
    if (lines.length) prev = JSON.parse(lines[lines.length - 1]).digest;
  }
  const block = { previous: prev, protocol, implementation_version: implVersion,
                  observations, decision, time: new Date().toISOString() };
  block.digest = digestObj(block);
  block.signature = sign(block.digest);
  appendFileSync(ledgerPath, JSON.stringify(block) + "\n");
  return block;
}

export function verifyLedger(ledgerPath) {
  let prev = "sha256:" + "0".repeat(64), n = 0;
  if (!existsSync(ledgerPath)) return { ok: true, blocks: 0 };
  const lines = readFileSync(ledgerPath, "utf8").trim().split("\n").filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const b = JSON.parse(lines[i]);
    if (b.previous !== prev) return { ok: false, diverged_at: i, reason: "chain-link" };
    const { digest, signature, ...rest } = b;
    if (digestObj(rest) !== digest) return { ok: false, diverged_at: i, reason: "digest" };
    if (sign(digest) !== signature) return { ok: false, diverged_at: i, reason: "signature" };
    prev = digest; n = i + 1;
  }
  return { ok: true, blocks: n };
}

export function writeJson(p, o) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(o, null, 2)); }
