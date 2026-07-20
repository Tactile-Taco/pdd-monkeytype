// ============================================================================
// Workers glue (ported platform layer) — appended by worker/build.mjs after the
// verbatim protocol modules. Express router -> fetch(request, env) router;
// Store (JSON file) -> KvStore (KV + in-request cache). The file-based RVL
// Dynamic Evidence Ledger is Node-only; this deployment runs without it
// (documented limitation, see worker/README.md). Token secret is a demo
// constant. KV is eventually consistent.
// ============================================================================

const ASSETS = /*__ASSETS__*/ {};

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
  const mk = (id, text, source) => ({ id, text, source, language: "english",
    length: text.length, approved: true, ratings: {} });
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

// ---- API router (port of implementation/src/server/app.js) ----
// Returns a Response, or null when (method, path) matches no API route.
async function handleApi(request, url, stores) {
  const { accounts, configs, results, quotes } = stores;
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

  // ---- quote-library ----
  const QUOTE_GROUPS = [[1, 100], [101, 300], [301, 600], [601, Infinity]]; // B-QT-002
  const groupOf = (len) => QUOTE_GROUPS.findIndex(([lo, hi]) => len >= lo && len <= hi);
  const withGroup = (q) => {
    const { ratings, ...rest } = q;
    const vals = Object.values(ratings ?? {});
    return { ...rest, group: groupOf(q.length),
             ...(vals.length ? { rating: { average: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length } } : {}) };
  };
  if (m === "GET" && path === "/api/quotes/random") {
    const language = url.searchParams.get("language") ?? "english";
    const group = url.searchParams.has("group") ? url.searchParams.get("group") : undefined;
    const pool = quotes.read().quotes
      .filter((q) => q.approved && q.language === language)
      .map(withGroup)
      .filter((q) => group === undefined || q.group === Number(group)); // B-QT-001
    if (pool.length === 0) return errRes(404, "not_found", "no quotes");
    return jsonRes(pool[Math.floor(Math.random() * pool.length)]);
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
    if (existing) return jsonRes(withGroup(existing)); // B-QT-003 idempotent
    const q = { id: randomUUID(), text, source, language, length: text.length,
                approved: false, ratings: {} };
    quotes.commit((d) => { d.quotes.push(q); });
    return jsonRes(withGroup(q), 201);
  }
  const qm = path.match(/^\/api\/quotes\/([^/]+)\/(approve|rate)$/);
  if (m === "POST" && qm && qm[2] === "approve") {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    if (!a.user.moderator) return errRes(403, "forbidden", "moderator only"); // B-QT-004
    let found = null;
    quotes.commit((d) => { const q = d.quotes.find((x) => x.id === qm[1]); if (q) { q.approved = true; found = q; } });
    if (!found) return errRes(404, "not_found", "quote not found");
    return jsonRes(withGroup(found));
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

  // ---- test-results ----
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
    const d = results.read();
    const dup = d.results.find((r) => r.uid === a.uid && r.hash === event.hash && event.hash !== "");
    if (dup) return jsonRes(dup); // B-RES-002 idempotent
    const stored = {
      id: randomUUID(), uid: a.uid, name: a.user.name,
      wpm: event.wpm, rawWpm: event.rawWpm, acc: event.acc, mode: event.mode, mode2: event.mode2,
      language: event.language, timestamp: event.timestamp, testDuration: event.testDuration,
      consistency: event.consistency, punctuation: event.punctuation, numbers: event.numbers,
      bailedOut: event.bailedOut, isPb: false, hash: event.hash,
      anticheat: { decision: verdict.decision, reasons: verdict.reasons },
    };
    results.commit((dd) => {
      dd.results.push(stored);
      if (!stored.bailedOut) {
        const sameTuple = (r) => r.uid === stored.uid && r.mode === stored.mode && r.mode2 === stored.mode2 &&
          r.language === stored.language && r.punctuation === stored.punctuation &&
          r.numbers === stored.numbers && !r.bailedOut;
        const pbs = dd.results.filter((r) => sameTuple(r) && r.isPb);
        const best = Math.max(0, ...pbs.map((r) => r.wpm));
        if (stored.wpm > best) {                    // B-RES-003
          for (const r of dd.results) if (sameTuple(r)) r.isPb = false;
          stored.isPb = true;
        }
      }
    });
    return jsonRes(stored, 201);
  }
  if (m === "GET" && path === "/api/results") {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    const mine = results.read().results
      .filter((r) => r.uid === a.uid)
      .sort((x, y) => y.timestamp - x.timestamp) // B-RES-005
      .map(({ hash, ...r }) => r);
    return jsonRes({ results: mine });
  }
  if (m === "GET" && path === "/api/results/pbs") {
    const a = auth();
    if (!a) return errRes(401, "unauthorized", "token required");
    return jsonRes({ pbs: results.read().results.filter((r) => r.uid === a.uid && r.isPb) });
  }

  // ---- leaderboards ----
  const lm = path.match(/^\/api\/leaderboards\/([^/]+)$/);
  if (m === "GET" && lm) {
    const mode2 = lm[1];
    if (!["15", "60"].includes(mode2)) return errRes(404, "not_found", "no such board"); // S-LB-001
    const eligible = results.read().results.filter((r) =>
      r.mode === "time" && r.mode2 === mode2 && r.language === "english" &&
      r.anticheat.decision === "admit" && !r.bailedOut); // B-LB-001
    const bestByUser = new Map();
    for (const r of eligible) {
      const cur = bestByUser.get(r.uid);
      if (!cur || r.wpm > cur.wpm || (r.wpm === cur.wpm && r.timestamp < cur.timestamp)) bestByUser.set(r.uid, r);
    }
    const entries = [...bestByUser.values()]
      .sort((x, y) => y.wpm - x.wpm || x.timestamp - y.timestamp) // B-LB-002
      .map((r, i) => ({ rank: i + 1, uid: r.uid, name: r.name, wpm: r.wpm, rawWpm: r.rawWpm,
                        acc: r.acc, consistency: r.consistency, timestamp: r.timestamp }));
    const n = Math.min(Number(url.searchParams.get("n")) || 50, 100);
    const a = auth();
    let requester = null;
    if (a) {
      const mine = entries.find((e) => e.uid === a.uid);
      if (mine) requester = { rank: mine.rank, entry: mine }; // B-LB-004
    }
    return jsonRes({ board: { mode: "time", mode2, language: "english" },
                     entries: entries.slice(0, n), requester });
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
          quotes: new KvStore(env.PDD_STORE, "quotes", { quotes: seedQuotes() }),
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
