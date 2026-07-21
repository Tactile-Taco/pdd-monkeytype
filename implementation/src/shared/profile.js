// User-profile v1.0.0 — compose-only derivations + strict edit validation.
// Isomorphic, zero deps beyond the other sealed shared modules, zero storage
// authority over derived data (B-PRO-001: every served derived value equals its
// sealed source; NOTHING here is persisted — re-reading after a source change
// reflects the change).
//
// Composition map (B-PRO-001, sealed):
//   name/addedAt  <- user-account (frozen; read-only identity)
//   pbs           <- result-stats pb_table handshake (computePbTable, pass-through)
//   aggregates    <- result-stats aggregates handshake (computeAggregates, pass-through)
//   xp            <- sum of the sealed per-result xp fields (leaderboards B-LB-007 xpOf)
//                    over the user's stored results (all of them — lifetime activity
//                    measure; inclusion rule mirrors B-STS-002's sealed default)
//   streaks       <- ONLY the result-stats activity series (B-PRO-002 round-7 ruling)
//   level         <- documented monotonic curve over total xp (B-PRO-003, delegated below)
import { round2 } from "./stats.js";
import { computeAggregates, computePbTable, computeActivity, utcDay } from "./resultStats.js";
import { xpOf } from "./leaderboards.js";

export const DAY_MS = 24 * 60 * 60 * 1000;

// ---- Editable fields (B-PRO-004 / S-PRO-003) ----
// The only writable surface of the bundle (capability: data/profile.json).
export const PROFILE_FIELD_DEFAULTS = Object.freeze({ bio: "", avatarUrl: "", socials: {} });
export const DEFAULT_IS_PUBLIC = true; // BQ-PRO-01 ruling: isPublic default true
export const BIO_MAX = 500;
export const AVATAR_URL_MAX = 500;
export const SOCIAL_MAX = 200;
export const SOCIAL_KEYS = ["website", "twitter", "github"];
const HTTPS_RE = /^https:\/\//;

export function isPublicOf(rec) {
  return rec?.isPublic !== false; // absent => default true (DEFAULT_IS_PUBLIC)
}

// Served publicFields shape (profile.schema.json, closed): bio, avatarUrl,
// socials — defaults merged, unknown stored social keys never leak.
export function publicFieldsOf(rec) {
  const socials = {};
  for (const k of SOCIAL_KEYS) {
    const v = rec?.socials?.[k];
    if (typeof v === "string") socials[k] = v;
  }
  return {
    bio: typeof rec?.bio === "string" ? rec.bio : "",
    avatarUrl: typeof rec?.avatarUrl === "string" ? rec.avatarUrl : "",
    socials,
  };
}

// Strict closed-shape validation of schemas/profile-update.schema.json.
// Returns { ok, errors, value } — value is the normalized patch (only the
// allowed keys, verbatim strings). ALL-or-NOTHING (B-PRO-004): any violation
// yields ok:false and the caller writes ZERO fields.
export function validateProfileUpdate(body) {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: ["body must be an object"], value: null };
  }
  const keys = Object.keys(body);
  if (keys.length < 1) errors.push("at least one field required"); // minProperties: 1
  const value = {};
  for (const k of keys) {
    if (!["bio", "avatarUrl", "socials", "isPublic"].includes(k)) {
      errors.push("unknown field: " + k); // additionalProperties: false
      continue;
    }
    const v = body[k];
    if (k === "bio") {
      if (typeof v !== "string" || v.length > BIO_MAX) errors.push("bio: string <= 500 chars");
      else value.bio = v;
    } else if (k === "avatarUrl") {
      // avatar is a URL REFERENCE only (no blob storage) — https URLs exclusively.
      if (typeof v !== "string" || v.length > AVATAR_URL_MAX || !HTTPS_RE.test(v)) {
        errors.push("avatarUrl: https URL string <= 500 chars");
      } else value.avatarUrl = v;
    } else if (k === "isPublic") {
      if (typeof v !== "boolean") errors.push("isPublic: boolean");
      else value.isPublic = v;
    } else if (k === "socials") {
      if (!v || typeof v !== "object" || Array.isArray(v)) {
        errors.push("socials: object");
      } else {
        const s = {};
        for (const sk of Object.keys(v)) {
          if (!SOCIAL_KEYS.includes(sk)) { errors.push("unknown social: " + sk); continue; }
          const sv = v[sk];
          if (typeof sv !== "string" || sv.length > SOCIAL_MAX) {
            errors.push("socials." + sk + ": string <= 200 chars");
          } else if (sk === "website" && !HTTPS_RE.test(sv)) {
            errors.push("socials.website: https URL"); // website link must be https too
          } else s[sk] = sv;
        }
        if (Object.keys(s).length === Object.keys(v).length) value.socials = s;
      }
    }
  }
  return { ok: errors.length === 0, errors, value: errors.length === 0 ? value : null };
}

