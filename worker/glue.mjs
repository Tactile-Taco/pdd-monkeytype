// ============================================================================
// Workers glue (ported platform layer) — appended by worker/build.mjs after the
// verbatim protocol modules. Express router -> fetch(request, env) router;
// Store (JSON file) -> KvStore (KV + in-request cache). The file-based RVL
// Dynamic Evidence Ledger is Node-only; this deployment runs without it
// (documented limitation, see worker/README.md). Token secret is a demo
// constant. KV is eventually consistent.
// ============================================================================

const ASSETS = /*__ASSETS__*/ {};

// ---- wordlists v1.0.0: boot admission (B-WL-001, fail-closed at isolate boot) ----
// The registry + every embedded asset is re-checked (S-WL-001 handshake
// conformance, S-WL-002 referential closure) before the first request is
// served; a non-conforming catalog throws at module init — the deploy is refused.
// admitCatalog/registryIds come from the verbatim shared/wordlists.js section.
const WL_REGISTRY = JSON.parse(ASSETS["/wordlists/registry.json"].body);
const WL_ASSETS = Object.keys(ASSETS)
  .filter((p) => p.startsWith("/wordlists/") && p.endsWith(".json") && p !== "/wordlists/registry.json")
  .map((p) => ({ id: p.slice("/wordlists/".length, -".json".length), parsed: JSON.parse(ASSETS[p].body) }));
const WL_ADMISSION = admitCatalog(WL_REGISTRY, WL_ASSETS);
if (!WL_ADMISSION.ok) throw new Error("wordlists boot admission refused: " + WL_ADMISSION.errors.join("; "));
const REGISTRY_IDS = new Set(registryIds(WL_REGISTRY)); // leaderboards S-LB-001

// KV-backed store with the same synchronous read/commit surface as the Node
// JSON Store. load() primes the in-request cache; flush() writes through once.
class KvStore {
  constructor(ns, key, seed) {
    this.ns = ns; this.key = key; this.seed = seed;
    this.data = null; this.dirty = false; this.writeCount = 0;
  }
  async load() {
    const v = await this.ns.get(this.key, { type: "json" });
    if (v === null || v === undefined) {
      this.data = JSON.parse(JSON.stringify(this.seed ?? {}));
      this.dirty = true; // persist seed so state converges
    } else this.data = v;
  }
  read() { return this.data; }
  commit(mutator) { const out = mutator(this.data); this.writeCount += 1; this.dirty = true; return out; }
  async flush() { if (this.dirty) { await this.ns.put(this.key, JSON.stringify(this.data)); this.dirty = false; } }
}

const NAME_RE = /^[a-zA-Z0-9_-]{3,16}$/;

function seedQuotes() {
  // v1.1.0: tri-state persisted (B-QT-006); legacy records derive state at serve time.
  const mk = (id, text, source) => ({ id, text, source, language: "english",
    length: text.length, state: "approved", approved: true, ratings: {} });
  return [
    mk("q1", "The quick brown fox jumps over the lazy dog near the river bank.", "proverb"),
    mk("q2", "Practice does not make perfect. Only perfect practice makes perfect.", "Vince Lombardi"),
    mk("q3", "It is not the strongest of the species that survives, but the one most responsive to change.", "Charles Darwin"),
    mk("q4", "The only way to do great work is to love what you do. If you have not found it yet, keep looking.", "Steve Jobs"),
  ];
}

const jsonRes = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const errRes = (status, code, message) =>
  jsonRes({ error: { code, message, correlation_id: randomUUID() } }, status);

// public-api v1.0.0: fixed-window rate-limit counters live PER ISOLATE
// (O-API-001: counters are not store writes; documented posture — windows are
// short and the per-key contract is enforced wherever the key is used).
const LIMITER = createRateLimiter({ windowMs: RATE_WINDOW_MS, keyLimit: RATE_KEY_LIMIT, ipLimit: RATE_IP_LIMIT });

