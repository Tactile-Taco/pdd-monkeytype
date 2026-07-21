// Focused unit tests for the wave-2 sealed bundles:
//   test-results v1.2.0 · result-stats v1.0.0 · wordlists v1.0.0 ·
//   quote-library v1.1.0 · leaderboards v1.1.0
// Every test carries invariant lineage. Run: node --test implementation/tests/
// (The formal validator-suite extension for the new invariant IDs is a later
// stage; these are the candidate's own cheap checks, per wave precedent.)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bootApp, makeEvent } from "../../harness/boot.mjs";
import { loadBundle } from "../../harness/schema-loader.mjs";
import { admitCatalog, validateRegistryShape } from "../src/shared/wordlists.js";
import { serveQuote, quoteState, ratingWeight, weightedPickIndex, seededRand,
         searchQuotes, DEFAULT_QUOTE_WEIGHT, QUOTE_PAGE_SIZE } from "../src/shared/quotes.js";
import { computeAggregates, computePbTable, computeActivity, computeWpmSeries, utcDay } from "../src/shared/resultStats.js";
import { computeBoard, isEligible, inWindow, percentileOf, xpOf, DAILY_WINDOW_MS } from "../src/shared/leaderboards.js";
import { scopedPbs, matchesTagFilter, findTagByName } from "../src/shared/tags.js";
import { ENGLISH_200 } from "../src/engine/words.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const P = (b) => join(root, "protocols", b);
const DAY = 24 * 60 * 60 * 1000;
const rid = () => Math.random().toString(36).slice(2, 10);

// =====================================================================
// test-results v1.2.0
// =====================================================================
test("B-RES-001: zen admitted but NOT persisted (verdict + non-stored indicator)", async () => {
  const app = await bootApp();
  try {
    const t = await app.signup("zen" + rid());
    const zen = makeEvent({ mode: "zen", mode2: "", bailedOut: true, hash: "z" + rid() });
    const r1 = await app.call("/api/results", { method: "POST", token: t, body: zen });
    assert.equal(r1.status, 200); // not 201 — nothing created
    assert.equal(r1.body.verdict, "admit");
    assert.equal(r1.body.stored, false);
    assert.equal(r1.body.anticheat.decision, "admit"); // recorded verdict projection
    assert.equal(r1.body.id, undefined); // no record shape
    // repeated zen submissions never create records
    const r2 = await app.call("/api/results", { method: "POST", token: t, body: zen });
    assert.equal(r2.status, 200);
    const hist = await app.call("/api/results", { token: t });
    assert.equal(hist.body.results.length, 0); // history never contains mode=zen
    // zen with a REJECTED verdict is still unprocessable (not the non-stored shape)
    const bad = await app.call("/api/results", { method: "POST", token: t,
      body: makeEvent({ mode: "zen", mode2: "", wpm: 999, rawWpm: 999, hash: "z" + rid() }) });
    assert.equal(bad.status, 422);
  } finally { app.close(); }
});

test("B-RES-003: minThresholdFailed persisted, isPb=false, no demotion, excluded from PB reads", async () => {
  const app = await bootApp();
  try {
    const t = await app.signup("mt" + rid());
    const r1 = await app.call("/api/results", { method: "POST", token: t,
      body: makeEvent({ wpm: 100, hash: "a" + rid() }) });
    assert.equal(r1.body.isPb, true);
    // flagged result with HIGHER wpm: persisted, visible, but never PB and no demotion
    const r2 = await app.call("/api/results", { method: "POST", token: t,
      body: makeEvent({ wpm: 200, minThresholdFailed: true, hash: "b" + rid() }) });
    assert.equal(r2.status, 201);
    assert.equal(r2.body.minThresholdFailed, true); // flag persisted
    assert.equal(r2.body.isPb, false);
    const pbs = await app.call("/api/results/pbs", { token: t });
    assert.equal(pbs.body.pbs.length, 1);
    assert.equal(pbs.body.pbs[0].wpm, 100); // standing PB not demoted; flagged excluded from PB reads
    const hist = await app.call("/api/results", { token: t });
    assert.equal(hist.body.results.length, 2); // flagged visible in history
    assert.ok(hist.body.results.find((r) => r.wpm === 200).minThresholdFailed === true);
    // a later unflagged 150 still becomes PB (flagged 200 never counted as best)
    const r3 = await app.call("/api/results", { method: "POST", token: t,
      body: makeEvent({ wpm: 150, hash: "c" + rid() }) });
    assert.equal(r3.body.isPb, true);
  } finally { app.close(); }
});

test("S-RES-002: stored record conforms to the sealed stored-result schema (flag + tags)", async () => {
  const app = await bootApp();
  try {
    const res = loadBundle(P("test-results"));
    const t = await app.signup("sr" + rid());
    const r = await app.call("/api/results", { method: "POST", token: t,
      body: makeEvent({ minThresholdFailed: false, hash: "s" + rid() }) });
    assert.equal(r.status, 201);
    const v = res.validate("stored-result.schema.json", r.body);
    assert.ok(v.ok, JSON.stringify(v.errors));
    assert.deepEqual(r.body.tags, []);
  } finally { app.close(); }
});