// ---- Streaks (B-PRO-002; activity series is the SINGLE source of truth) ----
// A day is ACTIVE when the activity series shows testsCompleted >= 1 for that
// UTC date. current = consecutive active days ending at the most recent active
// day, alive iff that day is today or yesterday (UTC, INJECTED clock), else 0.
// max = the longest run of consecutive active days in the whole series.
export function computeStreaks(activityDays, now) {
  const active = [...new Set(
    (activityDays ?? []).filter((d) => d.testsCompleted >= 1).map((d) => d.date)
  )].sort();
  if (active.length === 0) return { current: 0, max: 0 };
  const ms = (d) => Date.parse(d + "T00:00:00.000Z");
  const consecutive = (a, b) => ms(b) - ms(a) === DAY_MS; // b is the day after a
  // max run over the full series
  let max = 1, run = 1;
  for (let i = 1; i < active.length; i++) {
    run = consecutive(active[i - 1], active[i]) ? run + 1 : 1;
    if (run > max) max = run;
  }
  // current: run ending at the most recent active day, gated on aliveness
  const lastDay = active[active.length - 1];
  const today = utcDay(now), yesterday = utcDay(now - DAY_MS);
  const alive = lastDay === today || lastDay === yesterday;
  let current = 0;
  if (alive) {
    current = 1;
    for (let i = active.length - 1; i > 0 && consecutive(active[i - 1], active[i]); i--) current++;
  }
  return { current, max };
}

// ---- Level (B-PRO-003; curve coefficients DELEGATED — documented here) ----
// level = floor(sqrt(xp / XP_PER_LEVEL_SQ)) with XP_PER_LEVEL_SQ = 10, i.e.
// level n requires total xp >= 10 * n^2 (level 1 at 10 xp, 2 at 40, 3 at 90,
// 10 at 1000, 20 at 4000). Monotonically non-decreasing in xp by construction,
// deterministic, integer >= 0, RECOMPUTED on every read — never stored.
export const XP_PER_LEVEL_SQ = 10;
export function levelFor(xp) {
  if (!(xp > 0)) return 0;
  return Math.floor(Math.sqrt(xp / XP_PER_LEVEL_SQ));
}

// ---- Total XP (B-PRO-001) ----
// Sum of the sealed per-result xp fields (leaderboards B-LB-007 xpOf) over the
// user's stored results. round2 for stable floats (B-STS-001-style determinism).
export function totalXp(mine) {
  return round2((mine ?? []).reduce((sum, r) => sum + xpOf(r), 0));
}

// ---- B-PRO-001 composition: the served profile shape (profile.schema.json) ----
// pbs/aggregates are the EXACT result-stats handshake payloads (pass-through);
// streaks derive ONLY from the activity series; xp/level recomputed per read.
export function composeProfile({ user, mine, stored, now }) {
  const xp = totalXp(mine);
  return {
    name: user.name,               // user-account (frozen) — read only
    addedAt: user.addedAt,         // user-account (frozen) — read only
    xp,
    level: levelFor(xp),
    streaks: computeStreaks(computeActivity(mine).days, now),
    publicFields: publicFieldsOf(stored),
    pbs: computePbTable(mine),          // pass-through: { pbs: [...] }
    aggregates: computeAggregates(mine), // pass-through: { modes: [...] }
  };
}