// ---- API router (port of implementation/src/server/app.js) ----
// Returns a Response, or null when (method, path) matches no API route.
async function handleApi(request, url, stores) {
  const { accounts, configs, results, tags, quotes, favorites, profiles, apekeys } = stores;
  const m = request.method;
  const path = url.pathname;

  const auth = () => {
    const h = request.headers.get("authorization") || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    const claims = token && verifyToken(accounts, token);
    if (!claims) return null;
    const user = accounts.read().users[claims.uid];
    return user ? { token, uid: claims.uid, user } : null;
  };
  const profile = (uid, u) => ({ uid, name: u.name, addedAt: u.addedAt, moderator: !!u.moderator });
  const body = async () => { try { return await request.json(); } catch { return null; } };

  // ---- user-account ----
  if (m === "POST" && path === "/api/account/signup") {
    const { name, password } = (await body()) ?? {};
    if (typeof name !== "string" || !NAME_RE.test(name)) return errRes(422, "unprocessable", "invalid username");
    if (typeof password !== "string" || password.length < 8) return errRes(422, "unprocessable", "password too short");
    const d = accounts.read();
    const clash = Object.values(d.users).some((u) => u.name.toLowerCase() === name.toLowerCase());
    if (clash) return errRes(409, "conflict", "username taken"); // B-ACC-001
    const uid = randomUUID();
    accounts.commit((dd) => { dd.users[uid] = { name, pw: hashPassword(password), addedAt: Date.now(), moderator: name === "moderator" }; });
    const token = issueToken(accounts, uid);
    return jsonRes({ token, profile: profile(uid, accounts.read().users[uid]) });
  }
  if (m === "POST" && path === "/api/account/login") {
    const { name, password } = (await body()) ?? {};
    const d = accounts.read();
    const entry = Object.entries(d.users).find(([, u]) => u.name.toLowerCase() === String(name ?? "").toLowerCase());
    if (!entry || !verifyPassword(String(password ?? ""), entry[1].pw)) {
      return errRes(401, "unauthorized", "invalid credentials"); // B-ACC-003
    }
    const token = issueToken(accounts, entry[0]);
    return jsonRes({ token, profile: profile(entry[0], entry[1]) });
  }
  if (m === "POST" && path === "/api/account/logout") {
    const h = request.headers.get("authorization") || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (token) revokeToken(accounts, token);
    return jsonRes({ ok: true });
  }
  if (m === "GET" && path === "/api/account/profile") {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    return jsonRes(profile(a.uid, a.user));
  }

  // ---- user-config ----
  if (m === "GET" && path === "/api/config") {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required"); // B-CFG-004
    const mine = configs.read()[a.uid] ?? {};
    return jsonRes({ ...CONFIG_DEFAULTS, ...mine }); // B-CFG-001
  }
  if (m === "PUT" && path === "/api/config") {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    const b = await body();
    const v = validateConfigUpdate(b);
    if (!v.ok) return errRes(422, "unprocessable", "invalid keys: " + v.badKeys.join(",")); // B-CFG-003
    configs.commit((d) => { d[a.uid] = { ...(d[a.uid] ?? {}), ...b }; }); // B-CFG-002
    return jsonRes({ ...CONFIG_DEFAULTS, ...configs.read()[a.uid] });
  }

  // ---- theme-catalog (v1.0.0, read-only; port of implementation/src/server/app.js) ----
  // Admission (O-THM-003): static charter shape+bands re-checked per isolate boot.
  // THEMES/validateThemeShape/charterBandReport/catalogList/findTheme come from the
  // verbatim shared/themes.js section above. Payloads cached per isolate (B-THM-003).
  if (!globalThis.__thmCatalog) {
    for (const t of THEMES) {
      const shape = validateThemeShape(t);
      const bands = charterBandReport(t.tokens);
      if (!shape.ok || !bands.ok) throw new Error("theme-catalog admission refused: " + t?.name);
    }
    globalThis.__thmCatalog = {
      list: JSON.stringify({ themes: catalogList() }),
      themes: new Map(THEMES.map((t) => [t.name, JSON.stringify(t)])),
    };
  }
  const cat = globalThis.__thmCatalog;
  const rawJson = (payload, status = 200) =>
    new Response(payload, { status, headers: { "content-type": "application/json; charset=utf-8" } });
  if (m === "GET" && path === "/api/themes") return rawJson(cat.list); // O-THM-001: no auth, zero writes
  const thmMatch = path.match(/^\/api\/themes\/([^/]+)$/);
  if (m === "GET" && thmMatch) {
    const payload = cat.themes.get(decodeURIComponent(thmMatch[1]));
    if (!payload) return errRes(404, "not_found", "unknown theme"); // B-THM-002: never substitution
    return rawJson(payload);
  }

  // ---- quote-library (v1.1.0; port of implementation/src/server/app.js) ----
  // serveQuote/quoteState/weightedPickIndex/seededRand/searchQuotes/QUOTE_PAGE_SIZE
  // come from the verbatim shared/quotes.js section above.
  // Shared quote read derivations — session routes AND public-api mirrors call
  // these SAME closures (B-API-004 parity by construction).
  const qp = (k, dflt) => (url.searchParams.has(k) ? url.searchParams.get(k) : dflt);
  const quotesRandomPayload = ({ language = "english", group, seed }) => {
    // B-QT-001/B-QT-006(c,d): approved only — pending and refused never served.
    const pool = quotes.read().quotes
      .filter((q) => quoteState(q) === "approved" && q.language === language)
      .filter((q) => group === undefined || serveQuote(q).group === Number(group));
    if (pool.length === 0) return { error: [404, "not_found", "no quotes"] };
    // B-QT-007: rating-weighted; ?seed= makes the pick reproducible.
    const rand = seed !== undefined && /^\d+$/.test(seed) ? seededRand(Number(seed)) : Math.random;
    return { payload: serveQuote(pool[weightedPickIndex(pool, rand)]) };
  };
  // B-QT-009 search/browse: approved only; language + q filters; stable
  // submission order; fixed page size 50; page 0-based.
  const quotesSearchPayload = ({ language, q, page }) => {
    let pageNum = 0;
    if (page !== undefined) {
      if (!/^\d+$/.test(page)) return { error: [422, "unprocessable", "page must be a non-negative integer"] };
      pageNum = Number(page);
    }
    const { quotes: pageQuotes, total } = searchQuotes(quotes.read().quotes, { language, q, page: pageNum });
    return { payload: { quotes: pageQuotes.map(serveQuote), page: pageNum, pageSize: QUOTE_PAGE_SIZE, total } };
  };
  const sendPayload = (out) => (out.error ? errRes(out.error[0], out.error[1], out.error[2]) : jsonRes(out.payload));
  if (m === "GET" && path === "/api/quotes/random") {
    return sendPayload(quotesRandomPayload({ language: qp("language", "english"), group: qp("group", undefined), seed: qp("seed", undefined) }));
  }
  if (m === "GET" && path === "/api/quotes") {
    return sendPayload(quotesSearchPayload({ language: qp("language", undefined), q: qp("q", undefined), page: qp("page", undefined) }));
  }
  // B-QT-008 favorites (own-data-only; add idempotent; list = approved only).
  if (m === "GET" && path === "/api/quotes/favorites") {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    const mine = favorites.read().favorites[a.uid] ?? [];
    const byId = new Map(quotes.read().quotes.map((q) => [q.id, q]));
    const list = mine.map((id) => byId.get(id)).filter((q) => q && quoteState(q) === "approved");
    return jsonRes({ quotes: list.map(serveQuote) });
  }
  if (m === "POST" && path === "/api/quotes/favorites") {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    const b = (await body()) ?? {};
    const extraKeys = Object.keys(b).filter((k) => k !== "quoteId");
    if (typeof b.quoteId !== "string" || b.quoteId.length < 1 || b.quoteId.length > 64 || extraKeys.length) {
      return errRes(422, "unprocessable", "invalid favorite request");
    }
    const q = quotes.read().quotes.find((x) => x.id === b.quoteId);
    if (!q) return errRes(404, "not_found", "quote not found");
    favorites.commit((d) => {
      const mine = d.favorites[a.uid] ?? (d.favorites[a.uid] = []);
      if (!mine.includes(q.id)) mine.push(q.id); // idempotent add
    });
    return jsonRes({ ok: true });
  }
  const favDel = path.match(/^\/api\/quotes\/favorites\/([^/]+)$/);
  if (m === "DELETE" && favDel) {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    favorites.commit((d) => {
      const mine = d.favorites[a.uid] ?? [];
      d.favorites[a.uid] = mine.filter((id) => id !== decodeURIComponent(favDel[1])); // idempotent remove
    });
    return jsonRes({ ok: true }); // the quote itself is untouched (B-QT-008)
  }
  if (m === "POST" && path === "/api/quotes") {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    const { text, source, language } = (await body()) ?? {};
    if (typeof text !== "string" || text.length < 1 || text.length > 500 ||
        typeof source !== "string" || source.length < 1 || typeof language !== "string") {
      return errRes(422, "unprocessable", "invalid quote");
    }
    const norm = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();
    const existing = quotes.read().quotes.find((q) => q.language === language && norm(q.text) === norm(text));
    if (existing) return jsonRes(serveQuote(existing)); // B-QT-003 idempotent (any state; no second write)
    const q = { id: randomUUID(), text, source, language, length: text.length,
                state: "pending", approved: false, ratings: {} }; // B-QT-006
    quotes.commit((d) => { d.quotes.push(q); });
    return jsonRes(serveQuote(q), 201);
  }
  const qm = path.match(/^\/api\/quotes\/([^/]+)\/(approve|refuse|rate)$/);
  // Tri-state moderation (B-QT-006(b)): moderator-only, idempotent; optional
  // moderationNote <=500 chars persisted as metadata. (a) approved === (state==="approved").
  if (m === "POST" && qm && (qm[2] === "approve" || qm[2] === "refuse")) {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    if (!a.user.moderator) return errRes(403, "forbidden", "moderator only"); // B-QT-004/B-QT-006(b)
    const note = (await body())?.moderationNote;
    if (note !== undefined && (typeof note !== "string" || note.length > 500)) {
      return errRes(422, "unprocessable", "moderationNote: string <= 500 chars");
    }
    const target = qm[2] === "approve" ? "approved" : "refused";
    let found = null;
    quotes.commit((d) => {
      const q = d.quotes.find((x) => x.id === qm[1]);
      if (q) {
        q.state = target;
        q.approved = target === "approved";
        if (note !== undefined) q.moderationNote = note;
        found = q;
      }
    });
    if (!found) return errRes(404, "not_found", "quote not found");
    return jsonRes(serveQuote(found)); // refused persisted with metadata (c), never served
  }
  if (m === "POST" && qm && qm[2] === "rate") {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    const r = (await body())?.rating;
    if (!Number.isInteger(r) || r < 1 || r > 5) return errRes(422, "unprocessable", "rating 1..5");
    let out = null;
    quotes.commit((d) => {
      const q = d.quotes.find((x) => x.id === qm[1]);
      if (q) { q.ratings[a.uid] = r; out = q; } // B-QT-005
    });
    if (!out) return errRes(404, "not_found", "quote not found");
    const vals = Object.values(out.ratings);
    return jsonRes({ rating: { average: vals.reduce((x, y) => x + y, 0) / vals.length, count: vals.length } });
  }

  // ---- test-results (v1.2.0) ----
  if (m === "POST" && path === "/api/results") {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required"); // O-RES-003
    const event = (await body()) ?? {};
    const verrs = validateCompletedEvent(event);
    if (verrs.length) return errRes(422, "unprocessable", verrs.join("; ")); // S-RES-001
    const spacingStats = keyStats(event.keySpacing);
    const durationStats = keyStats(event.keyDuration);
    const verdict = evaluate({ event, keySpacingStats: spacingStats,
                               keyDurationStats: durationStats, lbOptOut: !!a.user.lbOptOut });
    if (verdict.decision !== "admit") {
      return errRes(422, "unprocessable", "rejected: " + verdict.reasons.join(",")); // B-RES-001
    }
    // B-RES-001 (v1.2.0): zen NOT persisted — admission verdict + non-stored indicator.
    if (event.mode === "zen") {
      return jsonRes({ verdict: verdict.decision, stored: false,
                       anticheat: { decision: verdict.decision, reasons: verdict.reasons } });
    }
    const d = results.read();
    const dup = d.results.find((r) => r.uid === a.uid && r.hash === event.hash && event.hash !== "");
    if (dup) return jsonRes(dup); // B-RES-002 idempotent
    const stored = {
      id: randomUUID(), uid: a.uid, name: a.user.name,
      wpm: event.wpm, rawWpm: event.rawWpm, acc: event.acc, mode: event.mode, mode2: event.mode2,
      language: event.language, timestamp: event.timestamp, testDuration: event.testDuration,
      consistency: event.consistency, punctuation: event.punctuation, numbers: event.numbers,
      bailedOut: event.bailedOut, isPb: false, hash: event.hash,
      minThresholdFailed: event.minThresholdFailed === true, // C6: persisted, visible in history
      tags: [],
      anticheat: { decision: verdict.decision, reasons: verdict.reasons },
    };
    results.commit((dd) => {
      dd.results.push(stored);
      // B-RES-003 (v1.2.0): bailedOut AND minThresholdFailed never PB, never demote.
      if (!stored.bailedOut && !stored.minThresholdFailed) {
        const sameTuple = (r) => r.uid === stored.uid && r.mode === stored.mode && r.mode2 === stored.mode2 &&
          r.language === stored.language && r.punctuation === stored.punctuation &&
          r.numbers === stored.numbers && !r.bailedOut && r.minThresholdFailed !== true;
        const pbs = dd.results.filter((r) => sameTuple(r) && r.isPb);
        const best = Math.max(0, ...pbs.map((r) => r.wpm));
        if (stored.wpm > best) {                    // B-RES-003 strict improvement
          for (const r of dd.results) if (sameTuple(r)) r.isPb = false;
          stored.isPb = true;
        }
      }
    });
    return jsonRes(stored, 201);
  }
  // Shared results read derivations — session routes AND public-api mirrors
  // call these SAME closures (B-API-004 parity by construction).
  const parseTagFilter = (t) => (t ?? "").split(",").filter(Boolean); // B-RES-006(c): multi-tag = INTERSECTION
  const historyPayload = (uid, tagFilter) => ({
    results: results.read().results
      .filter((r) => r.uid === uid)
      .filter((r) => matchesTagFilter(r, tagFilter))
      .sort((x, y) => y.timestamp - x.timestamp) // B-RES-005
      .map(({ hash, ...r }) => r),
  });
  const pbsPayload = (uid, tagFilter) => {
    const mine = results.read().results.filter((r) => r.uid === uid);
    if (tagFilter.length) {
      // B-RES-006(e): tag-scoped PB read — READ-TIME derivation, never mutates isPb.
      return { pbs: scopedPbs(mine, tagFilter).map(({ hash, ...r }) => r) };
    }
    return { pbs: mine.filter((r) => r.isPb).map(({ hash, ...r }) => r) };
  };
  if (m === "GET" && path === "/api/results") {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    return jsonRes(historyPayload(a.uid, parseTagFilter(url.searchParams.get("tags"))));
  }
  if (m === "GET" && path === "/api/results/pbs") {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    return jsonRes(pbsPayload(a.uid, parseTagFilter(url.searchParams.get("tags"))));
  }

  // ---- result tags (B-RES-006, v1.2.0) — helpers from verbatim shared/tags.js ----
  if (m === "GET" && path === "/api/results/tags") {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    return jsonRes({ tags: tags.read().tags.filter((t) => t.uid === a.uid).map(serveTag) });
  }
  if (m === "POST" && path === "/api/results/tags") {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    const name = (await body())?.name;
    if (!isValidTagName(name)) return errRes(422, "unprocessable", "tag name: string 1..64 chars");
    if (findTagByName(tags.read().tags, a.uid, name)) return errRes(409, "conflict", "tag name taken");
    const tag = { id: randomUUID(), uid: a.uid, name };
    tags.commit((d) => { d.tags.push(tag); });
    return jsonRes(serveTag(tag), 201);
  }
  const tagOne = path.match(/^\/api\/results\/tags\/([^/]+)$/);
  if (m === "PATCH" && tagOne) {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    const name = (await body())?.name;
    if (!isValidTagName(name)) return errRes(422, "unprocessable", "tag name: string 1..64 chars");
    const id = decodeURIComponent(tagOne[1]);
    if (!findTagById(tags.read().tags, a.uid, id)) return errRes(404, "not_found", "tag not found");
    const clash = findTagByName(tags.read().tags, a.uid, name);
    if (clash && clash.id !== id) return errRes(409, "conflict", "tag name taken");
    let out = null;
    tags.commit((d) => { const t = d.tags.find((x) => x.id === id && x.uid === a.uid); if (t) { t.name = name; out = t; } });
    return jsonRes(serveTag(out));
  }
  if (m === "DELETE" && tagOne) {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    const id = decodeURIComponent(tagOne[1]);
    if (!findTagById(tags.read().tags, a.uid, id)) return errRes(404, "not_found", "tag not found");
    // (d) delete-cascade: tag removed from every result; results unaffected.
    tags.commit((d) => { d.tags = d.tags.filter((t) => !(t.id === id && t.uid === a.uid)); });
    results.commit((d) => {
      for (const r of d.results) {
        if (r.uid === a.uid && Array.isArray(r.tags) && r.tags.includes(id)) {
          r.tags = r.tags.filter((x) => x !== id);
        }
      }
    });
    return jsonRes({ ok: true });
  }
  const assignTag = path.match(/^\/api\/results\/([^/]+)\/tags$/);
  if (m === "POST" && assignTag) {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    const tagId = (await body())?.tagId;
    if (typeof tagId !== "string" || tagId.length < 1 || tagId.length > 64) {
      return errRes(422, "unprocessable", "tagId: string 1..64 chars");
    }
    if (!findTagById(tags.read().tags, a.uid, tagId)) return errRes(404, "not_found", "tag not found");
    const target = results.read().results.find((r) => r.id === decodeURIComponent(assignTag[1]) && r.uid === a.uid);
    if (!target) return errRes(404, "not_found", "result not found");
    if ((target.tags ?? []).length >= TAGS_PER_RESULT_MAX && !target.tags.includes(tagId)) {
      return errRes(422, "unprocessable", `at most ${TAGS_PER_RESULT_MAX} tags per result`);
    }
    results.commit((d) => {
      const r = d.results.find((x) => x.id === target.id);
      r.tags = r.tags ?? [];
      if (!r.tags.includes(tagId)) r.tags.push(tagId);
    });
    const { hash, ...rest } = results.read().results.find((x) => x.id === target.id);
    return jsonRes(rest);
  }
  const unassignTag = path.match(/^\/api\/results\/([^/]+)\/tags\/([^/]+)$/);
  if (m === "DELETE" && unassignTag) {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    const tagId = decodeURIComponent(unassignTag[2]);
    if (!findTagById(tags.read().tags, a.uid, tagId)) return errRes(404, "not_found", "tag not found");
    const target = results.read().results.find((r) => r.id === decodeURIComponent(unassignTag[1]) && r.uid === a.uid);
    if (!target) return errRes(404, "not_found", "result not found");
    results.commit((d) => {
      const r = d.results.find((x) => x.id === target.id);
      r.tags = (r.tags ?? []).filter((x) => x !== tagId); // idempotent unassign
    });
    const { hash, ...rest } = results.read().results.find((x) => x.id === target.id);
    return jsonRes(rest);
  }

  // ---- result-stats (v1.0.0, NEW bundle; verbatim shared/resultStats.js) ----
  // Read-only, own-data-only (S-STS-003: auth before any computation), zero writes.
  const ownResults = (uid) => results.read().results.filter((r) => r.uid === uid);
  // Shared stats derivations — session routes AND public-api mirrors (B-API-004).
  const statsPayloads = {
    aggregates: (uid) => computeAggregates(ownResults(uid)),
    pbs: (uid) => computePbTable(ownResults(uid)),
    activity: (uid) => computeActivity(ownResults(uid)),
    "wpm-series": (uid) => computeWpmSeries(ownResults(uid)),
  };
  const statsMatch = path.match(/^\/api\/stats\/(aggregates|pbs|activity|wpm-series)$/);
  if (m === "GET" && statsMatch) {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    return jsonRes(statsPayloads[statsMatch[1]](a.uid));
  }

  // ---- leaderboards (v1.1.0; verbatim shared/leaderboards.js) ----
  // Board key (S-LB-001): (mode=time, mode2 in {15,60}, language from the
  // wordlists registry, timeWindow in {alltime, daily}). Read-time recompute (B-LB-003).
  const lm = path.match(/^\/api\/leaderboards\/([^/]+)$/);
  if (m === "GET" && lm) {
    const mode2 = decodeURIComponent(lm[1]);
    if (!BOARD_MODE2.includes(mode2)) return errRes(404, "not_found", "no such board"); // S-LB-001
    const language = url.searchParams.get("language") ?? "english";
    if (!REGISTRY_IDS.has(language)) return errRes(404, "not_found", "unknown language"); // S-LB-001/S-LB-002
    const timeWindow = url.searchParams.get("timeWindow") ?? "alltime";
    if (!TIME_WINDOWS.includes(timeWindow)) return errRes(404, "not_found", "no such board");
    const now = Date.now(); // B-LB-005: daily rolling window at read time
    const { entries } = computeBoard(results.read().results, { mode2, language, timeWindow, now });
    const n = Math.min(Number(url.searchParams.get("n")) || DEFAULT_TOP_N, MAX_TOP_N);
    const a = auth();
    let requester = null;
    if (a) {
      const mine = entries.find((e) => e.uid === a.uid);
      if (mine) requester = { rank: mine.rank, entry: mine, percentile: mine.percentile }; // B-LB-004/006
    }
    return jsonRes({ board: { mode: "time", mode2, language, timeWindow },
                     entries: entries.slice(0, n), requester });
  }

  // ---- user-profile (v1.0.0, NEW bundle; verbatim shared/profile.js) ----
  // Compose-only (B-PRO-001): identity from user-account (read-only), pbs/
  // aggregates pass-through from result-stats, xp = sum of sealed per-result xp
  // fields, streaks ONLY from the activity series, level recomputed per read.
  const profilePayload = (uid) => composeProfile({
    user: accounts.read().users[uid],
    mine: ownResults(uid),
    stored: profiles.read().profiles[uid],
    now: Date.now(), // B-PRO-002 streak aliveness (injected clock on Node)
  });
  // Own-profile read (B-PRO-005: unaffected by isPublic).
  if (m === "GET" && path === "/api/profile") {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    return jsonRes(profilePayload(a.uid));
  }
  // Strict own-field edits (S-PRO-003 / B-PRO-004): closed shape, all-or-nothing.
  if (m === "PATCH" && path === "/api/profile") {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    const v = validateProfileUpdate(await body());
    if (!v.ok) return errRes(422, "unprocessable", v.errors.join("; "));
    profiles.commit((d) => { d.profiles[a.uid] = { ...(d.profiles[a.uid] ?? {}), ...v.value }; });
    return jsonRes(profilePayload(a.uid));
  }
  // Public read by name (B-PRO-005): unknown OR isPublic=false => identical
  // 404-shaped envelope (O-RES-004 precedent). Case-insensitive lookup.
  const profMatch = path.match(/^\/api\/profile\/([^/]+)$/);
  if (m === "GET" && profMatch) {
    const uname = decodeURIComponent(profMatch[1]).toLowerCase();
    const entry = Object.entries(accounts.read().users)
      .find(([, u]) => u.name.toLowerCase() === uname);
    if (!entry) return errRes(404, "not_found", "profile not found");
    if (!isPublicOf(profiles.read().profiles[entry[0]])) {
      return errRes(404, "not_found", "profile not found"); // identical envelope
    }
    return jsonRes(profilePayload(entry[0]));
  }

  // ---- public-api (v1.0.0, NEW bundle; verbatim shared/apekeys.js) ----
  // ApeKey lifecycle (session-gated) + key-gated mirrored read surface.
  // B-API-001: generate mints pdd_ + 128-bit hex; PLAINTEXT shown exactly once;
  // at rest only salt + salted hash persist.
  if (m === "POST" && path === "/api/apekeys") {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    const v = validateApeKeyCreate(await body()); // S-API-001 fail-closed
    if (!v.ok) return errRes(422, "unprocessable", v.errors.join("; "));
    const { plaintext, salt, hash } = mintApeKey();
    const rec = { id: randomUUID(), uid: a.uid, name: v.value.name, scopes: v.value.scopes,
                  createdAt: Date.now(), enabled: true, salt, hash };
    apekeys.commit((d) => { d.apekeys.push(rec); });
    return jsonRes({ key: plaintext, apekey: serveApeKey(rec) }, 201); // show-once
  }
  // B-API-001: list returns METADATA only — never key material.
  if (m === "GET" && path === "/api/apekeys") {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    return jsonRes({ apekeys: apekeys.read().apekeys.filter((k) => k.uid === a.uid).map(serveApeKey) });
  }
  // B-API-001: revoke idempotent + fail-closed; unknown/foreign indistinguishable.
  const akMatch = path.match(/^\/api\/apekeys\/([^/]+)$/);
  if (m === "DELETE" && akMatch) {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    const id = decodeURIComponent(akMatch[1]);
    let out = null;
    apekeys.commit((d) => {
      const k = d.apekeys.find((x) => x.id === id && x.uid === a.uid);
      if (k) { k.enabled = false; out = k; }
    });
    if (!out) return errRes(404, "not_found", "apekey not found");
    return jsonRes(serveApeKey(out));
  }

  // Key authentication + rate limiting for the /api/public surface.
  // Check order (documented): per-IP window → key auth (401) → per-key window
  // (429) → scope (403). B-API-002: session tokens never authenticate here;
  // ApeKeys fail verifyToken on session routes — domains stay separated.
  const clientIp = () =>
    request.headers.get("cf-connecting-ip") ||
    (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const rateLimitedRes = (hit) => {
    const retryAfterSec = Math.ceil(hit.retryAfterMs / 1000);
    // Retry metadata in standard headers; body stays the sealed ErrorEnvelope.
    return new Response(JSON.stringify({
      error: { code: "rate_limited", message: `rate limit exceeded; retry after ${retryAfterSec}s`, correlation_id: randomUUID() },
    }), { status: 429, headers: {
      "content-type": "application/json; charset=utf-8",
      "retry-after": String(retryAfterSec),
      "x-ratelimit-limit": String(hit.limit),
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": String(Math.ceil(hit.resetMs / 1000)),
    } });
  };
  const apiAuth = () => {
    const ipHit = LIMITER.consume("ip", clientIp(), Date.now()); // O-API-003
    if (!ipHit.allowed) return { fail: rateLimitedRes(ipHit) };
    const h = request.headers.get("authorization") || "";
    const presented = h.startsWith("Bearer ") ? h.slice(7) : null;
    const rec = presented && authenticateApeKey(apekeys.read().apekeys, presented);
    if (!rec) return { fail: errRes(401, "unauthorized", "valid ApeKey required") };
    const keyHit = LIMITER.consume("key", rec.id, Date.now()); // B-API-005
    if (!keyHit.allowed) return { fail: rateLimitedRes(keyHit) };
    return { rec };
  };
  // B-API-003 fail-closed scope enforcement.
  const publicRead = (scope, handler) => {
    const a = apiAuth();
    if (a.fail) return a.fail;
    if (!a.rec.scopes.includes(scope)) return errRes(403, "forbidden", "scope " + scope + " required");
    return handler(a.rec);
  };

  // Mirrored read surface (B-API-004): the SAME derivation closures as the
  // source handshakes — recompute-equal by construction.
  if (m === "GET" && path === "/api/public/results") {
    return publicRead("results:read", (rec) => jsonRes(historyPayload(rec.uid, parseTagFilter(url.searchParams.get("tags")))));
  }
  if (m === "GET" && path === "/api/public/results/pbs") {
    return publicRead("results:read", (rec) => jsonRes(pbsPayload(rec.uid, parseTagFilter(url.searchParams.get("tags")))));
  }
  const pubStatsMatch = path.match(/^\/api\/public\/stats\/(aggregates|pbs|activity|wpm-series)$/);
  if (m === "GET" && pubStatsMatch) {
    return publicRead("stats:read", (rec) => jsonRes(statsPayloads[pubStatsMatch[1]](rec.uid)));
  }
  if (m === "GET" && path === "/api/public/profile") {
    return publicRead("profile:read", (rec) => jsonRes(profilePayload(rec.uid)));
  }
  if (m === "GET" && path === "/api/public/quotes/random") {
    return publicRead("quotes:read", () => sendPayload(quotesRandomPayload({ language: qp("language", "english"), group: qp("group", undefined), seed: qp("seed", undefined) })));
  }
  if (m === "GET" && path === "/api/public/quotes") {
    return publicRead("quotes:read", () => sendPayload(quotesSearchPayload({ language: qp("language", undefined), q: qp("q", undefined), page: qp("page", undefined) })));
  }

  return null; // no API route matched
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (path.startsWith("/api/")) {
        const stores = {
          accounts: new KvStore(env.PDD_STORE, "accounts", { users: {}, tokens: {} }),
          configs: new KvStore(env.PDD_STORE, "configs", {}),
          results: new KvStore(env.PDD_STORE, "results", { results: [] }),
          tags: new KvStore(env.PDD_STORE, "tags", { tags: [] }),
          quotes: new KvStore(env.PDD_STORE, "quotes", { quotes: seedQuotes() }),
          favorites: new KvStore(env.PDD_STORE, "favorites", { favorites: {} }),
          profiles: new KvStore(env.PDD_STORE, "profiles", { profiles: {} }), // user-profile v1.0.0
          apekeys: new KvStore(env.PDD_STORE, "apekeys", { apekeys: [] }), // public-api v1.0.0
        };
        await Promise.all(Object.values(stores).map((s) => s.load()));
        const res = await handleApi(request, url, stores);
        await Promise.all(Object.values(stores).map((s) => s.flush()));
        // Unknown API routes are protocol-visible failures: ErrorEnvelope (O-RES-004).
        return res ?? errRes(404, "not_found", "no such route");
      }

      if (request.method === "GET" || request.method === "HEAD") {
        if (path === "/favicon.ico") return new Response(null, { status: 204 });
        const asset = ASSETS[path];
        if (asset) {
          return new Response(asset.body, {
            headers: { "content-type": asset.type, "cache-control": "no-cache" },
          });
        }
      }
      return errRes(404, "not_found", "no such route");
    } catch (e) {
      return errRes(500, "internal", "internal error");
    }
  },
};