test("B-RES-006(a): tag CRUD — unique per user case-insensitively, rename, schema shape", async () => {
  const app = await bootApp();
  try {
    const res = loadBundle(P("test-results"));
    const t = await app.signup("tg" + rid());
    const c = await app.call("/api/results/tags", { method: "POST", token: t, body: { name: "Speed" } });
    assert.equal(c.status, 201);
    assert.ok(res.validate("tag.schema.json", c.body).ok); // exactly {id, name}
    const dup = await app.call("/api/results/tags", { method: "POST", token: t, body: { name: "speed" } });
    assert.equal(dup.status, 409); // case-insensitive uniqueness
    const badName = await app.call("/api/results/tags", { method: "POST", token: t, body: { name: "" } });
    assert.equal(badName.status, 422);
    const id = c.body.id;
    const rn = await app.call(`/api/results/tags/${id}`, { method: "PATCH", token: t, body: { name: "PACE" } });
    assert.equal(rn.status, 200);
    assert.equal(rn.body.name, "PACE");
    // rename clash with a second tag (case-insensitive) -> 409
    const c2 = await app.call("/api/results/tags", { method: "POST", token: t, body: { name: "other" } });
    const clash = await app.call(`/api/results/tags/${c2.body.id}`, { method: "PATCH", token: t, body: { name: "pace" } });
    assert.equal(clash.status, 409);
    const missing = await app.call(`/api/results/tags/nope`, { method: "PATCH", token: t, body: { name: "x" } });
    assert.equal(missing.status, 404);
    const unauth = await app.call("/api/results/tags", { method: "POST", body: { name: "x" } });
    assert.equal(unauth.status, 401);
    const list = await app.call("/api/results/tags", { token: t });
    assert.deepEqual(list.body.tags.map((x) => x.name).sort(), ["PACE", "other"]);
  } finally { app.close(); }
});

test("B-RES-006(b): assignment — own results only; unknown/foreign tag fails", async () => {
  const app = await bootApp();
  try {
    const t1 = await app.signup("ta" + rid());
    const t2 = await app.signup("tb" + rid());
    const tag1 = (await app.call("/api/results/tags", { method: "POST", token: t1, body: { name: "mine" } })).body;
    const tag2 = (await app.call("/api/results/tags", { method: "POST", token: t2, body: { name: "theirs" } })).body;
    const r1 = (await app.call("/api/results", { method: "POST", token: t1, body: makeEvent({ hash: "r" + rid() }) })).body;
    // foreign tag -> 404 envelope (indistinguishable)
    const foreign = await app.call(`/api/results/${r1.id}/tags`, { method: "POST", token: t1, body: { tagId: tag2.id } });
    assert.equal(foreign.status, 404);
    // unknown tag -> 404
    const unknown = await app.call(`/api/results/${r1.id}/tags`, { method: "POST", token: t1, body: { tagId: "nope" } });
    assert.equal(unknown.status, 404);
    // assign + idempotent re-assign
    const a1 = await app.call(`/api/results/${r1.id}/tags`, { method: "POST", token: t1, body: { tagId: tag1.id } });
    assert.equal(a1.status, 200);
    assert.deepEqual(a1.body.tags, [tag1.id]);
    const a2 = await app.call(`/api/results/${r1.id}/tags`, { method: "POST", token: t1, body: { tagId: tag1.id } });
    assert.deepEqual(a2.body.tags, [tag1.id]); // one entry
    // foreign RESULT -> 404
    const fr = await app.call(`/api/results/${r1.id}/tags`, { method: "POST", token: t2, body: { tagId: tag2.id } });
    assert.equal(fr.status, 404);
    // unassign (idempotent)
    const u1 = await app.call(`/api/results/${r1.id}/tags/${tag1.id}`, { method: "DELETE", token: t1 });
    assert.deepEqual(u1.body.tags, []);
    const u2 = await app.call(`/api/results/${r1.id}/tags/${tag1.id}`, { method: "DELETE", token: t1 });
    assert.deepEqual(u2.body.tags, []);
  } finally { app.close(); }
});

test("B-RES-006(c): history tag filter — multi-tag = intersection", async () => {
  const app = await bootApp();
  try {
    const t = await app.signup("tf" + rid());
    const mk = async (name) => (await app.call("/api/results/tags", { method: "POST", token: t, body: { name } })).body.id;
    const [A, B] = [await mk("fa" + rid()), await mk("fb" + rid())];
    const post = async () => (await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ hash: "r" + rid() }) })).body;
    const r1 = await post(), r2 = await post(), r3 = await post();
    await app.call(`/api/results/${r1.id}/tags`, { method: "POST", token: t, body: { tagId: A } });
    await app.call(`/api/results/${r2.id}/tags`, { method: "POST", token: t, body: { tagId: A } });
    await app.call(`/api/results/${r2.id}/tags`, { method: "POST", token: t, body: { tagId: B } });
    await app.call(`/api/results/${r3.id}/tags`, { method: "POST", token: t, body: { tagId: B } });
    const all = await app.call("/api/results", { token: t });
    assert.equal(all.body.results.length, 3);
    const onlyA = await app.call(`/api/results?tags=${A}`, { token: t });
    assert.deepEqual(onlyA.body.results.map((r) => r.id).sort(), [r1.id, r2.id].sort());
    const both = await app.call(`/api/results?tags=${A},${B}`, { token: t });
    assert.deepEqual(both.body.results.map((r) => r.id), [r2.id]); // INTERSECTION
  } finally { app.close(); }
});

