// Public-api v1.0.0 — ApeKey lifecycle + scope vocabulary + rate limiting.
// Isomorphic across Node and the Workers bundle (node:crypto is available in
// both — same posture as server/auth.js; this module is never browser-served).
// Zero deps otherwise, zero storage authority beyond the ApeKey store.
//
// B-API-001 key discipline (format ruled round 7, BQ-API-01):
//   plaintext = "pdd_" + 128-bit entropy, hex-encoded (32 hex chars; the
//   literal prefix makes keys greppable in logs / secret scanners).
//   The plaintext is returned EXACTLY ONCE (creation response only); at rest
//   only a SALTED sha256 hash persists (per-key 128-bit salt, hex).
// B-API-002: verification compares salted hashes in CONSTANT TIME (no early
//   exit over the key set; comparison duration independent of the matching
//   prefix length and of the match position).
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

export const APEKEY_PREFIX = "pdd_";
export const APEKEY_ENTROPY_BYTES = 16; // 128-bit (ruled)
export const SALT_BYTES = 16;

// Closed scope vocabulary (S-API-001; four read scopes this iteration).
export const SCOPES = ["results:read", "stats:read", "profile:read", "quotes:read"];

export function hashKey(salt, plaintext) {
  return createHash("sha256").update(salt + "." + plaintext, "utf8").digest("hex");
}

// Mint a fresh key: returns the show-once plaintext plus the at-rest material
// (salt + salted hash). The caller persists ONLY { salt, hash } (+ metadata).
export function mintApeKey() {
  const plaintext = APEKEY_PREFIX + randomBytes(APEKEY_ENTROPY_BYTES).toString("hex");
  const salt = randomBytes(SALT_BYTES).toString("hex");
  return { plaintext, salt, hash: hashKey(salt, plaintext) };
}

export function isApeKeyFormat(s) {
  return typeof s === "string" && s.startsWith(APEKEY_PREFIX);
}

// B-API-002 constant-time authentication. Every stored record's salted hash is
// recomputed for the presented key and compared with timingSafeEqual over
// equal-length sha256 digests; the scan NEVER short-circuits on a match, so
// duration depends only on the key count — not on prefix-match length or
// match position. B-API-001/003 fail-closed: unknown OR disabled (revoked)
// keys never authenticate (disabled records are still compared, never selected).
export function authenticateApeKey(records, presented) {
  if (typeof presented !== "string" || presented.length === 0) return null;
  let found = null;
  for (const rec of records ?? []) {
    let match = false;
    try {
      const a = Buffer.from(rec.hash ?? "", "utf8");
      const b = Buffer.from(hashKey(rec.salt ?? "", presented), "utf8");
      match = a.length === b.length && timingSafeEqual(a, b);
    } catch { match = false; }
    if (match && rec.enabled === true && found === null) found = rec;
  }
  return found;
}

// Strict closed-shape validation of schemas/apekey-create-request.schema.json
// (S-API-001): { name: string 1..100, scopes: array minItems 1 of the closed
// enum } — unknown scope names and unknown keys are REJECTED (fail-closed).
export function validateApeKeyCreate(body) {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: ["body must be an object"], value: null };
  }
  for (const k of Object.keys(body)) {
    if (!["name", "scopes"].includes(k)) errors.push("unknown field: " + k);
  }
  const { name, scopes } = body;
  if (typeof name !== "string" || name.length < 1 || name.length > 100) {
    errors.push("name: string 1..100 chars");
  }
  if (!Array.isArray(scopes) || scopes.length < 1) {
    errors.push("scopes: array with at least 1 scope");
  } else {
    for (const s of scopes) {
      if (!SCOPES.includes(s)) errors.push("unknown scope: " + String(s));
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    value: errors.length === 0 ? { name, scopes: [...scopes] } : null,
  };
}

// Served metadata shape (schemas/apekey.schema.json, closed): id, name,
// scopes, createdAt, optional lastUsedAt, enabled. Key material (plaintext,
// salt, hash) and the owner uid NEVER appear (B-API-001 list discipline).
export function serveApeKey(rec) {
  return {
    id: rec.id,
    name: rec.name,
    scopes: [...rec.scopes],
    createdAt: rec.createdAt,
    ...(Number.isInteger(rec.lastUsedAt) ? { lastUsedAt: rec.lastUsedAt } : {}),
    enabled: rec.enabled === true,
  };
}

// ---- Rate limiting (B-API-005 per-key + O-API-003 per-IP) ----
// Documented DELEGATED constants: fixed window of WINDOW_MS; KEY_LIMIT per key
// per window; IP_LIMIT per source IP per window, with IP_LIMIT >= KEY_LIMIT so
// the per-key dimension remains the tested contract (O-API-003 ruling BQ-API-02).
// Window accounting is deterministic under an INJECTED clock (window index =
// floor(now / WINDOW_MS)); retry metadata = ms/epoch of the window reset.
export const RATE_WINDOW_MS = 60_000;
export const RATE_KEY_LIMIT = 60;   // requests per window per ApeKey
export const RATE_IP_LIMIT = 120;   // requests per window per source IP (>= key limit)

// Fixed-window counter with stale-window eviction. Pure + in-memory (O-API-001:
// rate-limit counters are NOT store writes; per-process / per-isolate state,
// documented). consume() is the only entry point.
export function createRateLimiter({ windowMs = RATE_WINDOW_MS, keyLimit = RATE_KEY_LIMIT, ipLimit = RATE_IP_LIMIT } = {}) {
  const counts = new Map(); // `${dimension}:${id}:${windowIndex}` -> n
  let sweptWindow = null;
  const sweep = (w) => {
    if (sweptWindow === w) return;
    for (const k of counts.keys()) {
      if (!k.endsWith(":" + w)) counts.delete(k); // previous windows are final
    }
    sweptWindow = w;
  };
  const limitFor = (dimension) => (dimension === "ip" ? ipLimit : keyLimit);
  return {
    windowMs, keyLimit, ipLimit,
    // -> { allowed, limit, remaining, resetMs, retryAfterMs, count }
    consume(dimension, id, now) {
      const w = Math.floor(now / windowMs);
      sweep(w);
      const k = dimension + ":" + id + ":" + w;
      const count = (counts.get(k) ?? 0) + 1;
      counts.set(k, count);
      const limit = limitFor(dimension);
      const resetMs = (w + 1) * windowMs;
      return {
        allowed: count <= limit,
        limit,
        remaining: Math.max(0, limit - count),
        resetMs,
        retryAfterMs: Math.max(0, resetMs - now),
        count,
      };
    },
    // test/introspection hook: current count without consuming
    peek(dimension, id, now) {
      return counts.get(dimension + ":" + id + ":" + Math.floor(now / windowMs)) ?? 0;
    },
  };
}
