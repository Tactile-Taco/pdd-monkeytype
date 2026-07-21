// Focused unit tests for the wave-3 sealed bundles:
//   user-profile v1.0.0 (NEW) · public-api v1.0.0 (NEW)
// Every test carries invariant lineage. Run: node --test implementation/tests/
// (The formal validator-suite extension for the new invariant IDs is a later
// stage; these are the candidate's own cheap checks, per wave precedent.)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bootApp, makeEvent } from "../../harness/boot.mjs";
import { loadBundle } from "../../harness/schema-loader.mjs";
import { createApp } from "../src/server/app.js";
import { computeStreaks, levelFor, totalXp, validateProfileUpdate, publicFieldsOf,
         isPublicOf, XP_PER_LEVEL_SQ, DAY_MS } from "../src/shared/profile.js";
import { mintApeKey, hashKey, authenticateApeKey, validateApeKeyCreate, serveApeKey,
         createRateLimiter, SCOPES, APEKEY_PREFIX, RATE_KEY_LIMIT, RATE_IP_LIMIT,
         RATE_WINDOW_MS } from "../src/shared/apekeys.js";
import { xpOf } from "../src/shared/leaderboards.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const P = (b) => join(root, "protocols", b);
const rid = () => Math.random().toString(36).slice(2, 10);

// bootApp twin with an INJECTABLE clock (wave-3 surfaces: streak aliveness,
// rate-limit windows). harness/boot.mjs is the Validator's surface — unchanged.
async function bootAppClock(start) {
  let t = start;
  const dataDir = mkdtempSync(join(tmpdir(), "pdd-data-"));
  const app = createApp({ dataDir, implVersion: "candidate", now: () => t });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = "GET", body, token } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, body: json, headers: res.headers };
  };
  const signup = async (name, password = "password123") => {
    const r = await call("/api/account/signup", { method: "POST", body: { name, password } });
    return r.body?.token;
  };
  return { base, call, signup, dataDir, app,
           setNow: (x) => { t = x; }, getNow: () => t,
           close: () => server.close() };
}

const T0 = Date.parse("2026-07-20T12:00:00.000Z"); // fixed reference instant (a Monday)
const day = (iso) => Date.parse(iso + "T00:00:00.000Z");

// =====================================================================
// user-profile v1.0.0
// =====================================================================
test("S-PRO-001/B-PRO-001: own read conforms to profile.schema.json; composed values equal sources", async () => {
  const app = await bootApp();
  try {
    const res = loadBundle(P("user-profile"));
    const t = await app.signup("pro" + rid());
    const e1 = makeEvent({ wpm: 100, hash: "p1" + rid(), timestamp: Date.now() });
    const e2 = makeEvent({ wpm: 120, hash: "p2" + rid(), timestamp: Date.now(), mode2: "60", testDuration: 60 });
    await app.call("/api/results", { method: "POST", token: t, body: e1 });
    await app.call("/api/results", { method: "POST", token: t, body: e2 });
    const prof = await app.call("/api/profile", { token: t });
    assert.equal(prof.status, 200);
    const v = res.validate("profile.schema.json", prof.body);
    assert.ok(v.ok, JSON.stringify(v.errors));
    // identity from user-account
    const acc = await app.call("/api/account/profile", { token: t });
    assert.equal(prof.body.name, acc.body.name);
    assert.equal(prof.body.addedAt, acc.body.addedAt);
    // pass-through EQUALS the result-stats handshakes (B-PRO-001)
    const pbs = await app.call("/api/stats/pbs", { token: t });
    const agg = await app.call("/api/stats/aggregates", { token: t });
    assert.deepEqual(prof.body.pbs, pbs.body);
    assert.deepEqual(prof.body.aggregates, agg.body);
    // xp = sum of the sealed per-result xp fields over the user's stored results
    const hist = await app.call("/api/results", { token: t });
    const expectedXp = Math.round(hist.body.results.reduce((s, r) => s + xpOf(r), 0) * 100) / 100;
    assert.equal(prof.body.xp, expectedXp);
    assert.equal(prof.body.level, levelFor(expectedXp));
    // no cached derived state: a new result is reflected on the NEXT read
    await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ wpm: 90, hash: "p3" + rid(), timestamp: Date.now() }) });
    const prof2 = await app.call("/api/profile", { token: t });
    assert.ok(prof2.body.xp > prof.body.xp);
  } finally { app.close(); }
});