test("B-RES-006(d): delete-cascade — tag removed from every result; results unaffected", async () => {
  const app = await bootApp();
  try {
    const t = await app.signup("td" + rid());
    const A = (await app.call("/api/results/tags", { method: "POST", token: t, body: { name: "cascade" } })).body.id;
    const r1 = (await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ hash: "r" + rid() }) })).body;
    const r2 = (await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ hash: "r" + rid() }) })).body;
    await app.call(`/api/results/${r1.id}/tags`, { method: "POST", token: t, body: { tagId: A } });
    await app.call(`/api/results/${r2.id}/tags`, { method: "POST", token: t, body: { tagId: A } });
    const del = await app.call(`/api/results/tags/${A}`, { method: "DELETE", token: t });
    assert.equal(del.status, 200);
    const hist = await app.call("/api/results", { token: t });
    assert.equal(hist.body.results.length, 2); // results intact
    assert.ok(hist.body.results.every((r) => (r.tags ?? []).length === 0)); // cascaded
    const filtered = await app.call(`/api/results?tags=${A}`, { token: t });
    assert.equal(filtered.body.results.length, 0);
  } finally { app.close(); }
});

test("B-RES-006(e): tag-scoped PB read — read-time derivation, isPb never mutated", async () => {
  const app = await bootApp();
  try {
    const t = await app.signup("tp" + rid());
    const A = (await app.call("/api/results/tags", { method: "POST", token: t, body: { name: "scoped" } })).body.id;
    const post = async (wpm, tag) => {
      const r = (await app.call("/api/results", { method: "POST", token: t,
        body: makeEvent({ wpm, hash: "r" + rid() }) })).body;
      if (tag) await app.call(`/api/results/${r.id}/tags`, { method: "POST", token: t, body: { tagId: A } });
      return r;
    };
    const r100 = await post(100, true);   // tagged
    const r120 = await post(120, false);  // untagged -> global PB
    const r110 = await post(110, true);   // tagged best
    assert.equal(r120.isPb, true);
    const scoped = await app.call(`/api/results/pbs?tags=${A}`, { token: t });
    assert.equal(scoped.status, 200);
    assert.deepEqual(scoped.body.pbs.map((r) => r.wpm), [110]); // best among tagged, per C7 tuple
    // isPb flags UNCHANGED by the scoped read
    const global = await app.call("/api/results/pbs", { token: t });
    assert.deepEqual(global.body.pbs.map((r) => r.wpm), [120]);
    const hist = await app.call("/api/results", { token: t });
    const byWpm = Object.fromEntries(hist.body.results.map((r) => [r.wpm, r.isPb]));
    assert.equal(byWpm[100], false); assert.equal(byWpm[120], true); assert.equal(byWpm[110], false);
  } finally { app.close(); }
});

// =====================================================================
// result-stats v1.0.0
// =====================================================================
const FIXTURE = [
  // two time/15 results on the same UTC day, one words/10 the next day,
  // one bailed + one minThresholdFailed (INCLUDED in aggregates/series per B-STS-002)
  { mode: "time", mode2: "15", language: "english", wpm: 100, acc: 95, testDuration: 15, timestamp: Date.UTC(2026, 6, 20, 10), punctuation: false, numbers: false, isPb: false, bailedOut: false },
  { mode: "time", mode2: "15", language: "english", wpm: 120, acc: 97, testDuration: 15, timestamp: Date.UTC(2026, 6, 20, 12), punctuation: false, numbers: false, isPb: true, bailedOut: false },
  { mode: "words", mode2: "10", language: "english", wpm: 80, acc: 92, testDuration: 8, timestamp: Date.UTC(2026, 6, 21, 9), punctuation: true, numbers: false, isPb: true, bailedOut: false },
  { mode: "time", mode2: "15", language: "english", wpm: 60, acc: 88, testDuration: 10, timestamp: Date.UTC(2026, 6, 21, 10), punctuation: false, numbers: false, isPb: false, bailedOut: true },
  { mode: "time", mode2: "15", language: "english", wpm: 200, acc: 99, testDuration: 15, timestamp: Date.UTC(2026, 6, 21, 11), punctuation: false, numbers: false, isPb: false, bailedOut: false, minThresholdFailed: true },
];

