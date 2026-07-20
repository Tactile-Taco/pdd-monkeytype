// PDD Validator Loop — Layer 3: OPERATIONAL (dependency scan, egress monitor,
// resource budgets, background-work detection). Emits harness/out/operational.json.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import { writeJson } from "./evidence.mjs";
import { bootApp, makeEvent } from "./boot.mjs";
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