test("B-PRO-002: streaks — consecutive UTC days; alive iff last active today/yesterday; current vs max", () => {
  const D = (n) => ({ date: n, testsCompleted: 1, timeTypingSeconds: 15 });
  const off = (base, days) => new Date(base + days * DAY_MS).toISOString().slice(0, 10);
  const base = day("2026-07-10");
  const series = (...offsets) => offsets.map((o) => D(off(base, o)));
  // 3-day run ending yesterday => current 3, max 3
  const now = day("2026-07-20") + 12 * 3600 * 1000;
  assert.deepEqual(computeStreaks(series(7, 8, 9), now), { current: 3, max: 3 });
  // ending today => alive
  assert.deepEqual(computeStreaks(series(9, 10), now), { current: 2, max: 2 });
  // ending 2 days ago => dead: current 0, max preserved
  assert.deepEqual(computeStreaks(series(7, 8), now), { current: 0, max: 2 });
  // gap breaks current, max is the LONGEST run
  assert.deepEqual(computeStreaks(series(1, 2, 3, 6, 8, 9, 10), now), { current: 3, max: 3 });
  // empty series
  assert.deepEqual(computeStreaks([], now), { current: 0, max: 0 });
  // a day with testsCompleted 0 is NOT active
  assert.deepEqual(computeStreaks([{ date: off(base, 9), testsCompleted: 0 }], now), { current: 0, max: 0 });
  // duplicate + unordered days are tolerated (defensive)
  assert.deepEqual(computeStreaks([D(off(base, 10)), D(off(base, 9)), D(off(base, 9))], now), { current: 2, max: 2 });
  // boundary fuzz: now exactly at UTC midnight — "today" rolled over
  const midnight = day("2026-07-20");
  assert.deepEqual(computeStreaks(series(9), midnight), { current: 1, max: 1 }); // yesterday still alive
  assert.deepEqual(computeStreaks(series(8), midnight), { current: 0, max: 1 }); // day-before dead
  // one ms before midnight: day 9 is still "today"
  assert.deepEqual(computeStreaks(series(9), midnight - 1), { current: 1, max: 1 });
});

test("B-PRO-002: streaks derive ONLY from the activity series (HTTP, injected clock)", async () => {
  const app = await bootAppClock(T0); // now = 2026-07-20 12:00 UTC
  try {
    const t = await app.signup("stk" + rid());
    // results on Jul 17, 18, 19 UTC (timestamps within those days)
    for (const [d, i] of [["2026-07-17", 1], ["2026-07-18", 2], ["2026-07-19", 3]]) {
      await app.call("/api/results", { method: "POST", token: t,
        body: makeEvent({ hash: "s" + i + rid(), timestamp: day(d) + 8 * 3600 * 1000 }) });
    }
    const prof = await app.call("/api/profile", { token: t });
    assert.deepEqual(prof.body.streaks, { current: 3, max: 3 }); // last active yesterday => alive
    // advancing the clock 2 days kills the current streak, max stands
    app.setNow(T0 + 2 * DAY_MS);
    const prof2 = await app.call("/api/profile", { token: t });
    assert.deepEqual(prof2.body.streaks, { current: 0, max: 3 });
    // a result on the new "today" revives: run of 1 (gap broke the chain)
    await app.call("/api/results", { method: "POST", token: t,
      body: makeEvent({ hash: "s9" + rid(), timestamp: T0 + 2 * DAY_MS }) });
    const prof3 = await app.call("/api/profile", { token: t });
    assert.deepEqual(prof3.body.streaks, { current: 1, max: 3 });
    // streaks equal an activity-series derivation (single source of truth)
    const act = await app.call("/api/stats/activity", { token: t });
    assert.deepEqual(prof3.body.streaks, computeStreaks(act.body.days, app.getNow()));
  } finally { app.close(); }
});

test("B-PRO-003: level is monotonically non-decreasing in xp, deterministic, integer >= 0", () => {
  let prev = -1;
  for (let xp = 0; xp <= 200000; xp = xp * 1.3 + 7) {
    const l = levelFor(xp);
    assert.ok(Number.isInteger(l) && l >= 0);
    assert.ok(l >= prev, `level(${xp})=${l} < level(prev)=${prev}`);
    assert.equal(levelFor(xp), l); // deterministic
    prev = l;
  }
  // documented delegated curve: level n requires xp >= XP_PER_LEVEL_SQ * n^2
  assert.equal(levelFor(0), 0);
  assert.equal(levelFor(XP_PER_LEVEL_SQ - 0.01), 0);
  assert.equal(levelFor(XP_PER_LEVEL_SQ), 1);
  assert.equal(levelFor(4 * XP_PER_LEVEL_SQ), 2);
  assert.equal(levelFor(100 * XP_PER_LEVEL_SQ), 10);
  assert.ok(levelFor(totalXp([{ wpm: 100, acc: 100, testDuration: 60 }])) >= 1);
});