test("B-STS-002: recompute-consistency over a fixture stored-result set", () => {
  const agg = computeAggregates(FIXTURE);
  const t15 = agg.modes.find((m) => m.mode === "time" && m.mode2 === "15");
  assert.equal(t15.testsCompleted, 4); // bailed + flagged INCLUDED
  assert.equal(t15.timeTypingSeconds, 55); // sum(testDuration) — no afk subtraction (BQ-STS-01)
  assert.equal(t15.avgWpm, 120); // (100+120+60+200)/4
  assert.equal(t15.avgAcc, 94.75);
  const w10 = agg.modes.find((m) => m.mode === "words" && m.mode2 === "10");
  assert.deepEqual([w10.testsCompleted, w10.timeTypingSeconds, w10.avgWpm, w10.avgAcc], [1, 8, 80, 92]);
  assert.deepEqual(computeAggregates([]).modes, []); // empty-set formula: no rows

  const pbt = computePbTable(FIXTURE);
  assert.equal(pbt.pbs.length, 2); // exactly one entry per C7 tuple = the isPb record
  assert.ok(pbt.pbs.every((p) => p.wpm !== 200 && p.wpm !== 60)); // never bailed/flagged
  assert.deepEqual(pbt.pbs.find((p) => p.mode === "time"), { mode: "time", mode2: "15", language: "english",
    punctuation: false, numbers: false, wpm: 120, acc: 97, timestamp: Date.UTC(2026, 6, 20, 12) });

  const act = computeActivity(FIXTURE);
  assert.deepEqual(act.days, [
    { date: "2026-07-20", testsCompleted: 2, timeTypingSeconds: 30 },
    { date: "2026-07-21", testsCompleted: 3, timeTypingSeconds: 33 },
  ]); // UTC calendar day buckets, ascending

  const ser = computeWpmSeries(FIXTURE);
  assert.deepEqual(ser.series.map((s) => s.timestamp), [...FIXTURE].sort((a, b) => a.timestamp - b.timestamp).map((r) => r.timestamp));
  assert.deepEqual(ser.series[0], { timestamp: FIXTURE[0].timestamp, wpm: 100, acc: 95 });
});

test("B-STS-001: determinism — identical store state, byte-identical reads", async () => {
  const app = await bootApp();
  try {
    const t = await app.signup("st" + rid());
    await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ hash: "r" + rid() }) });
    await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ mode: "words", mode2: "10", hash: "r" + rid() }) });
    for (const p of ["/api/stats/aggregates", "/api/stats/pbs", "/api/stats/activity", "/api/stats/wpm-series"]) {
      const b1 = await (await fetch(app.base + p, { headers: { authorization: "Bearer " + t } })).text();
      const b2 = await (await fetch(app.base + p, { headers: { authorization: "Bearer " + t } })).text();
      assert.equal(b1, b2, p);
    }
  } finally { app.close(); }
});

test("S-STS-001/003: handshake schema conformance; auth before computation; own data only", async () => {
  const app = await bootApp();
  try {
    const sts = loadBundle(P("result-stats"));
    const t = await app.signup("ss" + rid());
    const other = await app.signup("so" + rid());
    await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ hash: "r" + rid() }) });
    await app.call("/api/results", { method: "POST", token: other, body: makeEvent({ wpm: 140, hash: "r" + rid() }) });
    const paths = { "/api/stats/aggregates": "aggregates.schema.json", "/api/stats/pbs": "pb-table.schema.json",
                    "/api/stats/activity": "activity.schema.json", "/api/stats/wpm-series": "wpm-series.schema.json" };
    for (const [p, schema] of Object.entries(paths)) {
      const unauth = await app.call(p, {});
      assert.equal(unauth.status, 401, p); // before any computation
      const r = await app.call(p, { token: t });
      const v = sts.validate(schema, r.body);
      assert.ok(v.ok, `${p}: ${JSON.stringify(v.errors)}`);
    }
    // own-data-only: the other user's 140-wpm result leaks nowhere
    const agg = await app.call("/api/stats/aggregates", { token: t });
    assert.equal(agg.body.modes.reduce((n, m) => n + m.testsCompleted, 0), 1);
    const ser = await app.call("/api/stats/wpm-series", { token: t });
    assert.equal(ser.body.series.length, 1);
  } finally { app.close(); }
});

// =====================================================================
// wordlists v1.0.0
// =====================================================================
test("S-WL-001/002: shipped registry + assets conform; referential closure; migration parity", () => {
  const dir = join(root, "implementation", "assets", "wordlists");
  const registry = JSON.parse(readFileSync(join(dir, "registry.json"), "utf8"));
  const wl = loadBundle(P("wordlists"));
  const eng = loadBundle(P("typing-test-engine"));
  assert.ok(wl.validate("language-registry.schema.json", registry).ok); // sealed registry schema
  assert.equal(registry.lists.length, 6); // ~6 starter languages (delegated data)
  const assets = registry.lists.map((e) => ({
    id: e.id, parsed: JSON.parse(readFileSync(join(dir, e.id + ".json"), "utf8")),
  }));
  for (const a of assets) {
    assert.ok(eng.validate("wordlist.schema.json", a.parsed).ok, a.id); // engine handshake (fork-referenced)
    assert.equal(a.parsed.language, a.id); // S-WL-002 closure clause
  }
  assert.ok(admitCatalog(registry, assets).ok);
  // BQ-WL-02 migration parity: the retired internal english list IS the builtin package
  assert.deepEqual(assets.find((a) => a.id === "english").parsed.words, ENGLISH_200);
});

