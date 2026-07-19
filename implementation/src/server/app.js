// Express application wiring all protocol implementations.
// Route surface (protocol-visible): account, config, quotes, results, leaderboards.
import express from "express";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./store.js";
import { hashPassword, verifyPassword, issueToken, verifyToken, revokeToken } from "./auth.js";
import { validateCompletedEvent, validateConfigUpdate, CONFIG_DEFAULTS, keyStats } from "./validate.js";
import { evaluate } from "../anticheat/index.js";
import { makeRvl } from "./rvl.js";

const NAME_RE = /^[a-zA-Z0-9_-]{3,16}$/;

export function createApp({ dataDir, implVersion = "unknown", ledgerDir = null, heartbeatMs = 15000 }) {
  const accounts = new Store(`${dataDir}/accounts.json`, { users: {}, tokens: {} });
  const configs = new Store(`${dataDir}/configs.json`, {});
  const results = new Store(`${dataDir}/results.json`, { results: [] });
  const quotes = new Store(`${dataDir}/quotes.json`, { quotes: seedQuotes() });

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

  // ---- quote-library ----
  const QUOTE_GROUPS = [[1, 100], [101, 300], [301, 600], [601, Infinity]]; // B-QT-002
  const groupOf = (len) => QUOTE_GROUPS.findIndex(([lo, hi]) => len >= lo && len <= hi);
  // wire shape: expose rating summary {average,count}; never leak the raw ratings map (S-QT-001)
  const withGroup = (q) => {
    const { ratings, ...rest } = q;
    const vals = Object.values(ratings ?? {});
    return { ...rest, group: groupOf(q.length),
             ...(vals.length ? { rating: { average: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length } } : {}) };
  };

  app.get("/api/quotes/random", (req, res) => {
    const { language = "english", group } = req.query;
    const pool = quotes.read().quotes
      .filter((q) => q.approved && q.language === language)
      .map(withGroup)
      .filter((q) => group === undefined || q.group === Number(group)); // B-QT-001
    if (pool.length === 0) return err(res, 404, "not_found", "no quotes");
    res.json(pool[Math.floor(Math.random() * pool.length)]);
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
    if (existing) return res.json(withGroup(existing)); // B-QT-003 idempotent
    const q = { id: randomUUID(), text, source, language, length: text.length,
                approved: false, ratings: {} };
    quotes.commit((d) => { d.quotes.push(q); });
    res.status(201).json(withGroup(q));
  });

  app.post("/api/quotes/:id/approve", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    if (!a.user.moderator) return err(res, 403, "forbidden", "moderator only"); // B-QT-004
    let found = null;
    quotes.commit((d) => { const q = d.quotes.find((x) => x.id === req.params.id); if (q) { q.approved = true; found = q; } });
    if (!found) return err(res, 404, "not_found", "quote not found");
    res.json(withGroup(found));
  });

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

  // ---- test-results ----
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
    const d = results.read();
    const dup = d.results.find((r) => r.uid === a.uid && r.hash === event.hash && event.hash !== "");
    if (dup) return res.json(dup); // B-RES-002 idempotent
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
        if (stored.wpm > best) {                    // B-RES-003 strict improvement
          for (const r of dd.results) if (sameTuple(r)) r.isPb = false;
          stored.isPb = true;
        }
      }
    });
    res.status(201).json(stored);
  });

  app.get("/api/results", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    const mine = results.read().results
      .filter((r) => r.uid === a.uid)
      .sort((x, y) => y.timestamp - x.timestamp) // B-RES-005 newest first
      .map(({ hash, ...r }) => r);
    res.json({ results: mine });
  });

  app.get("/api/results/pbs", (req, res) => {
    const a = auth(req);
    if (!a) return err(res, 401, "unauthorized", "token required");
    res.json({ pbs: results.read().results.filter((r) => r.uid === a.uid && r.isPb) });
  });

  // ---- leaderboards ----
  app.get("/api/leaderboards/:mode2", (req, res) => {
    const mode2 = req.params.mode2;
    if (!["15", "60"].includes(mode2)) return err(res, 404, "not_found", "no such board"); // S-LB-001
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
    const n = Math.min(Number(req.query.n) || 50, 100);
    const a = auth(req);
    let requester = null;
    if (a) {
      const mine = entries.find((e) => e.uid === a.uid);
      if (mine) requester = { rank: mine.rank, entry: mine }; // B-LB-004
    }
    res.json({ board: { mode: "time", mode2, language: "english" },
               entries: entries.slice(0, n), requester });
  });

  // Unknown routes are protocol-visible failures: they must also use the
  // ErrorEnvelope (found via manual UI testing — favicon 404 leaked express HTML).
  app.get("/favicon.ico", (req, res) => res.status(204).end());
  app.use((req, res) => err(res, 404, "not_found", "no such route"));

  return app;
}

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