test("B-PRO-004/S-PRO-003: strict edits — closed shape, domains, all-or-nothing", async () => {
  const app = await bootApp();
  try {
    const res = loadBundle(P("user-profile"));
    const t = await app.signup("edt" + rid());
    // valid full patch
    const ok = await app.call("/api/profile", { method: "PATCH", token: t, body: {
      bio: "fast typist", avatarUrl: "https://cdn.example.com/a.png",
      socials: { website: "https://me.example.com", twitter: "@fast", github: "fastgh" }, isPublic: true } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.publicFields.bio, "fast typist");
    assert.equal(ok.body.publicFields.socials.website, "https://me.example.com");
    // module-level validator sweeps
    assert.ok(validateProfileUpdate({ bio: "x".repeat(500) }).ok);
    assert.ok(!validateProfileUpdate({ bio: "x".repeat(501) }).ok);
    assert.ok(!validateProfileUpdate({ avatarUrl: "http://insecure.example.com/a.png" }).ok); // https ONLY
    assert.ok(!validateProfileUpdate({ avatarUrl: "ftp://x" }).ok);
    assert.ok(validateProfileUpdate({ avatarUrl: "https://x/" + "a".repeat(490) }).ok); // exactly 500
    assert.ok(!validateProfileUpdate({ avatarUrl: "https://x/" + "a".repeat(491) }).ok); // 501 > 500
    assert.ok(!validateProfileUpdate({ socials: { website: "http://nope" } }).ok); // website https
    assert.ok(!validateProfileUpdate({ socials: { twitter: "t".repeat(201) } }).ok);
    assert.ok(!validateProfileUpdate({ socials: { mastodon: "@x@y" } }).ok); // unknown social key
    assert.ok(!validateProfileUpdate({ isPublic: "yes" }).ok); // boolean only
    assert.ok(!validateProfileUpdate({ role: "admin" }).ok); // unknown top-level key
    assert.ok(!validateProfileUpdate({}).ok); // minProperties 1
    assert.ok(!validateProfileUpdate(null).ok);
    // HTTP: every invalid update => 422 envelope with ZERO fields written
    const before = (await app.call("/api/profile", { token: t })).body;
    for (const bad of [
      { bio: "x".repeat(501) },
      { avatarUrl: "http://evil.example.com/a.png" },
      { socials: { website: "not-a-url" } },
      { socials: { github: "g".repeat(201) } },
      { isPublic: 1 },
      { bio: "fine", role: "admin" }, // one bad key poisons the whole update
      {},
    ]) {
      const r = await app.call("/api/profile", { method: "PATCH", token: t, body: bad });
      assert.equal(r.status, 422, JSON.stringify(bad));
      assert.ok(res.validate("error.schema.json", r.body).ok); // S-PRO-002
      const after = (await app.call("/api/profile", { token: t })).body;
      assert.deepEqual(after.publicFields, before.publicFields); // all-or-nothing: unchanged
    }
    // unauthenticated edit rejected before validation
    const unauth = await app.call("/api/profile", { method: "PATCH", body: { bio: "x" } });
    assert.equal(unauth.status, 401);
  } finally { app.close(); }
});

test("B-PRO-005: public read — public shape only; private indistinguishable from unknown", async () => {
  const app = await bootApp();
  try {
    const res = loadBundle(P("user-profile"));
    const name = "vis" + rid();
    const t = await app.signup(name);
    await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ hash: "v" + rid(), timestamp: Date.now() }) });
    // public read, default isPublic=true, case-insensitive lookup
    const pub = await app.call("/api/profile/" + name.toUpperCase());
    assert.equal(pub.status, 200);
    assert.ok(res.validate("profile.schema.json", pub.body).ok);
    // public shape only — never account internals
    const leak = ["uid", "pw", "password", "email", "token", "moderator", "isPublic", "hash"];
    const flat = JSON.stringify(pub.body);
    for (const k of ["uid", "pw", "email", "token", "moderator", "isPublic"]) {
      assert.ok(!(k in pub.body) && !(k in (pub.body.publicFields ?? {})), "leak: " + k);
    }
    assert.ok(!flat.includes("scrypt") && !flat.includes('"hash"'), leak.join(","));
    // unknown name => 404 envelope
    const unknown = await app.call("/api/profile/nope-" + rid());
    assert.equal(unknown.status, 404);
    assert.ok(res.validate("error.schema.json", unknown.body).ok);
    // flip private => IDENTICAL 404-shaped envelope (code+message+status)
    await app.call("/api/profile", { method: "PATCH", token: t, body: { isPublic: false } });
    const priv = await app.call("/api/profile/" + name);
    assert.equal(priv.status, unknown.status);
    assert.equal(priv.body.error.code, unknown.body.error.code);
    assert.equal(priv.body.error.message, unknown.body.error.message);
    assert.ok(res.validate("error.schema.json", priv.body).ok);
    // owner's own read is UNAFFECTED
    const own = await app.call("/api/profile", { token: t });
    assert.equal(own.status, 200);
    // flip back public => visible again
    await app.call("/api/profile", { method: "PATCH", token: t, body: { isPublic: true } });
    assert.equal((await app.call("/api/profile/" + name)).status, 200);
    // defaults helpers
    assert.equal(isPublicOf(undefined), true);
    assert.deepEqual(publicFieldsOf(undefined), { bio: "", avatarUrl: "", socials: {} });
  } finally { app.close(); }
});