test("B-WL-001: boot admission is fail-closed (negative sweep cases)", () => {
  const registry = { lists: [{ id: "english", name: "English", language: "english" }] };
  const good = [{ id: "english", parsed: { language: "english", words: ["a"] } }];
  assert.ok(admitCatalog(registry, good).ok);
  assert.ok(!admitCatalog(registry, []).ok); // missing asset for an entry
  assert.ok(!admitCatalog(registry, [{ id: "english", parsed: { language: "english", words: [] } }]).ok); // S-WL-001
  assert.ok(!admitCatalog(registry, [{ id: "english", parsed: { language: "english_1k", words: ["a"] } }]).ok); // language != id
  assert.ok(!admitCatalog(registry, [...good, { id: "orphan", parsed: { language: "orphan", words: ["a"] } }]).ok);
  assert.ok(validateRegistryShape({ lists: [] }).length > 0); // minItems 1
  assert.ok(validateRegistryShape({ lists: registry.lists, extra: 1 }).length > 0); // additionalProperties false
});

test("S-WL-003/B-WL-002/O-WL-001: public same-origin static reads, byte-identical, 404 envelope", async () => {
  const app = await bootApp();
  try {
    const r1 = await fetch(app.base + "/wordlists/registry.json"); // no token
    const r2 = await fetch(app.base + "/wordlists/registry.json");
    assert.equal(r1.status, 200);
    assert.equal(await r1.text(), await r2.text()); // byte-determinism within the deploy
    const a1 = await fetch(app.base + "/wordlists/spanish.json");
    const a2 = await fetch(app.base + "/wordlists/spanish.json");
    assert.equal(await a1.text(), await a2.text());
    const nf = await fetch(app.base + "/wordlists/klingon.json");
    assert.equal(nf.status, 404);
    const body = await nf.json();
    assert.equal(body.error.code, "not_found"); // ErrorEnvelope on failure
  } finally { app.close(); }
});

// =====================================================================
// quote-library v1.1.0
// =====================================================================
test("B-QT-006: tri-state moderation — transitions, consistency clause, idempotency, metadata", async () => {
  const app = await bootApp();
  try {
    const qt = loadBundle(P("quote-library"));
    const user = await app.signup("qu" + rid());
    const mod = await app.signup("moderator");
    const q = (await app.call("/api/quotes", { method: "POST", token: user,
      body: { text: "tri state quote " + rid(), source: "test", language: "english" } })).body;
    assert.equal(q.state, "pending");
    assert.equal(q.approved, false); // (a) approved <=> state=approved
    assert.ok(qt.validate("quote.schema.json", q).ok);
    // non-moderator cannot approve/refuse
    assert.equal((await app.call(`/api/quotes/${q.id}/approve`, { method: "POST", token: user, body: {} })).status, 403);
    assert.equal((await app.call(`/api/quotes/${q.id}/refuse`, { method: "POST", token: user, body: {} })).status, 403);
    // approve with note (moderator), idempotent
    const ap = await app.call(`/api/quotes/${q.id}/approve`, { method: "POST", token: mod, body: { moderationNote: "ok" } });
    assert.equal(ap.body.state, "approved");
    assert.equal(ap.body.approved, true);
    assert.equal(ap.body.moderationNote, "ok");
    const ap2 = await app.call(`/api/quotes/${q.id}/approve`, { method: "POST", token: mod, body: {} });
    assert.equal(ap2.body.state, "approved");
    // refuse with note, idempotent; consistency clause flips the boolean back
    const rf = await app.call(`/api/quotes/${q.id}/refuse`, { method: "POST", token: mod, body: { moderationNote: "off-topic" } });
    assert.equal(rf.body.state, "refused");
    assert.equal(rf.body.approved, false);
    assert.equal(rf.body.moderationNote, "off-topic");
    assert.ok(qt.validate("quote.schema.json", rf.body).ok);
    const rf2 = await app.call(`/api/quotes/${q.id}/refuse`, { method: "POST", token: mod, body: {} });
    assert.equal(rf2.body.state, "refused");
    // note validation
    const bad = await app.call(`/api/quotes/${q.id}/refuse`, { method: "POST", token: mod, body: { moderationNote: "x".repeat(501) } });
    assert.equal(bad.status, 422);
  } finally { app.close(); }
});

test("B-QT-006(c,d): refused + pending are PERSISTED but never served (random/search/browse/favorites)", async () => {
  const app = await bootApp();
  try {
    const user = await app.signup("qs" + rid());
    const mod = await app.signup("moderator");
    const pending = (await app.call("/api/quotes", { method: "POST", token: user,
      body: { text: "pending quote " + rid(), source: "test", language: "english" } })).body;
    const refused = (await app.call("/api/quotes", { method: "POST", token: user,
      body: { text: "refused quote " + rid(), source: "test", language: "english" } })).body;
    await app.call(`/api/quotes/${refused.id}/refuse`, { method: "POST", token: mod, body: { moderationNote: "no" } });
    // persisted: direct moderation re-read shows them; favorite them (add allowed)
    await app.call("/api/quotes/favorites", { method: "POST", token: user, body: { quoteId: pending.id } });
    await app.call("/api/quotes/favorites", { method: "POST", token: user, body: { quoteId: refused.id } });
    const favs = await app.call("/api/quotes/favorites", { token: user });
    assert.equal(favs.body.quotes.length, 0); // favorites list = APPROVED only
    // random: only the 4 approved seeds are servable for english
    for (let i = 0; i < 12; i++) {
      const r = await app.call("/api/quotes/random?language=english");
      assert.ok(r.body.approved && r.body.state === "approved");
      assert.ok(![pending.id, refused.id].includes(r.body.id));
    }
    // search/browse: excluded even when the substring matches
    for (const probe of ["pending quote", "refused quote"]) {
      const s = await app.call(`/api/quotes?q=${encodeURIComponent(probe)}`, {});
      assert.equal(s.body.total, 0, probe);
    }
    const all = await app.call("/api/quotes?language=english", {});
    assert.ok(all.body.quotes.every((q) => q.state === "approved"));
  } finally { app.close(); }
});

