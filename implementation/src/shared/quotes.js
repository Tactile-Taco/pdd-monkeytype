// Quote-library v1.1.0 — pure derivation helpers (isomorphic, zero deps).
// Wire shape (S-QT-001), tri-state moderation (B-QT-006), rating-weighted
// selection (B-QT-007), search/browse filtering + pagination (B-QT-009).
import { mulberry32 } from "../engine/words.js";

// B-QT-002: groups are the indices of the configured length ranges.
export const QUOTE_GROUPS = [[1, 100], [101, 300], [301, 600], [601, Infinity]];
export function groupOf(len) {
  return QUOTE_GROUPS.findIndex(([lo, hi]) => len >= lo && len <= hi);
}

// Tri-state derivation for records stored before v1.1.0 (no state field):
// state defaults from the legacy approved boolean. The served consistency
// clause (B-QT-006(a)) is approved === (state === "approved") — always.
export function quoteState(q) {
  return q.state ?? (q.approved ? "approved" : "pending");
}

// Wire shape per schemas/quote.schema.json (additionalProperties:false):
// exactly id, text, source, language, length, group, approved + optional
// rating / state / moderationNote. The raw per-user ratings map never leaks.
export function serveQuote(q) {
  const state = quoteState(q);
  const vals = Object.values(q.ratings ?? {});
  const out = {
    id: q.id, text: q.text, source: q.source, language: q.language,
    length: q.length, group: groupOf(q.length),
    approved: state === "approved", // B-QT-006(a) consistency clause
    ...(vals.length ? { rating: { average: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length } } : {}),
    state,
    ...(typeof q.moderationNote === "string" ? { moderationNote: q.moderationNote } : {}),
  };
  return out;
}

// ---- B-QT-007 rating-weighted selection (documented weight function) ----
// weight(q) = q's rating average when rated; unrated quotes use the documented
// DEFAULT_WEIGHT = 2.5 (neutral midpoint of the 1..5 scale). The function is
// monotonically non-decreasing in the rating average by construction
// (avg(a) >= avg(b) => weight(a) >= weight(b)).
export const DEFAULT_QUOTE_WEIGHT = 2.5;
export function ratingWeight(q) {
  const vals = Object.values(q.ratings ?? {});
  if (!vals.length) return DEFAULT_QUOTE_WEIGHT;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Deterministic weighted pick: given the same pool order, weights and seed,
// selection is reproducible (mulberry32, same PRNG family as the engine).
// Returns an index into pool. rand defaults to Math.random (unseeded reads).
export function weightedPickIndex(pool, rand = Math.random) {
  const weights = pool.map(ratingWeight);
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return Math.floor(rand() * pool.length); // defensive; weights are >= 1 when rated
  let r = rand() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return pool.length - 1;
}

export function seededRand(seed) {
  return mulberry32((Number(seed) >>> 0) || 1);
}

// ---- B-QT-009 search/browse ----
// Approved-only, optional language (exact) + q (case-insensitive text substring)
// filters; STABLE order = submission order (storage order); fixed page size 50,
// page 0-based. Documented at implementation (delegated per ambiguity-log).
export const QUOTE_PAGE_SIZE = 50;
export function searchQuotes(quotes, { language, q, page = 0 } = {}) {
  const needle = typeof q === "string" && q.length ? q.toLowerCase() : null;
  const matched = quotes
    .filter((x) => quoteState(x) === "approved")
    .filter((x) => language === undefined || x.language === language)
    .filter((x) => needle === null || x.text.toLowerCase().includes(needle));
  const start = page * QUOTE_PAGE_SIZE;
  return { quotes: matched.slice(start, start + QUOTE_PAGE_SIZE), total: matched.length };
}