// =====================================================================
// public-api v1.0.0
// =====================================================================
test("B-API-001: key format pdd_+128-bit hex; show-once; salted hash at rest (no plaintext on disk)", async () => {
  const app = await bootApp();
  try {
    const t = await app.signup("key" + rid());
    const c = await app.call("/api/apekeys", { method: "POST", token: t, body: { name: "ci", scopes: ["results:read"] } });
    assert.equal(c.status, 201);
    const { key, apekey } = c.body;
    // format: literal pdd_ prefix + 32 hex chars (128-bit entropy)
    assert.match(key, /^pdd_[0-9a-f]{32}$/);
    // plaintext shown ONCE: list + subsequent reads never carry it
    const list = await app.call("/api/apekeys", { token: t });
    assert.equal(JSON.stringify(list.body).includes(key), false);
    // at rest: the store file contains salt+hash but NOT the plaintext
    const onDisk = readFileSync(join(app.dataDir, "apekeys.json"), "utf8");
    assert.ok(!onDisk.includes(key), "plaintext leaked to disk");
    const stored = JSON.parse(onDisk).apekeys[0];
    assert.equal(stored.hash, hashKey(stored.salt, key)); // salted hash verifies
    // metadata shape conforms to apekey.schema.json (closed; no key material)
    const res = loadBundle(P("public-api"));
    assert.ok(res.validate("apekey.schema.json", apekey).ok, JSON.stringify(res.validate("apekey.schema.json", apekey).errors));
    assert.ok(res.validate("apekey.schema.json", list.body.apekeys[0]).ok);
    assert.equal(apekey.hash, undefined);
    assert.equal(apekey.salt, undefined);
    assert.equal(apekey.uid, undefined);
    // module: 1000 mints are unique and well-formed
    const seen = new Set();
    for (let i = 0; i < 1000; i++) {
      const m = mintApeKey();
      assert.match(m.plaintext, /^pdd_[0-9a-f]{32}$/);
      seen.add(m.plaintext);
      assert.equal(m.hash, hashKey(m.salt, m.plaintext));
    }
    assert.equal(seen.size, 1000);
  } finally { app.close(); }
});

test("B-API-001/003: revoke idempotent + fail-closed; disabled/unknown keys never authenticate", async () => {
  const app = await bootApp();
  try {
    const t = await app.signup("rev" + rid());
    const c = await app.call("/api/apekeys", { method: "POST", token: t, body: { name: "k", scopes: SCOPES } });
    const { key, apekey } = c.body;
    assert.equal((await app.call("/api/public/results", { token: key })).status, 200);
    // revoke twice: idempotent
    const d1 = await app.call(`/api/apekeys/${apekey.id}`, { method: "DELETE", token: t });
    assert.equal(d1.status, 200);
    assert.equal(d1.body.enabled, false);
    const d2 = await app.call(`/api/apekeys/${apekey.id}`, { method: "DELETE", token: t });
    assert.equal(d2.status, 200);
    // revoked key == unknown key (fail-closed), indistinguishable 401
    const after = await app.call("/api/public/results", { token: key });
    assert.equal(after.status, 401);
    const unknown = await app.call("/api/public/results", { token: APEKEY_PREFIX + "0".repeat(32) });
    assert.equal(unknown.status, 401);
    assert.equal(after.body.error.code, unknown.body.error.code);
    // foreign key id cannot be revoked by another user (indistinguishable 404)
    const t2 = await app.signup("rev" + rid());
    const foreign = await app.call(`/api/apekeys/${apekey.id}`, { method: "DELETE", token: t2 });
    assert.equal(foreign.status, 404);
    // module: disabled record behaves as unknown
    const m = mintApeKey();
    const rec = { id: "x", hash: m.hash, salt: m.salt, enabled: false };
    assert.equal(authenticateApeKey([rec], m.plaintext), null);
    rec.enabled = true;
    assert.equal(authenticateApeKey([rec], m.plaintext), rec);
    assert.equal(authenticateApeKey([rec], m.plaintext.slice(0, -1) + "0"), null);
  } finally { app.close(); }
});

