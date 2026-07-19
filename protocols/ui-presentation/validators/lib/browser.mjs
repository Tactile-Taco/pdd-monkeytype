// Browser substrate for the ui-presentation validator suite.
// puppeteer-core + headless Chromium (validation-plan.yaml substrate line).
// One browser process is amortized across all checks; each scenario gets an
// isolated incognito context with:
//   - viewport 1280x800 @ dsf 1 (validation-plan environment)
//   - seeded Math.random (deterministic word stream, O-UI-005 determinism)
//   - pinned quote/config API responses (O-UI-005: "quote/config API responses
//     pinned by the validator")
//   - POST /api/results body capture (B-UI-004 payload interception)
//   - served-engine-module rewrite capturing feed() args (S-UI-005)
//   - MutationObserver recorder (B-UI-003 confinement)
//   - full request log (O-UI-006 same-origin audit) + artifact body hashing
import puppeteer from "puppeteer-core";
import { createHash } from "node:crypto";

export const CHROME_PATH = process.env.CHROME_PATH || "/usr/bin/chromium";

export const PINNED_QUOTE = {
  id: "pinned-quote-1",
  text: "the quick brown fox jumps over the lazy dog near the river bank",
  source: "validator-pinned", language: "english", length: 62, group: 0,
  approved: true, rating: { average: 0, count: 0 },
};
export const PINNED_CONFIG = { mode: "time", mode2: "30", punctuation: false, numbers: false,
                               difficulty: "normal", theme: "default", language: "english" };

export async function launchBrowser() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    args: ["--no-sandbox", "--headless=new", "--disable-dev-shm-usage",
           "--force-color-profile=srgb", "--disable-lcd-text", // deterministic rasterization within host
          ],
    defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
  });
  return browser;
}

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

// In-page infrastructure installed before any candidate script runs.
function preloadSource(seed) {
  return `
  (() => {
    // deterministic Math.random (mulberry32, same algorithm as the engine's words.js)
    let __a = ${seed >>> 0};
    Math.random = function () {
      __a |= 0; __a = (__a + 0x6D2B79F5) | 0;
      let t = Math.imul(__a ^ (__a >>> 15), 1 | __a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    window.__feedLog = [];        // populated by the rewritten engine module (S-UI-005)
    window.__mutLog = [];         // MutationObserver records (B-UI-003)
    window.__mutDropped = 0;
    const MUT_CAP = 50000;
    const attr = (t) => {
      if (!(t instanceof Element)) t = t && t.parentElement;
      if (!t) return { word: null, region: "other" };
      const w = t.closest(".word");
      if (w) {
        const wi = w.getAttribute("data-wi") ?? w.getAttribute("data-index") ?? null;
        return { word: wi === null ? null : Number(wi), region: "word" };
      }
      if (t.closest("#stats")) return { word: null, region: "stats" };
      if (t.closest("#caret, .caret, [data-caret]")) return { word: null, region: "caret" };
      if (t.closest("#words")) return { word: null, region: "wordstream" };
      return { word: null, region: "other" };
    };
    const rec = (m) => {
      if (window.__mutLog.length >= MUT_CAP) { window.__mutDropped++; return; }
      const a = attr(m.target);
      // value-aware: MutationObserver fires on no-op attribute/characterData
      // sets; B-UI-003 ("re-classed") gates on ACTUAL value changes.
      let oldV = null, nowV = null, changed = true;
      if (m.type === "attributes") {
        oldV = m.oldValue;
        nowV = m.target.getAttribute(m.attributeName);
        changed = oldV !== nowV;
      } else if (m.type === "characterData") {
        oldV = m.oldValue; nowV = m.target.data;
        changed = oldV !== nowV;
      }
      window.__mutLog.push({ type: m.type, region: a.region, word: a.word,
        attr: m.attributeName || null, changed,
        old: oldV === null ? null : String(oldV).slice(0, 60),
        now: nowV === null ? null : String(nowV).slice(0, 60),
        added: m.addedNodes ? m.addedNodes.length : 0,
        removed: m.removedNodes ? m.removedNodes.length : 0 });
    };
    window.__mutStart = () => {
      if (window.__mutObserver) return;
      window.__mutObserver = new MutationObserver((list) => { for (const m of list) rec(m); });
      window.__mutObserver.observe(document.documentElement,
        { childList: true, subtree: true, attributes: true, attributeOldValue: true,
          characterData: true, characterDataOldValue: true });
    };
    window.__mutDrain = () => { const out = window.__mutLog; window.__mutLog = []; return out; };
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", () => window.__mutStart());
    else window.__mutStart();
  })();`;
}