test("B-QT-007: weight function monotonic in rating average; unrated default; seeded reproducibility", () => {
  // monotonicity: avg(a) >= avg(b) => weight(a) >= weight(b)
  let prev = -Infinity;
  for (let avg = 1; avg <= 5; avg += 0.5) {
    const w = ratingWeight({ ratings: { u1: Math.max(1, Math.min(5, Math.round(avg))) } });
    assert.ok(w >= prev);
    prev = w;
  }
  assert.equal(ratingWeight({ ratings: {} }), DEFAULT_QUOTE_WEIGHT); // documented default 2.5
  assert.equal(ratingWeight({ ratings: { a: 5, b: 1 } }), 3);
  // seeded reproducibility over a synthetic pool
  const pool = [
    { id: "a", ratings: { u: 5 } }, { id: "b", ratings: {} }, { id: "c", ratings: { u: 1 } },
  ];
  const first = weightedPickIndex(pool, seededRand(42));
  for (let i = 0; i < 10; i++) assert.equal(weightedPickIndex(pool, seededRand(42)), first);
  assert.ok(first >= 0 && first < pool.length);
  // weight order respected in the cumulative mapping: weights [5, 2.5, 1]
  const picks = new Set();
  for (let s = 1; s <= 40; s++) picks.add(weightedPickIndex(pool, seededRand(s)));
  assert.ok(picks.size >= 2); // distribution is non-degenerate across seeds
});

test("B-QT-007: seeded random fetch is reproducible over HTTP", async () => {
  const app = await bootApp();
  try {
    const r1 = await app.call("/api/quotes/random?language=english&seed=42");
    const r2 = await app.call("/api/quotes/random?language=english&seed=42");
    assert.equal(r1.status, 200);
    assert.equal(r1.body.id, r2.body.id); // same set + weights + seed => same quote
  } finally { app.close(); }
});

test("B-QT-008: favorites — add idempotent, list approved-only, remove never deletes the quote", async () => {
  const app = await bootApp();
  try {
    const t = await app.signup("qf" + rid());
    const seed = (await app.call("/api/quotes/random?language=english&seed=1")).body;
    await app.call("/api/quotes/favorites", { method: "POST", token: t, body: { quoteId: seed.id } });
    await app.call("/api/quotes/favorites", { method: "POST", token: t, body: { quoteId: seed.id } }); // idempotent
    const favs = await app.call("/api/quotes/favorites", { token: t });
    assert.equal(favs.body.quotes.length, 1);
    assert.equal(favs.body.quotes[0].id, seed.id);
    const unknown = await app.call("/api/quotes/favorites", { method: "POST", token: t, body: { quoteId: "nope" } });
    assert.equal(unknown.status, 404);
    const extra = await app.call("/api/quotes/favorites", { method: "POST", token: t, body: { quoteId: seed.id, x: 1 } });
    assert.equal(extra.status, 422); // favorite-request additionalProperties:false
    const unauth = await app.call("/api/quotes/favorites", { method: "POST", body: { quoteId: seed.id } });
    assert.equal(unauth.status, 401);
    await app.call(`/api/quotes/favorites/${seed.id}`, { method: "DELETE", token: t });
    assert.equal((await app.call("/api/quotes/favorites", { token: t })).body.quotes.length, 0);
    // the quote itself was never deleted
    const browse = await app.call(`/api/quotes?q=${encodeURIComponent(seed.text.slice(0, 12))}`, {});
    assert.ok(browse.body.quotes.some((q) => q.id === seed.id));
  } finally { app.close(); }
});

test("B-QT-009: search/browse — approved only, language + substring filters, stable order, pagination", async () => {
  const app = await bootApp();
  try {
    const t = await app.signup("qb" + rid());
    const mod = await app.signup("moderator");
    for (const [text, language] of [["alpha bravo charlie", "english"], ["alpha delta echo", "english"], ["uno dos tres", "spanish"]]) {
      const q = (await app.call("/api/quotes", { method: "POST", token: t, body: { text, source: "t", language } })).body;
      await app.call(`/api/quotes/${q.id}/approve`, { method: "POST", token: mod, body: {} });
    }
    const lang = await app.call("/api/quotes?language=spanish", {});
    assert.equal(lang.body.total, 1);
    assert.equal(lang.body.quotes[0].text, "uno dos tres");
    const sub = await app.call("/api/quotes?q=ALPHA", {}); // case-insensitive substring
    assert.equal(sub.body.total, 2);
    const both = await app.call("/api/quotes?language=english&q=delta", {});
    assert.equal(both.body.total, 1);
    // stable order across reads (submission order: seeds first)
    const r1 = await app.call("/api/quotes?language=english", {});
    const r2 = await app.call("/api/quotes?language=english", {});
    assert.deepEqual(r1.body.quotes.map((q) => q.id), r2.body.quotes.map((q) => q.id));
    assert.deepEqual(r1.body.quotes.map((q) => q.text).slice(-2), ["alpha bravo charlie", "alpha delta echo"]);
    assert.equal(r1.body.pageSize, QUOTE_PAGE_SIZE); // documented page size 50
    const bad = await app.call("/api/quotes?page=-1", {});
    assert.equal(bad.status, 422);
  } finally { app.close(); }
});