test("B-API-002: constant-time compare — no early exit; duration independent of match position", () => {
  // Structural proxy for the sealed statistical gate (the formal timing gate
  // with its tolerance band is the validator stage): with N stored keys, an
  // implementation that short-circuits on a match would return after ~1/N of
  // the work for a match on the FIRST record. Medians over repeated runs with
  // a generous 3x band distinguish that robustly (early-exit => >50x).
  const N = 200;
  const recs = [];
  for (let i = 0; i < N; i++) {
    const m = mintApeKey();
    recs.push({ id: "k" + i, hash: m.hash, salt: m.salt, enabled: true, plaintext: m.plaintext });
  }
  const timeMed = (presented) => {
    const samples = [];
    for (let i = 0; i < 30; i++) {
      const t0 = process.hrtime.bigint();
      authenticateApeKey(recs, presented);
      samples.push(Number(process.hrtime.bigint() - t0));
    }
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)];
  };
  const missT = timeMed(APEKEY_PREFIX + "f".repeat(32));        // no match: full scan
  const firstT = timeMed(recs[0].plaintext);                    // match at position 0
  const lastT = timeMed(recs[N - 1].plaintext);                 // match at last position
  assert.ok(firstT < missT * 3 && lastT < missT * 3,
    `early-exit suspected: miss=${missT}ns first=${firstT}ns last=${lastT}ns`);
  // correctness: matches found regardless of position
  assert.equal(authenticateApeKey(recs, recs[0].plaintext)?.id, "k0");
  assert.equal(authenticateApeKey(recs, recs[N - 1].plaintext)?.id, "k" + (N - 1));
});

test("B-API-002: domain separation — session tokens rejected on API; ApeKeys rejected on session routes", async () => {
  const app = await bootApp();
  try {
    const t = await app.signup("dom" + rid());
    const c = await app.call("/api/apekeys", { method: "POST", token: t, body: { name: "k", scopes: SCOPES } });
    const key = c.body.key;
    // session token on the API surface => 401 (never accepted)
    const s = await app.call("/api/public/results", { token: t });
    assert.equal(s.status, 401);
    // ApeKey on session-gated bundle endpoints => 401 (never accepted)
    for (const p of ["/api/results", "/api/config", "/api/stats/aggregates", "/api/profile", "/api/apekeys"]) {
      assert.equal((await app.call(p, { token: key })).status, 401, p);
    }
  } finally { app.close(); }
});

test("S-API-001: create requests conform to the sealed create schema; unknown scopes/keys fail-closed", async () => {
  const app = await bootApp();
  try {
    const t = await app.signup("sc" + rid());
    const bad = [
      { scopes: ["results:read"] },                       // name required
      { name: "x" },                                      // scopes required
      { name: "x", scopes: [] },                          // minItems 1
      { name: "x", scopes: ["results:write"] },           // unknown scope
      { name: "x", scopes: ["admin"] },                   // unknown scope
      { name: "x", scopes: ["results:read"], extra: 1 },  // unknown key
      { name: "", scopes: ["results:read"] },             // minLength 1
      { name: "n".repeat(101), scopes: ["results:read"] },// maxLength 100
      { name: "x", scopes: [42] },                        // wrong item type
    ];
    for (const b of bad) {
      const r = await app.call("/api/apekeys", { method: "POST", token: t, body: b });
      assert.equal(r.status, 422, JSON.stringify(b));
      assert.ok(loadBundle(P("public-api")).validate("error.schema.json", r.body).ok); // S-API-002
    }
    assert.equal((await app.call("/api/apekeys", { token: t })).body.apekeys.length, 0); // nothing persisted
    const good = await app.call("/api/apekeys", { method: "POST", token: t, body: { name: "ok", scopes: ["stats:read", "stats:read"] } });
    assert.equal(good.status, 201); // duplicate scopes are schema-legal, stored verbatim
    assert.deepEqual(good.body.apekey.scopes, ["stats:read", "stats:read"]);
    // module-level validator mirrors the sealed schema
    assert.ok(validateApeKeyCreate({ name: "a", scopes: ["quotes:read"] }).ok);
    assert.ok(!validateApeKeyCreate({ name: "a", scopes: ["quotes:write"] }).ok);
    assert.ok(!validateApeKeyCreate({ name: "a" }).ok);
  } finally { app.close(); }
});

