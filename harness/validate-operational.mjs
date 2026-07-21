// PDD Validator Loop — Layer 3: OPERATIONAL (dependency scan, egress monitor,
// resource budgets, background-work detection). Emits harness/out/operational.json.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import { writeJson } from "./evidence.mjs";
import { bootApp, makeEvent } from "./boot.mjs";
import { SCOPES, RATE_KEY_LIMIT, RATE_IP_LIMIT } from "../implementation/src/shared/apekeys.js";
import { evaluate } from "../implementation/src/anticheat/index.js";
import { TypingSession } from "../implementation/src/engine/session.js";
import { generateWords } from "../implementation/src/engine/words.js";
import { Store } from "../implementation/src/server/store.js";
import { hashPassword, verifyPassword } from "../implementation/src/server/auth.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const rec = (id, ok, evidence = "") =>
  results.push({ invariant_id: id, layer: "operational", outcome: ok ? "pass" : "fail", evidence: String(evidence).slice(0, 300) });

// ---------- 1. dependency scan ----------
{
  const implSrc = join(root, "implementation", "src");
  const imports = new Map(); // file -> [specifiers]
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n.endsWith(".js")) {
        const src = readFileSync(p, "utf8");
        const specs = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1])
          .filter((s) => !s.startsWith(".") && !s.startsWith("/"));
        imports.set(p.replace(implSrc, ""), specs);
      }
    }
  };
  walk(implSrc);
  // ownership: engine/+shared/ -> typing-test-engine & result-anticheat (allow: []);
  // server/ -> API protocols (allow: express, node:crypto, node:fs, node:path, node:url)
  const CORE = /^node:/;
  let violations = [];
  for (const [f, specs] of imports) {
    for (const s of specs) {
      if (f.startsWith("/engine") || f.startsWith("/shared") || f.startsWith("/anticheat")) {
        if (!CORE.test(s)) violations.push(`${f}: ${s} (pure component must have zero deps)`);
      } else if (f.startsWith("/server")) {
        const allowed = ["express", "node:crypto", "node:fs", "node:path", "node:url"];
        if (!allowed.includes(s)) violations.push(`${f}: ${s} not in allowlist`);
      }
    }
  }
  rec("O-ENG-003", violations.filter((v) => v.includes("/engine") || v.includes("/shared")).length === 0,
      violations.filter((v) => v.includes("/engine")).join("; ") || "engine has zero runtime deps");
  rec("O-AC-001", violations.filter((v) => v.includes("/anticheat")).length === 0,
      violations.filter((v) => v.includes("/anticheat")).join("; ") || "anticheat pure");
  rec("O-DEP-SCAN", violations.length === 0, violations.join("; ") || "all imports within capability manifests");
}

// ---------- 2. egress monitor (O-ENG-001, O-AC-001) ----------
{
  let attempts = [];
  const trap = (name) => (...args) => { attempts.push(name); throw new Error("egress blocked: " + name); };
  const orig = { get: http.get, req: http.request, hget: https.get, hreq: https.request,
                 lookup: dns.lookup, fetch: globalThis.fetch };
  http.get = trap("http.get"); http.request = trap("http.request");
  https.get = trap("https.get"); https.request = trap("https.request");
  dns.lookup = trap("dns.lookup"); globalThis.fetch = trap("fetch");
  try {
    const s = new TypingSession({ mode: "words", mode2: "3", words: generateWords(3, 5) });
    let t = 0;
    for (const w of s.words) { for (const ch of w) s.feed({ t: t += 90, type: "char", value: ch }); s.feed({ t: t += 90, type: "space" }); }
    s.completionEvent({ timestamp: 1 });
    evaluate({ event: makeEvent(), keySpacingStats: { average: 90, sd: 15 },
               keyDurationStats: { average: 70, sd: 8 }, lbOptOut: false });
    const st = new Store(join(root, "harness", "out", "egress-test.json"), {});
    st.commit((d) => { d.x = 1; });
    const pw = hashPassword("password123"); verifyPassword("password123", pw);
  } catch (e) {
    if (String(e.message).startsWith("egress blocked")) attempts.push("thrown:" + e.message);
  } finally {
    http.get = orig.get; http.request = orig.req; https.get = orig.hget; https.request = orig.hreq;
    dns.lookup = orig.lookup; globalThis.fetch = orig.fetch;
  }
  rec("O-ENG-001", attempts.length === 0, attempts.join(";") || "zero egress during engine session");
  rec("O-AC-001", attempts.length === 0, attempts.join(";") || "zero egress during evaluation");
}