export class SessionPage {
  constructor(context, page, meta) {
    this.context = context; this.page = page; this.meta = meta;
  }
  async close() { await this.context.close(); }
}

// Open an isolated, instrumented page on `origin`.
export async function openSessionPage(browser, origin, {
  seed = 1, pinApis = true, rewriteEngine = true, selectors, pinnedConfig = null,
  initScript = null,
} = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const originObj = new URL(origin);
  const meta = {
    requests: [],            // {url, method, resourceType, sameOrigin, status}
    thirdParty: [],          // attempted third-party requests (O-UI-006)
    resultPosts: [],         // captured POST /api/results bodies (B-UI-004)
    engineRewriteSeen: false,
    artifacts: new Map(),    // url -> sha256(body) for same-origin doc/script/style
    consoleErrors: [],
  };
  page.on("pageerror", (e) => meta.consoleErrors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") meta.consoleErrors.push("console: " + m.text()); });

  const engineRe = new RegExp(selectors.engineModuleRe);
  const resultsRe = new RegExp(selectors.resultsPostRe);
  await page.setRequestInterception(true);
  page.on("request", async (req) => {
    const url = req.url();
    let u; try { u = new URL(url); } catch { return req.continue(); }
    const sameOrigin = u.origin === originObj.origin;
    meta.requests.push({ url, method: req.method(), resourceType: req.resourceType(), sameOrigin });
    if (!sameOrigin && (u.protocol === "http:" || u.protocol === "https:")) {
      meta.thirdParty.push({ url, method: req.method(), resourceType: req.resourceType() });
      return req.abort(); // denied by capability manifest anyway; recorded either way
    }
    if (pinApis && sameOrigin && u.pathname.startsWith("/api/quotes/")) {
      return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(PINNED_QUOTE) });
    }
    if (pinApis && sameOrigin && u.pathname === "/api/config") {
      const cfg = pinnedConfig ? { ...PINNED_CONFIG, ...pinnedConfig } : PINNED_CONFIG;
      return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(cfg) });
    }
    if (sameOrigin && req.method() === "POST" && resultsRe.test(u.pathname)) {
      try { meta.resultPosts.push(JSON.parse(req.postData() || "{}")); } catch { meta.resultPosts.push({ __unparseable: true }); }
      return req.continue();
    }
    if (rewriteEngine && sameOrigin && req.resourceType() === "script" && engineRe.test(u.pathname)) {
      // S-UI-005: rewrite the served engine module at request time to capture feed() args.
      try {
        const res = await fetch(url);
        let body = await res.text();
        meta.engineRewriteSeen = true;
        meta.artifacts.set(u.pathname, sha256(body)); // hash the ORIGINAL served bytes
        body += `\n;(() => { try {
          const __orig = TypingSession.prototype.feed;
          TypingSession.prototype.feed = function (ev) {
            try { window.__feedLog.push(ev == null ? ev : JSON.parse(JSON.stringify(ev))); } catch {}
            return __orig.call(this, ev); };
        } catch (e) { console.error("feed-wrap failed", e); } })();\n`;
        return req.respond({ status: res.status, contentType: "text/javascript; charset=utf-8", body });
      } catch { return req.continue(); }
    }
    return req.continue();
  });
  page.on("response", async (res) => {
    try {
      const u = new URL(res.url());
      if (u.origin !== originObj.origin || u.pathname.startsWith("/api/")) return;
      const ct = (res.headers()["content-type"] || "");
      if (/text\/(html|css)|javascript/.test(ct) && !meta.artifacts.has(u.pathname)) {
        meta.artifacts.set(u.pathname, sha256(await res.buffer()));
      }
    } catch {}
  });

  await page.evaluateOnNewDocument(preloadSource(seed));
  if (initScript) await page.evaluateOnNewDocument(initScript); // candidate fixtures/shims (testing aid)
  await page.goto(origin + "/", { waitUntil: "networkidle0", timeout: 30000 });
  return new SessionPage(context, page, meta);
}

// Computed artifact identity for the candidate under test (evidence requirement:
// implementation_artifact_hash) — sha256 over sorted "path:bodyhash" lines of all
// same-origin document/script/style responses observed during the run.
export function artifactHash(metas) {
  const all = new Map();
  for (const m of metas) for (const [k, v] of m.artifacts) all.set(k, v);
  const lines = [...all.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`);
  return "sha256:" + createHash("sha256").update(lines.join("\n")).digest("hex");
}
