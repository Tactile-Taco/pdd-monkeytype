// Wordlists v1.0.0 — language registry + wordlist asset conformance.
// Isomorphic (zero deps, no I/O — O-WL-001): callers supply parsed JSON.
// The registry conforms to protocols/wordlists/schemas/language-registry.schema.json
// (list-level entries per round-5 ruling BQ-WL-01); every asset conforms to the
// engine's wordlist handshake (protocols/typing-test-engine/schemas/wordlist.schema.json,
// fork-referenced per S-WL-001 — validated here by the engine's own validateWordlist).
// Boot admission (B-WL-001) is fail-closed: admitCatalog() errors abort boot/build.
import { validateWordlist } from "../engine/wordlist.js";

// Hand-rolled registry shape check (language-registry.schema.json):
// { lists: [ { id: 1..64, name: 1..100, language: 1..64, tier?: <=32, ...extras } ] }
// — top-level additionalProperties:false; entries additionalProperties:true.
export function validateRegistryShape(reg) {
  const errs = [];
  if (!reg || typeof reg !== "object" || Array.isArray(reg)) return ["registry object required"];
  const extra = Object.keys(reg).filter((k) => k !== "lists");
  if (extra.length) errs.push("registry: unknown top-level keys " + extra.join(","));
  if (!Array.isArray(reg.lists) || reg.lists.length < 1) {
    errs.push("registry.lists: array of >=1 entries required");
    return errs;
  }
  const seen = new Set();
  reg.lists.forEach((e, i) => {
    const at = `lists[${i}]`;
    if (!e || typeof e !== "object" || Array.isArray(e)) { errs.push(`${at}: object required`); return; }
    if (typeof e.id !== "string" || e.id.length < 1 || e.id.length > 64) errs.push(`${at}.id: string 1..64`);
    if (typeof e.name !== "string" || e.name.length < 1 || e.name.length > 100) errs.push(`${at}.name: string 1..100`);
    if (typeof e.language !== "string" || e.language.length < 1 || e.language.length > 64) errs.push(`${at}.language: string 1..64`);
    if (e.tier !== undefined && (typeof e.tier !== "string" || e.tier.length > 32)) errs.push(`${at}.tier: string <=32`);
    if (typeof e.id === "string") {
      if (seen.has(e.id)) errs.push(`${at}.id: duplicate "${e.id}"`);
      seen.add(e.id);
    }
  });
  return errs;
}

// Referential closure + per-asset conformance (S-WL-001/S-WL-002/B-WL-001).
// assets: Array<{ id, parsed }> where id is the file stem (<id>.json).
// Every entry resolves to exactly one conformant asset whose language field
// EQUALS the entry id; every asset is named by an entry.
export function admitCatalog(registry, assets) {
  const errors = validateRegistryShape(registry);
  const entries = new Map((registry?.lists ?? []).map((e) => [e.id, e]));
  const byId = new Map();
  for (const a of assets ?? []) {
    if (byId.has(a.id)) errors.push(`asset "${a.id}": duplicate`);
    byId.set(a.id, a);
  }
  for (const [id] of entries) {
    const a = byId.get(id);
    if (!a) { errors.push(`entry "${id}": no wordlist asset`); continue; }
    const werrs = validateWordlist(a.parsed).map((e) => `asset "${id}": ${e}`);
    errors.push(...werrs);
    if (werrs.length === 0 && a.parsed.language !== id) {
      errors.push(`asset "${id}": language field "${a.parsed.language}" != entry id "${id}"`);
    }
  }
  for (const [id] of byId) {
    if (!entries.has(id)) errors.push(`orphan asset "${id}": not named by any registry entry`);
  }
  return { ok: errors.length === 0, errors };
}

// Ids of the registered lists (leaderboards S-LB-001 language validation).
export function registryIds(registry) {
  return (registry?.lists ?? []).map((e) => e.id);
}