// ---------- 3. resource budgets ----------
const p95 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length * 0.95)] ?? 0; };
{
  // anticheat eval p95 <= 5ms (O-AC-002)
  const times = [];
  const req = { event: makeEvent(), keySpacingStats: { average: 90, sd: 15 },
                keyDurationStats: { average: 70, sd: 8 }, lbOptOut: false };
  for (let i = 0; i < 5000; i++) {
    const t0 = process.hrtime.bigint();
    evaluate(req);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  rec("O-AC-002", p95(times) <= 5, `p95=${p95(times).toFixed(3)}ms over 5000 evals`);
}
{
  // keystroke handling p95 <= 5ms per event (O-ENG-002) — v2.0.0 engine path with
  // the mode-matrix gates exercised (letter-stop check + lazy compare per feed;
  // pre-existing v1 coverage gap closed alongside the v2 validator extension)
  const s = new TypingSession({ mode: "words", mode2: "6000", words: generateWords(6000, 11),
                                config: { stopOnError: "letter", strictSpace: true, lazyMode: true } });
  const samples = [];
  let t = 1000;
  outer:
  for (const w of s.words) {
    for (const ch of w) {
      const t0 = process.hrtime.bigint();
      s.feed({ t: t += 37, type: "char", value: ch });
      samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
      if (samples.length >= 5000) break outer;
    }
    s.feed({ t: t += 37, type: "space" });
  }
  rec("O-ENG-002", p95(samples) <= 5,
      `p95=${p95(samples).toFixed(4)}ms over ${samples.length} keystroke feeds (v2 gates on)`);
}
{
  const app = await bootApp();
  try {
    const token = await app.signup("perf_user");
    // config GET p95 <= 50ms (O-CFG-002)
    const get = [];
    for (let i = 0; i < 100; i++) {
      const t0 = process.hrtime.bigint();
      await app.call("/api/config", { token });
      get.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    rec("O-CFG-002", p95(get) <= 50, `p95=${p95(get).toFixed(2)}ms over 100 reqs`);
    // results POST p95 <= 100ms (O-RES-002)
    const post = [];
    for (let i = 0; i < 50; i++) {
      const t0 = process.hrtime.bigint();
      await app.call("/api/results", { method: "POST", token, body: makeEvent() });
      post.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    rec("O-RES-002", p95(post) <= 100, `p95=${p95(post).toFixed(2)}ms over 50 reqs`);
    // leaderboard p95 <= 100ms (O-LB-001)
    const lb = [];
    for (let i = 0; i < 50; i++) {
      const t0 = process.hrtime.bigint();
      await app.call("/api/leaderboards/15");
      lb.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    rec("O-LB-001", p95(lb) <= 100, `p95=${p95(lb).toFixed(2)}ms over 50 reqs`);
    // theme-catalog reads p95 <= 50ms (O-THM-002)
    const thmT = [];
    for (let i = 0; i < 100; i++) {
      const t0 = process.hrtime.bigint();
      await app.call(i % 2 ? "/api/themes" : "/api/themes/serika_dark");
      thmT.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    rec("O-THM-002", p95(thmT) <= 50, `p95=${p95(thmT).toFixed(2)}ms over 100 reqs`);
    // O-THM-001: catalog reads need no authentication and perform zero store
    // writes (served from bundled data assets; data dir untouched by reads).
    {
      const before = readdirSync(app.dataDir).map((f) => [f, statSync(join(app.dataDir, f)).mtimeMs]);
      const anon1 = await app.call("/api/themes");
      const anon2 = await app.call("/api/themes/dracula");
      const anon404 = await app.call("/api/themes/nope");
      const after = readdirSync(app.dataDir).map((f) => [f, statSync(join(app.dataDir, f)).mtimeMs]);
      rec("O-THM-001", anon1.status === 200 && anon2.status === 200 && anon404.status === 404 &&
          JSON.stringify(before) === JSON.stringify(after),
          `unauthenticated reads ok (${anon1.status}/${anon2.status}/${anon404.status}); data dir unchanged (${before.length} files)`);
    }
  } finally { app.close(); }
}

// ---------- 3b. O-THM-003: static charter bands over every SERVED theme --------
// Pure color math (WCAG luminance / rgb->HSL) computed harness-side from the
// served payloads — INDEPENDENT of the implementation's own admission check
// (protocols/ui-presentation/validators/lib/color.mjs is the validator copy).
{
  const { parseColor, luminance, contrast, rgbToHsl, maxChannelDelta } =
    await import("../protocols/ui-presentation/validators/lib/color.mjs");
  const app = await bootApp();
  try {
    const list = await app.call("/api/themes");
    const fails = [];
    const RED = (h) => (h >= 0 && h <= 15) || (h >= 340 && h <= 360);
    for (const { name } of list.body?.themes ?? []) {
      const one = await app.call("/api/themes/" + encodeURIComponent(name));
      const tk = one.body?.tokens ?? {};
      const p = (k) => parseColor(tk[k] ?? "");
      const bg = p("--bg"), text = p("--text"), err = p("--error"), ext = p("--error-extra"),
            car = p("--caret"), sub = p("--sub");
      if (!(bg && text && err && ext && car && sub)) { fails.push(name + ":unparseable"); continue; }
      if (contrast(text, bg) < 4.5) fails.push(`${name}:text/bg=${contrast(text, bg).toFixed(2)}`);
      if (contrast(err, bg) < 3.0) fails.push(`${name}:error/bg=${contrast(err, bg).toFixed(2)}`);
      if (contrast(car, bg) < 3.0) fails.push(`${name}:caret/bg=${contrast(car, bg).toFixed(2)}`);
      if (luminance(bg) > 0.2) fails.push(`${name}:L(bg)=${luminance(bg).toFixed(3)}`);
      if (luminance(text) <= luminance(bg)) fails.push(`${name}:L(text)<=L(bg)`);
      for (const [k, c] of [["error", err], ["error-extra", ext]]) {
        const { h, s } = rgbToHsl(c);
        if (!RED(h) || s < 0.45) fails.push(`${name}:${k} h=${h.toFixed(1)} s=${s.toFixed(3)}`);
      }
      const states = { untyped: sub, correct: text, incorrect: err, extra: ext };
      const nn = Object.keys(states);
      for (let i = 0; i < nn.length; i++) for (let j = i + 1; j < nn.length; j++) {
        const d = maxChannelDelta(states[nn[i]], states[nn[j]]);
        if (d < 32) fails.push(`${name}:${nn[i]}~${nn[j]}=${d}`);
      }
    }
    rec("O-THM-003", fails.length === 0 && (list.body?.themes ?? []).length >= 1,
        fails.slice(0, 4).join("; ") || `all ${(list.body?.themes ?? []).length} served themes pass static charter bands`);
  } finally { app.close(); }
}

// ---------- 3c. wave-2 bundles: static-asset posture, read-only stats,
// write budgets, and read latencies ----------
{
  const app = await bootApp();
  try {
    const port = Number(app.base.split(":").pop());
    const dirSnap = () => Object.fromEntries(readdirSync(app.dataDir).map((f) => [f, statSync(join(app.dataDir, f)).mtimeMs]));
    const changed = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]);
    const tW = await app.signup("w2ops");
    await app.call("/api/results", { method: "POST", token: tW, body: makeEvent({ wpm: 77 }) });

    // O-WL-002: wordlist asset read p95 <= 50ms
    const wlPaths = ["/wordlists/registry.json", "/wordlists/english.json", "/wordlists/spanish.json"];
    const wlTimes = [];
    for (let i = 0; i < 120; i++) {
      const t0 = process.hrtime.bigint();
      await app.call(wlPaths[i % wlPaths.length]);
      wlTimes.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    rec("O-WL-002", p95(wlTimes) <= 50, `p95=${p95(wlTimes).toFixed(2)}ms over 120 asset reads`);

    // O-STS-002: stats read p95 <= 100ms (all four handshakes, round-robin)
    const stRoutes = ["aggregates", "pbs", "wpm-series", "activity"];
    const stTimes = [];
    for (let i = 0; i < 100; i++) {
      const t0 = process.hrtime.bigint();
      await app.call("/api/stats/" + stRoutes[i % 4], { token: tW });
      stTimes.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    rec("O-STS-002", p95(stTimes) <= 100, `p95=${p95(stTimes).toFixed(2)}ms over 100 stats reads`);

    // O-QT-002: quote random fetch p95 <= 50ms
    const qtTimes = [];
    for (let i = 0; i < 100; i++) {
      const t0 = process.hrtime.bigint();
      await app.call("/api/quotes/random");
      qtTimes.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    rec("O-QT-002", p95(qtTimes) <= 50, `p95=${p95(qtTimes).toFixed(2)}ms over 100 random fetches`);

    // O-WL-001 / O-STS-001 / O-LB-001 (zero-writes halves): data dir untouched
    // by reads of the static catalog, the stats handshakes, and the boards.
    {
      const before = dirSnap();
      for (const p of wlPaths) await app.call(p);
      for (const r of stRoutes) await app.call("/api/stats/" + r, { token: tW });
      await app.call("/api/leaderboards/15");
      await app.call("/api/leaderboards/60?timeWindow=daily");
      const after = dirSnap();
      rec("O-WL-001", changed(before, after).length === 0,
          `wordlist reads: zero store writes (${Object.keys(before).length} store files unchanged)`);
      rec("O-STS-001", changed(before, after).length === 0, "stats reads: zero store writes, in-process derivations");
      rec("O-LB-001", changed(before, after).length === 0, "board reads: zero store writes (read-time recomputation)");
    }

    // O-QT-001 (write-budget half): each mutating quote request performs AT
    // MOST one store write — observed as exactly one changed store file.
    {
      const one = async (label, fn, expectFile) => {
        const before = dirSnap();
        await fn();
        const ch = changed(before, dirSnap());
        return ch.length <= 1 && (ch.length === 0 || ch[0] === expectFile);
      };
      const sub = await one("submit", () => app.call("/api/quotes", { method: "POST", token: tW,
        body: { text: "Ops write-budget specimen " + Math.random(), source: "harness", language: "english" } }), "quotes.json");
      const qid = (await app.call("/api/quotes")).body.quotes.find((q) => q.source === "harness")?.id
                  ?? (await app.call("/api/quotes")).body.quotes[0].id;
      const fav = await one("favorite", () => app.call("/api/quotes/favorites", { method: "POST", token: tW, body: { quoteId: qid } }), "favorites.json");
      const rate = await one("rate", () => app.call(`/api/quotes/${qid}/rate`, { method: "POST", token: tW, body: { rating: 4 } }), "quotes.json");
      const unfav = await one("unfavorite", () => app.call(`/api/quotes/favorites/${qid}`, { method: "DELETE", token: tW }), "favorites.json");
      rec("O-QT-001", sub && fav && rate && unfav,
          `submit/favorite/rate/unfavorite each <=1 store write (submit:${sub} fav:${fav} rate:${rate} unfav:${unfav})`);
    }

    // Egress halves (O-WL-001/O-STS-001/O-QT-001/O-LB-001): trap every outbound
    // API in-process, then read over a RAW SOCKET client (net is not trapped) —
    // any server-side egress attempt during the reads would fire the trap.
    {
      const attempts = [];
      const trap = (name) => (...a) => { attempts.push(name); throw new Error("egress blocked: " + name); };
      const orig = { get: http.get, req: http.request, hget: https.get, hreq: https.request,
                     lookup: dns.lookup, fetch: globalThis.fetch };
      http.get = trap("http.get"); http.request = trap("http.request");
      https.get = trap("https.get"); https.request = trap("https.request");
      dns.lookup = trap("dns.lookup"); globalThis.fetch = trap("fetch");
      const rawGet = (path, headers = "") => new Promise((resolve, reject) => {
        const sock = net.connect(port, "127.0.0.1", () =>
          sock.write(`GET ${path} HTTP/1.0\r\nHost: 127.0.0.1\r\n${headers}\r\n`));
        let buf = "";
        sock.on("data", (d) => { buf += d; });
        sock.on("end", () => resolve(buf));
        sock.on("error", reject);
      });
      try {
        const reads = [
          await rawGet("/wordlists/registry.json"),
          await rawGet("/wordlists/english.json"),
          await rawGet("/api/stats/aggregates", `authorization: Bearer ${tW}\r\n`),
          await rawGet("/api/quotes/random"),
          await rawGet("/api/leaderboards/15"),
        ];
        const allOk = reads.every((r) => r.startsWith("HTTP/1.1 200"));
        rec("O-WL-001", allOk && attempts.length === 0,
            `zero outbound network during wordlist/stats/quote/board reads (${attempts.join(";") || "no attempts"})`);
      } finally {
        http.get = orig.get; http.request = orig.req; https.get = orig.hget; https.request = orig.hreq;
        dns.lookup = orig.lookup; globalThis.fetch = orig.fetch;
      }
    }
  } finally { app.close(); }
}

// ---------- 3d. wave-3 bundles: profile compose posture, API read budgets,
// per-IP rate dimension ----------
{
  const app = await bootApp();
  try {
    const port = Number(app.base.split(":").pop());
    const dirSnap = () => Object.fromEntries(readdirSync(app.dataDir).map((f) => [f, statSync(join(app.dataDir, f)).mtimeMs]));
    const changed = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]);
    const tP = await app.signup("w3ops");
    await app.call("/api/results", { method: "POST", token: tP, body: makeEvent({ wpm: 66 }) });

    // O-PRO-002: profile read p95 <= 100ms (composition over per-user sources)
    const prTimes = [];
    for (let i = 0; i < 100; i++) {
      const t0 = process.hrtime.bigint();
      await app.call("/api/profile", { token: tP });
      prTimes.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    rec("O-PRO-002", p95(prTimes) <= 100, `p95=${p95(prTimes).toFixed(2)}ms over 100 composed profile reads`);

    // O-PRO-001: profile reads write nothing; an edit writes ONLY profile.json
    {
      const before = dirSnap();
      await app.call("/api/profile", { token: tP });
      await app.call("/api/profile/w3ops");
      const afterReads = dirSnap();
      const readWrites = changed(before, afterReads);
      const b2 = dirSnap();
      await app.call("/api/profile", { method: "PATCH", token: tP, body: { bio: "ops probe" } });
      const editWrites = changed(b2, dirSnap());
      rec("O-PRO-001", readWrites.length === 0 && editWrites.length === 1 && editWrites[0] === "profile.json",
          `reads: 0 writes; edit: writes ${editWrites.join(",") || "none"} (confined to own-profile fields file)`);
    }

    // O-API-002: API read p95 <= 150ms (parity surface + auth + rate-limit
    // overhead). Rate budgets: 4 keys x 25 reads, alternating 2 source IPs.
    const keys = [];
    for (let i = 0; i < 4; i++) {
      keys.push((await app.call("/api/apekeys", { method: "POST", token: tP, body: { name: "lat" + i, scopes: SCOPES } })).body.key);
    }
    const apiTimes = [];
    for (let i = 0; i < 100; i++) {
      const t0 = process.hrtime.bigint();
      await app.call("/api/public/results", { token: keys[i % 4], headers: { "x-forwarded-for": i % 2 ? "10.11.0.1" : "10.11.0.2" } });
      apiTimes.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    rec("O-API-002", p95(apiTimes) <= 150, `p95=${p95(apiTimes).toFixed(2)}ms over 100 API reads (4 keys, 2 IPs)`);

    // O-API-001: API reads write nothing (counters are in-memory); ApeKey
    // management writes are confined to apekeys.json; zero outbound network.
    {
      const k5 = (await app.call("/api/apekeys", { method: "POST", token: tP, body: { name: "confine", scopes: SCOPES } })).body;
      const before = dirSnap();
      await app.call("/api/public/profile", { token: k5.key, headers: { "x-forwarded-for": "10.11.1.1" } });
      await app.call("/api/public/stats/aggregates", { token: k5.key, headers: { "x-forwarded-for": "10.11.1.1" } });
      const readWrites = changed(before, dirSnap());
      const b2 = dirSnap();
      await app.call(`/api/apekeys/${k5.apekey.id}`, { method: "DELETE", token: tP });
      const mgmtWrites = changed(b2, dirSnap());
      // egress trap + raw-socket API reads (same pattern as 3c). The key is
      // minted BEFORE the trap (app.call rides the trapped fetch).
      const k6 = (await app.call("/api/apekeys", { method: "POST", token: tP, body: { name: "egress", scopes: SCOPES } })).body.key;
      const attempts = [];
      const trap = (name) => (...a) => { attempts.push(name); throw new Error("egress blocked: " + name); };
      const orig = { get: http.get, req: http.request, hget: https.get, hreq: https.request,
                     lookup: dns.lookup, fetch: globalThis.fetch };
      http.get = trap("http.get"); http.request = trap("http.request");
      https.get = trap("https.get"); https.request = trap("https.request");
      dns.lookup = trap("dns.lookup"); globalThis.fetch = trap("fetch");
      const rawGet = (path, headers = "") => new Promise((resolve, reject) => {
        const sock = net.connect(port, "127.0.0.1", () =>
          sock.write(`GET ${path} HTTP/1.0\r\nHost: 127.0.0.1\r\n${headers}\r\n`));
        let buf = "";
        sock.on("data", (d) => { buf += d; });
        sock.on("end", () => resolve(buf));
        sock.on("error", reject);
      });
      let rawOk = false;
      try {
        const reads = [await rawGet("/api/public/results", `authorization: Bearer ${k6}\r\nx-forwarded-for: 10.11.2.1\r\n`)];
        rawOk = reads.every((r) => r.startsWith("HTTP/1.1 200"));
      } finally {
        http.get = orig.get; http.request = orig.req; https.get = orig.hget; https.request = orig.hreq;
        dns.lookup = orig.lookup; globalThis.fetch = orig.fetch;
      }
      rec("O-API-001", readWrites.length === 0 && mgmtWrites.length === 1 && mgmtWrites[0] === "apekeys.json" &&
          rawOk && attempts.length === 0,
          `API reads: 0 store writes; key revoke writes ${mgmtWrites.join(",") || "none"}; egress attempts: ${attempts.length}`);
    }
  } finally { app.close(); }
}

// O-API-003: per-IP dimension trips at the documented ceiling (>= per-key),
// same 429 envelope + retry metadata — deterministic under the injected clock.
{
  const T0 = Date.parse("2026-07-20T12:00:00.000Z");
  const app = await bootApp({ clockMs: T0 });
  try {
    const t = await app.signup("w3ip");
    const k1 = (await app.call("/api/apekeys", { method: "POST", token: t, body: { name: "a", scopes: SCOPES } })).body.key;
    const k2 = (await app.call("/api/apekeys", { method: "POST", token: t, body: { name: "b", scopes: SCOPES } })).body.key;
    const perKey = Math.floor(RATE_IP_LIMIT / 2); // each key stays at/under the per-key limit
    let pass = 0;
    for (let i = 0; i < perKey; i++) {
      const r1 = await app.call("/api/public/quotes?i=" + i, { token: k1 });
      const r2 = await app.call("/api/public/quotes?i=" + i, { token: k2 });
      if (r1.status === 200) pass++;
      if (r2.status === 200) pass++;
    }
    // 2*perKey = RATE_IP_LIMIT requests consumed from this source IP (clock frozen)
    const over1 = await app.call("/api/public/quotes", { token: k1 });
    const overMeta = over1.status === 429 && over1.body?.error?.code === "rate_limited" &&
      over1.headers.get("x-ratelimit-limit") === String(RATE_IP_LIMIT) &&
      Number(over1.headers.get("retry-after")) >= 1;
    const over2 = await app.call("/api/public/quotes", { token: k2 });
    // fresh key (full per-key budget) from the hot IP: still limited — the
    // limiting dimension is the IP, not the key
    const k3 = (await app.call("/api/apekeys", { method: "POST", token: t, body: { name: "c", scopes: SCOPES } })).body.key;
    const hotFresh = await app.call("/api/public/quotes", { token: k3 });
    // the SAME key from a DIFFERENT source IP is unaffected (x-forwarded-for honored)
    const otherIp = await app.call("/api/public/quotes", { token: k3, headers: { "x-forwarded-for": "203.0.113.9" } });
    // unauthenticated requests from the hot IP are also 429 (IP guards the surface)
    const unauth = await app.call("/api/public/quotes");
    // window-edge reset under the injected clock
    app.setNow(T0 - (T0 % 60000) + 60000 + 1);
    const reset = await app.call("/api/public/quotes", { token: k1 });
    rec("O-API-003",
        pass === RATE_IP_LIMIT && overMeta && over2.status === 429 &&
        hotFresh.status === 429 && otherIp.status === 200 && unauth.status === 429 && reset.status === 200,
        `${pass}/${RATE_IP_LIMIT} pass -> 429 (limit=${over1.headers.get("x-ratelimit-limit")}, retry metadata); fresh-key-hot-IP 429; other-IP 200; unauth 429; edge reset`);
    rec("O-API-003", RATE_IP_LIMIT >= RATE_KEY_LIMIT,
        `documented constants: ip ${RATE_IP_LIMIT} >= key ${RATE_KEY_LIMIT} — per-key remains the tested contract`);
  } finally { app.close(); }
}

// ---------- 4. background-work detection (O-ENG-004) ----------
{
  const engDir = join(root, "implementation", "src", "engine");
  const acDir = join(root, "implementation", "src", "anticheat");
  let timers = [];
  for (const d of [engDir, acDir]) {
    for (const f of readdirSync(d)) {
      const src = readFileSync(join(d, f), "utf8");
      if (/setInterval|setTimeout|setImmediate/.test(src)) timers.push(f);
    }
  }
  rec("O-ENG-004", timers.length === 0, timers.join(";") || "no timer APIs in engine/anticheat");
}

// ---------- 5. secrets boundary (O-ACC-001 adjacent) ----------
{
  const srv = join(root, "implementation", "src", "server");
  let leaks = [];
  for (const f of readdirSync(srv)) {
    const src = readFileSync(join(srv, f), "utf8");
    for (const m of src.matchAll(/process\.env\.(\w+)|process\.env\[["'](\w+)["']\]/g)) {
      const name = m[1] || m[2];
      if (!["PDD_TOKEN_SECRET", "PDD_EVIDENCE_KEY", "PORT", "PDD_DATA_DIR", "PDD_LEDGER_DIR", "PDD_IMPL_VERSION", "NODE_ENV", "PBT_RUNS", "PDD_CHAOS"].includes(name)) {
        leaks.push(`${f}:${name}`);
      }
    }
    if (/console\.log\(.*(password|token)/i.test(src)) leaks.push(`${f}: possible credential logging`);
  }
  rec("O-ACC-001", leaks.length === 0, leaks.join(";") || "secret access within allowlist; no credential logging");
}

// ---------- 6. response choke point (O-RES-004, v1.1) ----------
{
  const srvDir = join(root, "implementation", "src", "server");
  let bypasses = [];
  for (const f of readdirSync(srvDir)) {
    const src = readFileSync(join(srvDir, f), "utf8");
    if (/res\.send\(|res\.writeHead\(|res\.sendStatus\(/.test(src) && f !== "rvl.js") bypasses.push(f);
  }
  rec("O-RES-004", bypasses.length === 0,
      bypasses.join(";") || "all responses via res.json choke point");
}

const failed = results.filter((r) => r.outcome === "fail");
const out = { layer: "operational", validator: { id: "dependency-scan+egress-monitor+resource-budget", version: "1.0.0" },
              results, verdict: failed.length === 0 ? "admit" : "reject",
              verdict_reason: failed.length ? `${failed.length} operational failures` : "all operational checks pass" };
writeJson(new URL("./out/operational.json", import.meta.url).pathname, out);
console.log(JSON.stringify({ verdict: out.verdict, checks: results.length,
        failed: failed.map((f) => [f.invariant_id, f.evidence]) }, null, 2));
process.exit(failed.length ? 1 : 0);
