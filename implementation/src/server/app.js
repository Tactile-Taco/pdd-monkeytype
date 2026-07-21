// Express application wiring all protocol implementations.
// Route surface (protocol-visible): account, config, themes, quotes, results,
// result tags, result-stats, leaderboards, wordlist assets, user-profile,
// public-api (ApeKey lifecycle + key-gated mirrored read surface).
import express from "express";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./store.js";
import { hashPassword, verifyPassword, issueToken, verifyToken, revokeToken } from "./auth.js";
import { validateCompletedEvent, validateConfigUpdate, CONFIG_DEFAULTS, keyStats } from "./validate.js";
import { evaluate } from "../anticheat/index.js";
import { makeRvl } from "./rvl.js";
import { THEMES, catalogList, findTheme, validateThemeShape, charterBandReport } from "../shared/themes.js";
import { admitCatalog, registryIds } from "../shared/wordlists.js";
import { serveQuote, quoteState, ratingWeight, weightedPickIndex, seededRand,
         searchQuotes, QUOTE_PAGE_SIZE } from "../shared/quotes.js";
import { computeAggregates, computePbTable, computeActivity, computeWpmSeries } from "../shared/resultStats.js";
import { computeBoard, BOARD_MODE2, TIME_WINDOWS, DEFAULT_TOP_N, MAX_TOP_N } from "../shared/leaderboards.js";
import { isValidTagName, findTagByName, findTagById, serveTag, matchesTagFilter,
         scopedPbs, TAGS_PER_RESULT_MAX } from "../shared/tags.js";
import { composeProfile, validateProfileUpdate, isPublicOf } from "../shared/profile.js";
import { mintApeKey, authenticateApeKey, validateApeKeyCreate, serveApeKey,
         createRateLimiter, RATE_WINDOW_MS, RATE_KEY_LIMIT, RATE_IP_LIMIT } from "../shared/apekeys.js";

const NAME_RE = /^[a-zA-Z0-9_-]{3,16}$/;