test("B-API-003: scope enforcement fail-closed — out-of-scope 403 envelope; zero matching scopes accesses nothing", async () => {
  const app = await bootApp();
  try {
    const res = loadBundle(P("public-api"));
    const t = await app.signup("scp" + rid());
    const c = await app.call("/api/apekeys", { method: "POST", token: t, body: { name: "narrow", scopes: ["results:read"] } });
    const key = c.body.key;
    assert.equal((await app.call("/api/public/results", { token: key })).status, 200);
    assert.equal((await app.call("/api/public/results/pbs", { token: key })).status, 200);
    for (const p of ["/api/public/stats/aggregates", "/api/public/stats/pbs", "/api/public/stats/activity",
                     "/api/public/stats/wpm-series", "/api/public/profile", "/api/public/quotes", "/api/public/quotes/random"]) {
      const r = await app.call(p, { token: key });
      assert.equal(r.status, 403, p);
      assert.equal(r.body.error.code, "forbidden");
      assert.ok(res.validate("error.schema.json", r.body).ok, p); // S-API-002
    }
    // every scope opens exactly its own surface
    for (const s of SCOPES) {
      const k2 = (await app.call("/api/apekeys", { method: "POST", token: t, body: { name: "one-" + s, scopes: [s] } })).body.key;
      const open = { "results:read": "/api/public/results", "stats:read": "/api/public/stats/aggregates",
                     "profile:read": "/api/public/profile", "quotes:read": "/api/public/quotes" }[s];
      assert.equal((await app.call(open, { token: k2 })).status, 200, s);
      const others = Object.values({ "results:read": "/api/public/results", "stats:read": "/api/public/stats/aggregates",
                                     "profile:read": "/api/public/profile", "quotes:read": "/api/public/quotes" })
        .filter((p) => p !== open);
      for (const p of others) assert.equal((await app.call(p, { token: k2 })).status, 403, s + " -> " + p);
    }
  } finally { app.close(); }
});

test("B-API-004: mirrored surface recompute-EQUALS the source handshakes (incl. exclusion semantics)", async () => {
  const app = await bootApp();
  try {
    const t = await app.signup("par" + rid());
    // fixture: normal x2, minThresholdFailed, bailed, zen (never stored)
    await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ wpm: 100, hash: "a" + rid(), timestamp: Date.now() }) });
    await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ wpm: 200, minThresholdFailed: true, hash: "b" + rid(), timestamp: Date.now() }) });
    await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ wpm: 90, bailedOut: true, hash: "c" + rid(), timestamp: Date.now() }) });
    await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ mode: "zen", mode2: "", bailedOut: true, hash: "z" + rid() }) });
    const c = await app.call("/api/apekeys", { method: "POST", token: t, body: { name: "full", scopes: SCOPES } });
    const key = c.body.key;
    // results + pbs byte-equal (zen absence / flag persistence ride along)
    for (const p of ["/results", "/results/pbs"]) {
      const viaSession = await app.call("/api" + p, { token: t });
      const viaKey = await app.call("/api/public" + p, { token: key });
      assert.deepEqual(viaKey.body, viaSession.body, p);
      assert.equal(viaKey.status, 200);
    }
    const hist = (await app.call("/api/public/results", { token: key })).body.results;
    assert.equal(hist.length, 3); // zen absent on BOTH surfaces
    assert.ok(hist.every((r) => r.mode !== "zen"));
    assert.equal(hist.find((r) => r.wpm === 200).minThresholdFailed, true); // flag visible
    // stats four endpoints byte-equal
    for (const s of ["aggregates", "pbs", "activity", "wpm-series"]) {
      const viaSession = await app.call("/api/stats/" + s, { token: t });
      const viaKey = await app.call("/api/public/stats/" + s, { token: key });
      assert.deepEqual(viaKey.body, viaSession.body, s);
    }
    // profile byte-equal (modulo streak clock — same injected wall clock here)
    const viaSession = await app.call("/api/profile", { token: t });
    const viaKey = await app.call("/api/public/profile", { token: key });
    assert.deepEqual(viaKey.body, viaSession.body);
    // quotes byte-equal incl. approved-only semantics; seeded random equal too
    const qs = await app.call("/api/quotes?language=english", { token: t });
    const qk = await app.call("/api/public/quotes?language=english", { token: key });
    assert.deepEqual(qk.body, qs.body);
    const rs = await app.call("/api/quotes/random?seed=42");
    const rk = await app.call("/api/public/quotes/random?seed=42", { token: key });
    assert.deepEqual(rk.body, rs.body);
    // tag filter rides along on the mirror
    const tag = await app.call("/api/results/tags", { method: "POST", token: t, body: { name: "T" + rid() } });
    const rid1 = hist.find((r) => r.wpm === 100).id;
    await app.call(`/api/results/${rid1}/tags`, { method: "POST", token: t, body: { tagId: tag.body.id } });
    const fs = await app.call("/api/results?tags=" + tag.body.id, { token: t });
    const fk = await app.call("/api/public/results?tags=" + tag.body.id, { token: key });
    assert.deepEqual(fk.body, fs.body);
  } finally { app.close(); }
});

