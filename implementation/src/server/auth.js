// user-account protocol implementation: scrypt password hashes, HMAC bearer tokens.
// O-ACC-001: passwords never stored in plaintext. O-ACC-002: no network, pure crypto.
import { scryptSync, randomBytes, createHmac, timingSafeEqual, randomUUID } from "node:crypto";

const SECRET = process.env.PDD_TOKEN_SECRET || "dev-only-insecure-token-secret";
const TOKEN_TTL_MS = 24 * 3600 * 1000;

export function hashPassword(pw) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(pw, salt, 32).toString("hex");
}

export function verifyPassword(pw, stored) {
  const [salt, hex] = String(stored).split(":");
  if (!salt || !hex) return false;
  const a = scryptSync(pw, salt, 32);
  const b = Buffer.from(hex, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function issueToken(store, uid) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const body = Buffer.from(JSON.stringify({ uid, exp, jti: randomUUID() })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
  const token = body + "." + sig;
  store.commit((d) => { (d.tokens ||= {})[token] = { uid, exp, revoked: false }; });
  return token;
}

// verify -> {uid, exp} | null  (B-ACC-002)
export function verifyToken(store, token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expect = createHmac("sha256", SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig || ""), b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let claims;
  try { claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); }
  catch { return null; }
  const rec = store.read().tokens?.[token];
  if (!rec || rec.revoked) return null;
  if (claims.exp < Date.now()) return null;
  return { uid: claims.uid, exp: claims.exp };
}

export function revokeToken(store, token) {
  store.commit((d) => { if (d.tokens?.[token]) d.tokens[token].revoked = true; });
}