// `now` is the INJECTED CLOCK for the wave-3 surfaces (user-profile streaks per
// B-PRO-002; public-api rate-limit windows per B-API-005/O-API-003) — tests can
// pin time deterministically. Defaults to the wall clock; pre-existing surfaces
// (account tokens, leaderboards daily window) keep their own Date.now() calls.
export function createApp({ dataDir, implVersion = "unknown", ledgerDir = null, heartbeatMs = 15000, now = null }) {
  const NOW = typeof now === "function" ? now : () => Date.now();
  const accounts = new Store(`${dataDir}/accounts.json`, { users: {}, tokens: {} });
  const configs = new Store(`${dataDir}/configs.json`, {});
  const results = new Store(`${dataDir}/results.json`, { results: [] });
  const tags = new Store(`${dataDir}/tags.json`, { tags: [] }); // test-results v1.2.0 (capability: data/tags.json)
  const quotes = new Store(`${dataDir}/quotes.json`, { quotes: seedQuotes() });
  const favorites = new Store(`${dataDir}/favorites.json`, { favorites: {} }); // quote-library v1.1.0 (capability: data/favorites.json)
  const profiles = new Store(`${dataDir}/profile.json`, { profiles: {} }); // user-profile v1.0.0 (capability: data/profile.json)
  const apekeys = new Store(`${dataDir}/apekeys.json`, { apekeys: [] }); // public-api v1.0.0 (capability: data/apekeys.json)

  const app = express();
  app.use(express.json({ limit: "256kb" }));

  // ---- runtime verification layer: the OUTERMOST middleware. Every response
  // passes through the observation boundary (isolation property of the RVL);
  // nothing (not even drill hooks) may sit outside it. ----
  if (ledgerDir) {
    app.locals.rvl = makeRvl({ implVersion, ledgerDir, heartbeatMs });
    app.use(app.locals.rvl);
  }

  // Drill hook (NOT part of the admitted candidate): PDD_CHAOS=":path:delayMs"
  // injects latency INSIDE the observed boundary so the RVL drill can force a
  // violation. The admitted build runs with this unset; see harness/runtime-drill.mjs.
  if (process.env.PDD_CHAOS) {
    const [, chaosPath, delayMs] = process.env.PDD_CHAOS.split(":");
    app.use(chaosPath, (req, res, next) => setTimeout(next, Number(delayMs)));
  }

  // static: frontend + engine modules (engine runs isomorphically in browser)
  const here = dirname(fileURLToPath(import.meta.url));
  const implRoot = join(here, "..", "..");
  app.use("/engine", express.static(join(implRoot, "src", "engine")));
  app.use("/shared", express.static(join(implRoot, "src", "shared")));
  app.use("/", express.static(join(implRoot, "public")));

  const err = (res, status, code, message) =>
    res.status(status).json({ error: { code, message, correlation_id: randomUUID() } });

  // ---- auth helpers ----
  const auth = (req) => {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    const claims = token && verifyToken(accounts, token);
    if (!claims) return null;
    const user = accounts.read().users[claims.uid];
    return user ? { token, uid: claims.uid, user } : null;
  };
  const profile = (uid, u) => ({ uid, name: u.name, addedAt: u.addedAt, moderator: !!u.moderator });

  // ---- user-account ----
  app.post("/api/account/signup", (req, res) => {
    const { name, password } = req.body ?? {};
    if (typeof name !== "string" || !NAME_RE.test(name)) return err(res, 422, "unprocessable", "invalid username");
    if (typeof password !== "string" || password.length < 8) return err(res, 422, "unprocessable", "password too short");
    const d = accounts.read();
    const clash = Object.values(d.users).some((u) => u.name.toLowerCase() === name.toLowerCase());
    if (clash) return err(res, 409, "conflict", "username taken"); // B-ACC-001
    const uid = randomUUID();
    accounts.commit((dd) => { dd.users[uid] = { name, pw: hashPassword(password), addedAt: Date.now(), moderator: name === "moderator" }; });
    const token = issueToken(accounts, uid);
    res.json({ token, profile: profile(uid, accounts.read().users[uid]) });
  });

  app.post("/api/account/login", (req, res) => {
    const { name, password } = req.body ?? {};
    const d = accounts.read();
    const entry = Object.entries(d.users).find(([, u]) => u.name.toLowerCase() === String(name ?? "").toLowerCase());
    if (!entry || !verifyPassword(String(password ?? ""), entry[1].pw)) {
      return err(res, 401, "unauthorized", "invalid credentials"); // B-ACC-003: identical shape
    }
    const token = issueToken(accounts, entry[0]);
    res.json({ token, profile: profile(entry[0], entry[1]) });
  });

  app.post("/api/account/logout", (req, res) => {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (token) revokeToken(accounts, token);
    res.json({ ok: true });
  });

  app.get("/api/account/profile", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    res.json(profile(a.uid, a.user));
  });

  // ---- user-config ----
  app.get("/api/config", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required"); // B-CFG-004
    const mine = configs.read()[a.uid] ?? {};
    res.json({ ...CONFIG_DEFAULTS, ...mine }); // B-CFG-001: effective config
  });

  app.put("/api/config", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    const v = validateConfigUpdate(req.body);
    if (!v.ok) return err(res, 422, "unprocessable", "invalid keys: " + v.badKeys.join(",")); // B-CFG-003 wholesale
    configs.commit((d) => { d[a.uid] = { ...(d[a.uid] ?? {}), ...req.body }; }); // B-CFG-002 merge
    res.json({ ...CONFIG_DEFAULTS, ...configs.read()[a.uid] });
  });

  // ---- theme-catalog (v1.0.0, read-only) ----
  // Catalog admission (O-THM-003): every theme is re-checked STATICALLY at boot —
  // charter shape (S-THM-001/002) + charter bands (pure color math, no browser).
  // A failing theme aborts app construction: the candidate cannot ship it.
  for (const t of THEMES) {
    const shape = validateThemeShape(t);
    const bands = charterBandReport(t.tokens);
    if (!shape.ok || !bands.ok) {
      throw new Error(`theme-catalog admission refused theme "${t?.name}": ` +
        [...shape.errors, ...bands.clauses.filter((c) => !c.ok).map((c) => c.msg)].join("; "));
    }
  }
  // Byte-determinism within a deploy (B-THM-003): payloads serialized once.
  const CATALOG_LIST_PAYLOAD = JSON.stringify({ themes: catalogList() });
  const THEME_PAYLOADS = new Map(THEMES.map((t) => [t.name, JSON.stringify(t)]));
  const json = (res, status, payload) => {
    res.status(status).type("application/json; charset=utf-8").send(payload);
  };
  // O-THM-001: unauthenticated, zero store writes, served from bundled data.
  app.get("/api/themes", (req, res) => json(res, 200, CATALOG_LIST_PAYLOAD));
  app.get("/api/themes/:name", (req, res) => {
    const payload = THEME_PAYLOADS.get(req.params.name);
    // B-THM-002: unknown name -> ErrorEnvelope(not_found); never substitution.
    if (!payload) return err(res, 404, "not_found", "unknown theme");
    json(res, 200, payload);
  });

  // ---- wordlists (v1.0.0, NEW bundle) ----
  // Boot admission is FAIL-CLOSED (B-WL-001): the registry + every wordlist
  // asset is re-checked at boot (handshake conformance S-WL-001, referential
  // closure S-WL-002). A non-conforming catalog aborts app construction — the
  // deploy cannot ship it. Assets are static same-origin files (S-WL-003),
  // served byte-verbatim (B-WL-002 determinism within a deploy).
  const WORDLISTS_DIR = join(implRoot, "assets", "wordlists"); // capability: read assets/wordlists/
  const WL_REGISTRY = JSON.parse(readFileSync(join(WORDLISTS_DIR, "registry.json"), "utf8"));
  const WL_ASSETS = readdirSync(WORDLISTS_DIR)
    .filter((f) => f.endsWith(".json") && f !== "registry.json")
    .map((f) => ({ id: f.replace(/\.json$/, ""), parsed: JSON.parse(readFileSync(join(WORDLISTS_DIR, f), "utf8")) }));
  const WL_ADMISSION = admitCatalog(WL_REGISTRY, WL_ASSETS);
  if (!WL_ADMISSION.ok) {
    throw new Error("wordlists boot admission refused: " + WL_ADMISSION.errors.join("; "));
  }
  const REGISTRY_IDS = new Set(registryIds(WL_REGISTRY)); // leaderboards S-LB-001 language validation
  // Public reads (S-WL-003 / O-WL-001): no auth, zero writes, no egress.
  app.use("/wordlists", express.static(WORDLISTS_DIR, { index: false, redirect: false }));
  app.use("/wordlists", (req, res) => err(res, 404, "not_found", "no such wordlist asset")); // S-WL-003 envelope

  // ---- quote-library (v1.1.0) ----
  // Wire shape + tri-state + weight/select/search helpers live in shared/quotes.js
  // (isomorphic; the Workers bundle ports them verbatim). Moderation write path
  // keeps BOTH fields consistent per the B-QT-006(a) clause:
  // approved === (state === "approved") on every stored and served object.

  // Shared quote read derivations — the session-gated routes AND the public-api
  // mirrored routes call these SAME closures, so parity (B-API-004) holds by
  // construction (approved-only, weighting, pagination semantics ride along).
  // Each returns { payload } or { error: [status, code, message] }.
  const quotesRandomPayload = ({ language = "english", group, seed }) => {
    // B-QT-001/B-QT-006(c,d): approved only — pending and refused are never served.
    const pool = quotes.read().quotes
      .filter((q) => quoteState(q) === "approved" && q.language === language)
      .filter((q) => group === undefined || serveQuote(q).group === Number(group));
    if (pool.length === 0) return { error: [404, "not_found", "no quotes"] };
    // B-QT-007: rating-weighted selection; ?seed= makes the pick reproducible
    // (same pool + weights + seed => same quote). Unseeded reads use Math.random.
    const rand = seed !== undefined && /^\d+$/.test(seed) ? seededRand(Number(seed)) : Math.random;
    return { payload: serveQuote(pool[weightedPickIndex(pool, rand)]) };
  };
  // B-QT-009 search/browse: approved only, optional language (exact) + q
  // (case-insensitive text substring); stable submission order; fixed page
  // size 50; page 0-based (documented delegation per the ambiguity-log).
  const quotesSearchPayload = ({ language, q, page }) => {
    let pageNum = 0;
    if (page !== undefined) {
      if (!/^\d+$/.test(page)) return { error: [422, "unprocessable", "page must be a non-negative integer"] };
      pageNum = Number(page);
    }
    const { quotes: page_, total } = searchQuotes(quotes.read().quotes, { language, q, page: pageNum });
    return { payload: { quotes: page_.map(serveQuote), page: pageNum, pageSize: QUOTE_PAGE_SIZE, total } };
  };
  const sendPayload = (res, out) =>
    out.error ? err(res, out.error[0], out.error[1], out.error[2]) : res.json(out.payload);

  app.get("/api/quotes/random", (req, res) => sendPayload(res, quotesRandomPayload(req.query)));
  app.get("/api/quotes", (req, res) => sendPayload(res, quotesSearchPayload(req.query)));

  // B-QT-008 favorites: own-data-only; add idempotent; list returns only
  // APPROVED quotes the user favorited (refused/pending filtered at read);
  // removing a favorite never deletes the quote.
  app.get("/api/quotes/favorites", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    const mine = favorites.read().favorites[a.uid] ?? [];
    const byId = new Map(quotes.read().quotes.map((q) => [q.id, q]));
    const list = mine.map((id) => byId.get(id)).filter((q) => q && quoteState(q) === "approved");
    res.json({ quotes: list.map(serveQuote) });
  });

  app.post("/api/quotes/favorites", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    // schemas/favorite-request.schema.json: exactly { quoteId: string 1..64 }
    const b = req.body ?? {};
    const extraKeys = Object.keys(b).filter((k) => k !== "quoteId");
    if (typeof b.quoteId !== "string" || b.quoteId.length < 1 || b.quoteId.length > 64 || extraKeys.length) {
      return err(res, 422, "unprocessable", "invalid favorite request");
    }
    const q = quotes.read().quotes.find((x) => x.id === b.quoteId);
    if (!q) return err(res, 404, "not_found", "quote not found");
    favorites.commit((d) => {
      const mine = d.favorites[a.uid] ?? (d.favorites[a.uid] = []);
      if (!mine.includes(q.id)) mine.push(q.id); // idempotent add
    });
    res.json({ ok: true });
  });

  app.delete("/api/quotes/favorites/:quoteId", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    favorites.commit((d) => {
      const mine = d.favorites[a.uid] ?? [];
      d.favorites[a.uid] = mine.filter((id) => id !== req.params.quoteId); // idempotent remove
    });
    res.json({ ok: true }); // the quote itself is untouched (B-QT-008)
  });

  app.post("/api/quotes", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    const { text, source, language } = req.body ?? {};
    if (typeof text !== "string" || text.length < 1 || text.length > 500 ||
        typeof source !== "string" || source.length < 1 || typeof language !== "string") {
      return err(res, 422, "unprocessable", "invalid quote");
    }
    const norm = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();
    const existing = quotes.read().quotes.find((q) => q.language === language && norm(q.text) === norm(text));
    if (existing) return res.json(serveQuote(existing)); // B-QT-003 idempotent (any state; no second write)
    const q = { id: randomUUID(), text, source, language, length: text.length,
                state: "pending", approved: false, ratings: {} }; // B-QT-006: tri-state persisted
    quotes.commit((d) => { d.quotes.push(q); });
    res.status(201).json(serveQuote(q));
  });

  // Tri-state moderation transitions (B-QT-006(b)): moderator-only, both
  // idempotent; optional moderationNote (<=500 chars) persisted as metadata.
  const moderate = (target) => (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    if (!a.user.moderator) return err(res, 403, "forbidden", "moderator only"); // B-QT-004/B-QT-006(b)
    const note = req.body?.moderationNote;
    if (note !== undefined && (typeof note !== "string" || note.length > 500)) {
      return err(res, 422, "unprocessable", "moderationNote: string <= 500 chars");
    }
    let found = null;
    quotes.commit((d) => {
      const q = d.quotes.find((x) => x.id === req.params.id);
      if (q) {
        q.state = target; // idempotent: re-applying the same state is a no-op
        q.approved = target === "approved"; // (a) consistency clause
        if (note !== undefined) q.moderationNote = note;
        found = q;
      }
    });
    if (!found) return err(res, 404, "not_found", "quote not found");
    res.json(serveQuote(found)); // refused quotes are PERSISTED with metadata (c), never served
  };
  app.post("/api/quotes/:id/approve", moderate("approved"));
  app.post("/api/quotes/:id/refuse", moderate("refused"));

  app.post("/api/quotes/:id/rate", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    const r = req.body?.rating;
    if (!Number.isInteger(r) || r < 1 || r > 5) return err(res, 422, "unprocessable", "rating 1..5");
    let out = null;
    quotes.commit((d) => {
      const q = d.quotes.find((x) => x.id === req.params.id);
      if (q) { q.ratings[a.uid] = r; out = q; } // B-QT-005 replace
    });
    if (!out) return err(res, 404, "not_found", "quote not found");
    const vals = Object.values(out.ratings);
    res.json({ rating: { average: vals.reduce((x, y) => x + y, 0) / vals.length, count: vals.length } });
  });

  // ---- test-results (v1.2.0) ----
  app.post("/api/results", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required"); // O-RES-003 auth first
    const event = req.body ?? {};
    const verrs = validateCompletedEvent(event);
    if (verrs.length) return err(res, 422, "unprocessable", verrs.join("; ")); // S-RES-001
    const spacingStats = keyStats(event.keySpacing);
    const durationStats = keyStats(event.keyDuration);
    const verdict = evaluate({ event, keySpacingStats: spacingStats,
                               keyDurationStats: durationStats, lbOptOut: !!a.user.lbOptOut });
    if (verdict.decision !== "admit") {
      return err(res, 422, "unprocessable", "rejected: " + verdict.reasons.join(",")); // B-RES-001
    }
    // B-RES-001 storage disposition (v1.2.0, orchestrator-ruled): zen is NOT
    // persisted even when admitted — the response carries the admission verdict
    // with a non-stored indicator; no record is written; history never contains
    // mode=zen. Delegated response shape (ambiguity-log: cosmetic): HTTP 200
    // { verdict, stored:false, anticheat } — the recorded anticheat decision is
    // echoed so the RVL monitorable projection holds on this route.
    if (event.mode === "zen") {
      return res.json({ verdict: verdict.decision, stored: false,
                        anticheat: { decision: verdict.decision, reasons: verdict.reasons } });
    }
    const d = results.read();
    const dup = d.results.find((r) => r.uid === a.uid && r.hash === event.hash && event.hash !== "");
    if (dup) return res.json(dup); // B-RES-002 idempotent
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
      // B-RES-003 exclusions (v1.2.0): bailedOut AND minThresholdFailed results
      // never become a PB (isPb stays false) and never demote the standing PB.
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
    res.status(201).json(stored);
  });

  // Shared results read derivations — the session-gated routes AND the
  // public-api mirrored routes call these SAME closures (B-API-004 parity by
  // construction; zen absence / minThresholdFailed / tag semantics ride along).
  const parseTagFilter = (t) => typeof t === "string" && t.length ? t.split(",").filter(Boolean) : [];
  // B-RES-006(c): optional tag filter — multi-tag = INTERSECTION.
  const historyPayload = (uid, tagFilter) => ({
    results: results.read().results
      .filter((r) => r.uid === uid)
      .filter((r) => matchesTagFilter(r, tagFilter))
      .sort((x, y) => y.timestamp - x.timestamp) // B-RES-005 newest first
      .map(({ hash, ...r }) => r),
  });
  const pbsPayload = (uid, tagFilter) => {
    const mine = results.read().results.filter((r) => r.uid === uid);
    if (tagFilter.length) {
      // B-RES-006(e): tag-scoped PB read — READ-TIME derivation, NEVER creates,
      // mutates, or demotes isPb flags (PB keying stays the global C7 tuple).
      return { pbs: scopedPbs(mine, tagFilter).map(({ hash, ...r }) => r) };
    }
    // Global PB read: the stored isPb flags (single authority). Flagged
    // (minThresholdFailed) and bailed results never carry isPb — excluded here.
    return { pbs: mine.filter((r) => r.isPb).map(({ hash, ...r }) => r) };
  };

  app.get("/api/results", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    res.json(historyPayload(a.uid, parseTagFilter(req.query.tags)));
  });

  app.get("/api/results/pbs", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    res.json(pbsPayload(a.uid, parseTagFilter(req.query.tags)));
  });

  // ---- result tags (B-RES-006, v1.2.0) ----
  // (a) CRUD — own tags only; names unique per user case-insensitively.
  app.get("/api/results/tags", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    res.json({ tags: tags.read().tags.filter((t) => t.uid === a.uid).map(serveTag) });
  });

  app.post("/api/results/tags", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    const name = req.body?.name;
    if (!isValidTagName(name)) return err(res, 422, "unprocessable", "tag name: string 1..64 chars");
    if (findTagByName(tags.read().tags, a.uid, name)) {
      return err(res, 409, "conflict", "tag name taken"); // case-insensitive uniqueness
    }
    const tag = { id: randomUUID(), uid: a.uid, name };
    tags.commit((d) => { d.tags.push(tag); });
    res.status(201).json(serveTag(tag));
  });

  app.patch("/api/results/tags/:id", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    const name = req.body?.name;
    if (!isValidTagName(name)) return err(res, 422, "unprocessable", "tag name: string 1..64 chars");
    if (!findTagById(tags.read().tags, a.uid, req.params.id)) {
      return err(res, 404, "not_found", "tag not found"); // unknown or foreign — indistinguishable
    }
    const clash = findTagByName(tags.read().tags, a.uid, name);
    if (clash && clash.id !== req.params.id) return err(res, 409, "conflict", "tag name taken");
    let out = null;
    tags.commit((d) => { const t = d.tags.find((x) => x.id === req.params.id && x.uid === a.uid); if (t) { t.name = name; out = t; } });
    res.json(serveTag(out));
  });

  // (d) delete-cascade: deleting a tag removes it from every result carrying
  // it; the results themselves are unaffected. Two stores => two logical
  // writes (test-results capability: max_writes_per_request 2).
  app.delete("/api/results/tags/:id", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    if (!findTagById(tags.read().tags, a.uid, req.params.id)) {
      return err(res, 404, "not_found", "tag not found");
    }
    tags.commit((d) => { d.tags = d.tags.filter((t) => !(t.id === req.params.id && t.uid === a.uid)); });
    results.commit((d) => {
      for (const r of d.results) {
        if (r.uid === a.uid && Array.isArray(r.tags) && r.tags.includes(req.params.id)) {
          r.tags = r.tags.filter((id) => id !== req.params.id);
        }
      }
    });
    res.json({ ok: true });
  });

  // (b) assignment — own stored results only; unknown/foreign tag or result
  // fails with the error envelope (404, indistinguishable). Assign idempotent.
  app.post("/api/results/:id/tags", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    const tagId = req.body?.tagId;
    if (typeof tagId !== "string" || tagId.length < 1 || tagId.length > 64) {
      return err(res, 422, "unprocessable", "tagId: string 1..64 chars");
    }
    if (!findTagById(tags.read().tags, a.uid, tagId)) return err(res, 404, "not_found", "tag not found");
    const target = results.read().results.find((r) => r.id === req.params.id && r.uid === a.uid);
    if (!target) return err(res, 404, "not_found", "result not found");
    if ((target.tags ?? []).length >= TAGS_PER_RESULT_MAX && !target.tags.includes(tagId)) {
      return err(res, 422, "unprocessable", `at most ${TAGS_PER_RESULT_MAX} tags per result`);
    }
    results.commit((d) => {
      const r = d.results.find((x) => x.id === target.id);
      r.tags = r.tags ?? [];
      if (!r.tags.includes(tagId)) r.tags.push(tagId);
    });
    const { hash, ...rest } = results.read().results.find((x) => x.id === target.id);
    res.json(rest);
  });

  app.delete("/api/results/:id/tags/:tagId", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    if (!findTagById(tags.read().tags, a.uid, req.params.tagId)) return err(res, 404, "not_found", "tag not found");
    const target = results.read().results.find((r) => r.id === req.params.id && r.uid === a.uid);
    if (!target) return err(res, 404, "not_found", "result not found");
    results.commit((d) => {
      const r = d.results.find((x) => x.id === target.id);
      r.tags = (r.tags ?? []).filter((id) => id !== req.params.tagId); // idempotent unassign
    });
    const { hash, ...rest } = results.read().results.find((x) => x.id === target.id);
    res.json(rest);
  });

  // ---- result-stats (v1.0.0, NEW bundle) ----
  // Read-only derivations over the requester's OWN stored results (S-STS-003:
  // auth before any computation); zero store writes per request (O-STS-001).
  // Formulas are the B-STS-002 documented recomputations (shared/resultStats.js).
  const ownResults = (uid) => results.read().results.filter((r) => r.uid === uid);
  // Shared stats derivations — session routes AND public-api mirrors (B-API-004).
  const statsPayloads = {
    aggregates: (uid) => computeAggregates(ownResults(uid)),
    pbs: (uid) => computePbTable(ownResults(uid)),
    activity: (uid) => computeActivity(ownResults(uid)),
    "wpm-series": (uid) => computeWpmSeries(ownResults(uid)),
  };
  for (const [name, derive] of Object.entries(statsPayloads)) {
    app.get("/api/stats/" + name, (req, res) => {
      const a = auth(req);
      if (!a) return err(res, 401, "unauthorized", "token required");
      res.json(derive(a.uid));
    });
  }

  // ---- leaderboards (v1.1.0) ----
  // Board key (S-LB-001): (mode=time, mode2 in {15,60}, language from the
  // wordlists registry, timeWindow in {alltime, daily}). Query params
  // (delegated surface): ?language=<registry id> (default english),
  // ?timeWindow=alltime|daily (default alltime), ?n (default 50, max 100).
  // Read-time recomputation (B-LB-003) — shared/leaderboards.js (isomorphic).
  app.get("/api/leaderboards/:mode2", (req, res) => {
    const mode2 = req.params.mode2;
    if (!BOARD_MODE2.includes(mode2)) return err(res, 404, "not_found", "no such board"); // S-LB-001
    const language = req.query.language ?? "english";
    if (!REGISTRY_IDS.has(language)) return err(res, 404, "not_found", "unknown language"); // S-LB-001/S-LB-002
    const timeWindow = req.query.timeWindow ?? "alltime";
    if (!TIME_WINDOWS.includes(timeWindow)) return err(res, 404, "not_found", "no such board");
    const now = Date.now(); // B-LB-005: daily window evaluated at read time (rolling 24h)
    const { entries } = computeBoard(results.read().results, { mode2, language, timeWindow, now });
    const n = Math.min(Number(req.query.n) || DEFAULT_TOP_N, MAX_TOP_N); // BQ-LB-02: parity both windows
    const a = auth(req);
    let requester = null;
    if (a) {
      const mine = entries.find((e) => e.uid === a.uid);
      if (mine) requester = { rank: mine.rank, entry: mine, percentile: mine.percentile }; // B-LB-004/006
    }
    res.json({ board: { mode: "time", mode2, language, timeWindow },
               entries: entries.slice(0, n), requester });
  });

  // ---- user-profile (v1.0.0, NEW bundle) ----
  // Compose-only (B-PRO-001): identity from user-account (read-only), pbs/
  // aggregates pass-through from the result-stats derivations above, xp = sum
  // of the sealed per-result xp fields (leaderboards xpOf), streaks ONLY from
  // the activity series (B-PRO-002), level recomputed per read (B-PRO-003).
  // This bundle persists ONLY the own-editable fields (data/profile.json).
  const profilePayload = (uid) => composeProfile({
    user: accounts.read().users[uid],
    mine: ownResults(uid),
    stored: profiles.read().profiles[uid],
    now: NOW(), // injected clock — B-PRO-002 streak aliveness
  });

  // Own-profile read (authenticated; unaffected by isPublic — B-PRO-005).
  app.get("/api/profile", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    res.json(profilePayload(a.uid));
  });

  // Strict own-field edits (S-PRO-003 / B-PRO-004): closed shape, all-or-nothing
  // (an invalid update writes ZERO fields), exactly one store write per request.
  app.patch("/api/profile", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    const v = validateProfileUpdate(req.body);
    if (!v.ok) return err(res, 422, "unprocessable", v.errors.join("; "));
    profiles.commit((d) => { d.profiles[a.uid] = { ...(d.profiles[a.uid] ?? {}), ...v.value }; });
    res.json(profilePayload(a.uid));
  });

  // Public read by name (B-PRO-005): returns ONLY the public shape; an unknown
  // name OR a profile with isPublic=false returns the IDENTICAL 404-shaped
  // ErrorEnvelope (non-public indistinguishable from absent, O-RES-004
  // precedent). Name lookup is case-insensitive, mirroring account lookup.
  app.get("/api/profile/:username", (req, res) => {
    const entry = Object.entries(accounts.read().users)
      .find(([, u]) => u.name.toLowerCase() === String(req.params.username).toLowerCase());
    if (!entry) return err(res, 404, "not_found", "profile not found");
    if (!isPublicOf(profiles.read().profiles[entry[0]])) {
      return err(res, 404, "not_found", "profile not found"); // identical envelope
    }
    res.json(profilePayload(entry[0]));
  });

  // ---- public-api (v1.0.0, NEW bundle) ----
  // ApeKey lifecycle (session-gated management; the API surface itself is
  // key-gated only) + the mirrored read surface. Rate-limit counters are
  // in-memory fixed windows (O-API-001: counters are not store writes),
  // deterministic under the injected clock (B-API-005/O-API-003).
  const limiter = createRateLimiter({ windowMs: RATE_WINDOW_MS, keyLimit: RATE_KEY_LIMIT, ipLimit: RATE_IP_LIMIT });

  // B-API-001: generate mints pdd_ + 128-bit hex; the PLAINTEXT is returned
  // exactly once (this response); at rest only salt + salted hash persist.
  app.post("/api/apekeys", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    const v = validateApeKeyCreate(req.body); // S-API-001: unknown scopes fail-closed
    if (!v.ok) return err(res, 422, "unprocessable", v.errors.join("; "));
    const { plaintext, salt, hash } = mintApeKey();
    const rec = { id: randomUUID(), uid: a.uid, name: v.value.name, scopes: v.value.scopes,
                  createdAt: NOW(), enabled: true, salt, hash };
    apekeys.commit((d) => { d.apekeys.push(rec); }); // one write (capability)
    res.status(201).json({ key: plaintext, apekey: serveApeKey(rec) }); // show-once
  });

  // B-API-001: list returns METADATA only — key material never leaves the store.
  app.get("/api/apekeys", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    res.json({ apekeys: apekeys.read().apekeys.filter((k) => k.uid === a.uid).map(serveApeKey) });
  });

  // B-API-001: revoke is idempotent and fail-closed — a revoked key never
  // authenticates again. Unknown or foreign ids are indistinguishable (404).
  app.delete("/api/apekeys/:id", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    let out = null;
    apekeys.commit((d) => {
      const k = d.apekeys.find((x) => x.id === req.params.id && x.uid === a.uid);
      if (k) { k.enabled = false; out = k; } // idempotent: re-revoke is a no-op
    });
    if (!out) return err(res, 404, "not_found", "apekey not found");
    res.json(serveApeKey(out));
  });

  // Key authentication for the /api/public surface. B-API-002 domain
  // separation: session tokens presented here never authenticate (they are not
  // salted-hash key material), and ApeKeys presented on session-gated routes
  // fail verifyToken — neither domain accepts the other's credential.
  // Check order (documented): per-IP window (every surface request counts) →
  // key authentication (401) → per-key window (429) → scope (403, per endpoint).
  const clientIp = (req) =>
    (typeof req.headers["x-forwarded-for"] === "string" && req.headers["x-forwarded-for"].split(",")[0].trim()) ||
    req.socket?.remoteAddress || "unknown";
  const rateLimited = (res, hit) => {
    const retryAfterSec = Math.ceil(hit.retryAfterMs / 1000);
    // Retry metadata rides standard headers; the body stays the sealed
    // ErrorEnvelope (closed schema — no extra keys permitted), code rate_limited.
    res.set("Retry-After", String(retryAfterSec));
    res.set("X-RateLimit-Limit", String(hit.limit));
    res.set("X-RateLimit-Remaining", "0");
    res.set("X-RateLimit-Reset", String(Math.ceil(hit.resetMs / 1000)));
    return err(res, 429, "rate_limited", `rate limit exceeded; retry after ${retryAfterSec}s`);
  };
  const apiAuth = (req, res) => {
    const ipHit = limiter.consume("ip", clientIp(req), NOW()); // O-API-003
    if (!ipHit.allowed) { rateLimited(res, ipHit); return null; }
    const h = req.headers.authorization || "";
    const presented = h.startsWith("Bearer ") ? h.slice(7) : null;
    const rec = presented && authenticateApeKey(apekeys.read().apekeys, presented);
    if (!rec) { err(res, 401, "unauthorized", "valid ApeKey required"); return null; }
    const keyHit = limiter.consume("key", rec.id, NOW()); // B-API-005
    if (!keyHit.allowed) { rateLimited(res, keyHit); return null; }
    return rec;
  };
  // B-API-003 fail-closed scope enforcement: out-of-scope => 403 envelope; a
  // key with zero matching scopes accesses nothing.
  const publicRead = (scope, handler) => (req, res) => {
    const rec = apiAuth(req, res);
    if (!rec) return;
    if (!rec.scopes.includes(scope)) return err(res, 403, "forbidden", "scope " + scope + " required");
    return handler(req, res, rec);
  };

  // Mirrored read surface (B-API-004): the SAME derivation closures as the
  // source handshakes — recompute-equal by construction (exclusion rules ride
  // along: zen absence, minThresholdFailed, bailed, approved-only quotes).
  app.get("/api/public/results", publicRead("results:read", (req, res, rec) =>
    res.json(historyPayload(rec.uid, parseTagFilter(req.query.tags)))));
  app.get("/api/public/results/pbs", publicRead("results:read", (req, res, rec) =>
    res.json(pbsPayload(rec.uid, parseTagFilter(req.query.tags)))));
  for (const [name, derive] of Object.entries(statsPayloads)) {
    app.get("/api/public/stats/" + name, publicRead("stats:read", (req, res, rec) => res.json(derive(rec.uid))));
  }
  app.get("/api/public/profile", publicRead("profile:read", (req, res, rec) =>
    res.json(profilePayload(rec.uid))));
  app.get("/api/public/quotes/random", publicRead("quotes:read", (req, res) =>
    sendPayload(res, quotesRandomPayload(req.query))));
  app.get("/api/public/quotes", publicRead("quotes:read", (req, res) =>
    sendPayload(res, quotesSearchPayload(req.query))));

  // Unknown routes are protocol-visible failures: they must also use the
  // ErrorEnvelope (found via manual UI testing — favicon 404 leaked express HTML).
  app.get("/favicon.ico", (req, res) => res.status(204).end());
  app.use((req, res) => err(res, 404, "not_found", "no such route"));

  return app;
}

function seedQuotes() {
  // v1.1.0: tri-state persisted (B-QT-006). Pre-v1.1.0 stored quotes without a
  // state field derive it from the legacy boolean at serve time (quoteState()).
  const mk = (id, text, source) => ({ id, text, source, language: "english",
    length: text.length, state: "approved", approved: true, ratings: {} });
  return [
    mk("q1", "The quick brown fox jumps over the lazy dog near the river bank.", "proverb"),
    mk("q2", "Practice does not make perfect. Only perfect practice makes perfect.", "Vince Lombardi"),
    mk("q3", "It is not the strongest of the species that survives, but the one most responsive to change.", "Charles Darwin"),
    mk("q4", "The only way to do great work is to love what you do. If you have not found it yet, keep looking.", "Steve Jobs"),
  ];
}