test("B-API-005: per-key fixed window — 429 envelope + retry metadata; deterministic under injected clock", async () => {
  const app = await bootAppClock(T0);
  try {
    const res = loadBundle(P("public-api"));
    const t = await app.signup("rl" + rid());
    const key = (await app.call("/api/apekeys", { method: "POST", token: t, body: { name: "k", scopes: SCOPES } })).body.key;
    // RATE_KEY_LIMIT requests pass; the next one is limited (same fixed window)
    for (let i = 0; i < RATE_KEY_LIMIT; i++) {
      const r = await app.call("/api/public/quotes?x=" + i, { token: key });
      assert.equal(r.status, 200, "request " + (i + 1));
    }
    const over = await app.call("/api/public/quotes", { token: key });
    assert.equal(over.status, 429);
    assert.equal(over.body.error.code, "rate_limited");
    assert.ok(res.validate("error.schema.json", over.body).ok); // S-API-002
    // retry metadata: Retry-After + X-RateLimit-* headers, consistent with the window
    const retryAfter = Number(over.headers.get("retry-after"));
    assert.ok(retryAfter >= 1 && retryAfter <= RATE_WINDOW_MS / 1000, "Retry-After " + retryAfter);
    assert.equal(over.headers.get("x-ratelimit-limit"), String(RATE_KEY_LIMIT));
    assert.equal(over.headers.get("x-ratelimit-remaining"), "0");
    // still over-limit one second later (same window); a second key is UNAFFECTED
    app.setNow(T0 + 1000);
    assert.equal((await app.call("/api/public/quotes", { token: key })).status, 429);
    const key2 = (await app.call("/api/apekeys", { method: "POST", token: t, body: { name: "k2", scopes: SCOPES } })).body.key;
    assert.equal((await app.call("/api/public/quotes", { token: key2 })).status, 200);
    // crossing the window boundary resets the counter (deterministic windows)
    app.setNow(T0 - (T0 % RATE_WINDOW_MS) + RATE_WINDOW_MS + 1); // next window edge + 1ms
    assert.equal((await app.call("/api/public/quotes", { token: key })).status, 200);
  } finally { app.close(); }
});