test("B-QT-009: pagination is total over the stable order (module-level sweep)", () => {
  const mk = (i) => ({ id: "q" + i, text: "page filler " + i, source: "t", language: "english",
                       length: 20, state: "approved", approved: true, ratings: {} });
  const corpus = Array.from({ length: 120 }, (_, i) => mk(i));
  const seen = [];
  for (let page = 0; page * QUOTE_PAGE_SIZE < 120; page++) {
    const { quotes, total } = searchQuotes(corpus, { page });
    assert.equal(total, 120);
    seen.push(...quotes.map((q) => q.id));
  }
  assert.equal(seen.length, 120);
  assert.equal(new Set(seen).size, 120); // every quote exactly once across pages
  assert.deepEqual(seen, corpus.map((q) => q.id)); // stable submission order
  const refused = mk(999); refused.state = "refused"; refused.approved = false;
  assert.equal(searchQuotes([refused], {}).total, 0);
});

// =====================================================================
// leaderboards v1.1.0
// =====================================================================
test("B-LB-001: eligibility — minThresholdFailed + bailed excluded; one entry per user (their best)", async () => {
  const app = await bootApp();
  try {
    const t = await app.signup("le" + rid());
    const now = Date.now();
    await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ wpm: 100, timestamp: now, hash: "a" + rid() }) });
    await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ wpm: 200, minThresholdFailed: true, timestamp: now, hash: "b" + rid() }) });
    await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ wpm: 300, bailedOut: true, timestamp: now, hash: "c" + rid() }) });
    await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ wpm: 90, timestamp: now, hash: "d" + rid() }) });
    const b = await app.call("/api/leaderboards/15");
    assert.equal(b.body.entries.length, 1); // one entry per user
    assert.equal(b.body.entries[0].wpm, 100); // their best ELIGIBLE result (not 200/300)
  } finally { app.close(); }
});

test("S-LB-001/002: board key — registry-validated language, timeWindow; failure envelopes", async () => {
  const app = await bootApp();
  try {
    const lb = loadBundle(P("leaderboards"));
    const t = await app.signup("lk" + rid());
    await app.call("/api/results", { method: "POST", token: t,
      body: makeEvent({ language: "spanish", wpm: 110, timestamp: Date.now(), hash: "s" + rid() }) });
    const es = await app.call("/api/leaderboards/15?language=spanish");
    assert.equal(es.status, 200);
    assert.deepEqual(es.body.board, { mode: "time", mode2: "15", language: "spanish", timeWindow: "alltime" });
    assert.equal(es.body.entries.length, 1); // the english-only restriction is lifted
    assert.ok(lb.validate("leaderboard.schema.json", es.body).ok, JSON.stringify(lb.validate("leaderboard.schema.json", es.body).errors));
    const en = await app.call("/api/leaderboards/15");
    assert.equal(en.body.entries.length, 0); // boards are per-language
    assert.ok(lb.validate("leaderboard.schema.json", en.body).ok);
    const badLang = await app.call("/api/leaderboards/15?language=klingon");
    assert.equal(badLang.status, 404); // language must name a registry entry
    assert.equal(badLang.body.error.code, "not_found");
    const badWin = await app.call("/api/leaderboards/15?timeWindow=weekly");
    assert.equal(badWin.status, 404);
    const badMode2 = await app.call("/api/leaderboards/30");
    assert.equal(badMode2.status, 404);
  } finally { app.close(); }
});

test("B-LB-005: daily = rolling (T-24h, T]; alltime = full history", async () => {
  const app = await bootApp();
  try {
    const now = Date.now();
    const mk = async (wpm, ts) => {
      const t = await app.signup("ld" + rid());
      await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ wpm, timestamp: ts, hash: "d" + rid() }) });
    };
    await mk(100, now - 25 * 60 * 60 * 1000); // outside the rolling window
    await mk(120, now - 60 * 1000);           // inside
    await mk(90, now - 23 * 60 * 60 * 1000);  // inside (near the open left edge)
    const daily = await app.call("/api/leaderboards/15?timeWindow=daily");
    assert.deepEqual(daily.body.entries.map((e) => e.wpm), [120, 90]);
    assert.equal(daily.body.board.timeWindow, "daily");
    const alltime = await app.call("/api/leaderboards/15");
    assert.deepEqual(alltime.body.entries.map((e) => e.wpm), [120, 100, 90]);
  } finally { app.close(); }
});

test("B-LB-005: window edges exact under an injected clock (module-level)", () => {
  const T = 1753000000000;
  const at = (ts) => inWindow({ timestamp: ts }, "daily", T);
  assert.equal(at(T - DAILY_WINDOW_MS), false);      // open left edge
  assert.equal(at(T - DAILY_WINDOW_MS + 1), true);
  assert.equal(at(T), true);                          // closed right edge
  assert.equal(at(T + 1), false);
  assert.equal(inWindow({ timestamp: 1 }, "alltime", T), true);
});

