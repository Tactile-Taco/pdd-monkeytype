// Test-results v1.2.0 — result tags (B-RES-006). Pure helpers (isomorphic,
// zero deps). Tag objects conform to protocols/test-results/schemas/tag.schema.json
// on the wire: exactly { id, name } (additionalProperties:false) — the stored
// record carries uid, which is stripped at serve time.
export const TAG_NAME_MIN = 1;
export const TAG_NAME_MAX = 64;
export const TAGS_PER_RESULT_MAX = 20; // stored-result.schema.json tags maxItems

export function isValidTagName(name) {
  return typeof name === "string" && name.length >= TAG_NAME_MIN && name.length <= TAG_NAME_MAX;
}

// B-RES-006(a): tag names unique per user CASE-INSENSITIVELY.
export const normTagName = (s) => s.toLowerCase();
export function findTagByName(tags, uid, name) {
  const n = normTagName(name);
  return tags.find((t) => t.uid === uid && normTagName(t.name) === n) ?? null;
}
export function findTagById(tags, uid, id) {
  return tags.find((t) => t.uid === uid && t.id === id) ?? null;
}
export const serveTag = ({ id, name }) => ({ id, name });

// B-RES-006(c): multi-tag filter = INTERSECTION — a result matches iff it
// carries EVERY filter tag id.
export function matchesTagFilter(result, tagIds) {
  if (!tagIds || tagIds.length === 0) return true;
  const have = new Set(result.tags ?? []);
  return tagIds.every((id) => have.has(id));
}

// B-RES-006(e): tag-scoped PB read — READ-TIME derivation, NEVER a second
// keying and never a mutation of isPb flags. Best per sealed C7 tuple among
// own results carrying the filter tags; the same exclusions as global PB
// reads apply (never bailedOut, never minThresholdFailed — B-RES-003/004).
// Best = max wpm; ties break by earlier timestamp (deterministic).
export function scopedPbs(mine, tagIds) {
  const tagged = mine.filter((r) =>
    matchesTagFilter(r, tagIds) && !r.bailedOut && r.minThresholdFailed !== true);
  const best = new Map();
  for (const r of tagged) {
    const k = [r.mode, r.mode2, r.language, !!r.punctuation, !!r.numbers].join(" ");
    const cur = best.get(k);
    if (!cur || r.wpm > cur.wpm || (r.wpm === cur.wpm && r.timestamp < cur.timestamp)) best.set(k, r);
  }
  return [...best.values()]
    .sort((x, y) => y.wpm - x.wpm || x.timestamp - y.timestamp);
}