test("B-API-005/O-API-003: rate limiter module — window edges, per-IP >= per-key, eviction", () => {
  assert.ok(RATE_IP_LIMIT >= RATE_KEY_LIMIT); // the per-key dimension stays the tested contract
  const lim = createRateLimiter({ windowMs: 1000, keyLimit: 3, ipLimit: 5 });
  const W = 10_000; // window #10 starts at t=10000
  // key dimension: 3 allowed, 4th denied with exact retry metadata
  assert.equal(lim.consume("key", "k1", W).allowed, true);
  assert.equal(lim.consume("key", "k1", W + 1).allowed, true);
  assert.equal(lim.consume("key", "k1", W + 999).allowed, true); // same window (edge)
  const over = lim.consume("key", "k1", W + 999);
  assert.equal(over.allowed, false);
  assert.equal(over.retryAfterMs, 1); // 1ms to the window flip
  assert.equal(over.resetMs, W + 1000);
  assert.equal(over.limit, 3);
  assert.equal(lim.consume("key", "k1", W + 1000).allowed, true); // next window resets
  // dimensions are independent
  assert.equal(lim.peek("ip", "k1", W + 1000), 0);
  // ip dimension: 5 allowed, 6th denied; ids independent
  for (let i = 0; i < 5; i++) assert.equal(lim.consume("ip", "1.1.1.1", W).allowed, true);
  assert.equal(lim.consume("ip", "1.1.1.1", W).allowed, false);
  assert.equal(lim.consume("ip", "2.2.2.2", W).allowed, true);
  // stale windows are evicted (bounded memory)
  lim.consume("key", "k1", W + 5000);
  assert.equal(lim.peek("key", "k1", W), 0);
});

test("O-API-003: per-IP dimension trips at the documented ceiling (>= per-key), same envelope + metadata", async () => {
  const app = await bootAppClock(T0);
  try {
    const t = await app.signup("ip" + rid());
    // two keys, each stays UNDER the per-key limit; combined they exhaust the IP budget
    const k1 = (await app.call("/api/apekeys", { method: "POST", token: t, body: { name: "a", scopes: SCOPES } })).body.key;
    const k2 = (await app.call("/api/apekeys", { method: "POST", token: t, body: { name: "b", scopes: SCOPES } })).body.key;
    const perKey = Math.floor(RATE_IP_LIMIT / 2); // 60 each with defaults — at or under key limit
    for (let i = 0; i < perKey; i++) {
      assert.equal((await app.call("/api/public/quotes?i=" + i, { token: k1 })).status, 200, "k1 #" + i);
      assert.equal((await app.call("/api/public/quotes?i=" + i, { token: k2 })).status, 200, "k2 #" + i);
    }
    // both keys' next request exceeds the per-IP ceiling (120 consumed). The IP
    // dimension is checked FIRST, so these 429s carry the IP limit as metadata —
    // and do NOT consume per-key quota (k1/k2 stay at exactly 60).
    const over1 = await app.call("/api/public/quotes", { token: k1 });
    assert.equal(over1.status, 429);
    assert.equal(over1.body.error.code, "rate_limited");
    assert.equal(over1.headers.get("x-ratelimit-limit"), String(RATE_IP_LIMIT));
    assert.ok(Number(over1.headers.get("retry-after")) >= 1);
    assert.equal((await app.call("/api/public/quotes", { token: k2 })).status, 429);
    // a FRESH key (full per-key budget left) from the hot IP is still 429:
    // the limiting dimension is the IP, not the key
    const k3 = (await app.call("/api/apekeys", { method: "POST", token: t, body: { name: "c", scopes: SCOPES } })).body.key;
    const hot = await app.call("/api/public/quotes", { token: k3 });
    assert.equal(hot.status, 429);
    assert.equal(hot.headers.get("x-ratelimit-limit"), String(RATE_IP_LIMIT));
    // the SAME fresh key from a DIFFERENT source IP is unaffected
    // (x-forwarded-for honored for the IP dimension; delegated surface)
    const other = await fetch(app.base + "/api/public/quotes", { headers: { authorization: "Bearer " + k3, "x-forwarded-for": "203.0.113.9" } });
    assert.equal(other.status, 200);
    // unauthenticated requests from the hot IP are also 429 (IP dimension guards the surface)
    assert.equal((await app.call("/api/public/quotes")).status, 429);
  } finally { app.close(); }
});

test("S-API-002: every API-surface failure (401/403/429/404) is the sealed ErrorEnvelope", async () => {
  const app = await bootApp();
  try {
    const res = loadBundle(P("public-api"));
    const t = await app.signup("env" + rid());
    const key = (await app.call("/api/apekeys", { method: "POST", token: t, body: { name: "k", scopes: ["profile:read"] } })).body.key;
    const checks = [
      await app.call("/api/public/results"),                          // 401 no key
      await app.call("/api/public/results", { token: "pdd_deadbeef" }),// 401 bad key
      await app.call("/api/public/results", { token: key }),          // 403 out-of-scope
      await app.call("/api/public/nope", { token: key }),             // 404 no such route
    ];
    for (const r of checks) {
      assert.ok([401, 403, 404].includes(r.status));
      assert.ok(res.validate("error.schema.json", r.body).ok, JSON.stringify(r.body));
    }
  } finally { app.close(); }
});