test("B-LB-006: percentile = 100 * rank / totalEligibleUsers on entries AND requester", async () => {
  const app = await bootApp();
  try {
    const now = Date.now();
    const tokens = [];
    for (const wpm of [90, 100, 110]) {
      const t = await app.signup("lp" + rid());
      tokens.push(t);
      await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ wpm, timestamp: now, hash: "p" + rid() }) });
    }
    const b = await app.call("/api/leaderboards/15", { token: tokens[0] }); // the 90-wpm user
    assert.equal(b.body.entries.length, 3);
    assert.deepEqual(b.body.entries.map((e) => [e.rank, e.wpm, e.percentile]),
      [[1, 110, 33.33], [2, 100, 66.67], [3, 90, 100]]);
    assert.equal(b.body.requester.rank, 3);            // requester outside top-N still carried
    assert.equal(b.body.requester.percentile, 100);
    assert.equal(percentileOf(1, 200), 0.5);           // sealed example
  } finally { app.close(); }
});

test("B-LB-007: xp = documented deterministic f(wpm, acc, testDuration); read-time, zero writes", async () => {
  // Documented coefficients (delegated): xp = wpm * (acc/100) * (testDuration/60)
  assert.equal(xpOf({ wpm: 120, acc: 95, testDuration: 15 }), 28.5);
  assert.equal(xpOf({ wpm: 0, acc: 100, testDuration: 60 }), 0);
  assert.ok(xpOf({ wpm: 100, acc: 100, testDuration: 60 }) >= xpOf({ wpm: 90, acc: 100, testDuration: 60 }));
  const app = await bootApp();
  try {
    const t = await app.signup("lx" + rid());
    await app.call("/api/results", { method: "POST", token: t, body: makeEvent({ wpm: 120, acc: 95.5, timestamp: Date.now(), hash: "x" + rid() }) });
    const b1 = await app.call("/api/leaderboards/15");
    const b2 = await app.call("/api/leaderboards/15");
    assert.equal(b1.body.entries[0].xp, 28.65); // round2(120 * 0.955 * 15/60)
    assert.equal(b1.body.entries[0].xp, b2.body.entries[0].xp); // same result => same xp
  } finally { app.close(); }
});

test("B-LB-002/003/004: ordering, read-time freshness, requester null when anonymous", async () => {
  const app = await bootApp();
  try {
    const now = Date.now();
    const t1 = await app.signup("lo" + rid());
    await app.call("/api/results", { method: "POST", token: t1, body: makeEvent({ wpm: 100, timestamp: now - 5000, hash: "a" + rid() }) });
    const anon = await app.call("/api/leaderboards/15");
    assert.equal(anon.body.requester, null); // B-LB-004 unauthenticated
    // read-time recomputation: a new result is visible on the very next read
    const t2 = await app.signup("lo" + rid());
    await app.call("/api/results", { method: "POST", token: t2, body: makeEvent({ wpm: 100, timestamp: now - 9000, hash: "b" + rid() }) });
    const b = await app.call("/api/leaderboards/15");
    assert.equal(b.body.entries.length, 2);
    assert.equal(b.body.entries[0].timestamp, now - 9000); // tie: earlier timestamp first
    assert.equal(b.body.entries[1].timestamp, now - 5000);
  } finally { app.close(); }
});

// =====================================================================
// cross-bundle: module-level eligibility + scoped-PB purity
// =====================================================================
test("module: isEligible (B-LB-001) + scopedPbs purity (B-RES-006(e))", () => {
  const base = { anticheat: { decision: "admit" }, bailedOut: false };
  assert.ok(isEligible(base));
  assert.ok(!isEligible({ ...base, minThresholdFailed: true }));
  assert.ok(!isEligible({ ...base, bailedOut: true }));
  assert.ok(!isEligible({ ...base, anticheat: { decision: "reject" } }));
  const mine = [
    { id: "1", mode: "time", mode2: "15", language: "english", wpm: 100, timestamp: 10, tags: ["A"], isPb: false },
    { id: "2", mode: "time", mode2: "15", language: "english", wpm: 110, timestamp: 20, tags: ["A"], isPb: false },
    { id: "3", mode: "time", mode2: "15", language: "english", wpm: 120, timestamp: 30, tags: [], isPb: true },
    { id: "4", mode: "time", mode2: "15", language: "english", wpm: 200, timestamp: 40, tags: ["A"], isPb: false, minThresholdFailed: true },
  ];
  const frozen = JSON.parse(JSON.stringify(mine));
  const scoped = scopedPbs(mine, ["A"]);
  assert.deepEqual(scoped.map((r) => r.id), ["2"]); // best eligible among tagged (flagged 200 excluded)
  assert.deepEqual(mine, frozen); // read-time derivation NEVER mutates
  assert.ok(matchesTagFilter(mine[0], ["A"]) && !matchesTagFilter(mine[0], ["A", "B"]));
  assert.equal(findTagByName([{ uid: "u", id: "1", name: "Speed" }], "u", "speed").id, "1"); // case-insensitive
});
