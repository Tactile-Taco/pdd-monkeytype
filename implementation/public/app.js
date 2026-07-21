// pdd-typing frontend — uses the SAME engine modules as the server (isomorphic).
// The engine performs no I/O (O-ENG-001); this shell owns all network/DOM work.
import { TypingSession } from "/engine/session.js";
import { internalWordlist } from "/engine/wordlist.js";
import { generateWords, decorateWords, mulberry32 } from "/engine/words.js";
import { round2, calculateWpm } from "/shared/stats.js";
import { DEFAULT_THEME, THEME_SLOTS, customSlotsToTokens, validateThemeShape,
         deriveColorfulExtra } from "/shared/themes.js";

const $ = (id) => document.getElementById(id);
const wordsEl = $("words"), wpmEl = $("wpm"), accEl = $("acc"), timerEl = $("timer");

// Caret element (ui-presentation B-UI-001): one per test view, repositioned after
// every keystroke. Logical position = (wordIndex, n), n = inputs[wordIndex].length
// (CA-UI-01 reading A: insertion point after the last typed char of the active word).
const caretEl = document.createElement("div");
caretEl.id = "caret";
caretEl.setAttribute("aria-hidden", "true");

let token = localStorage.getItem("pdd_token") || null;
let session = null, targetWords = [], ticker = null, sessionWordlist = null;

// Wordlists v1.0.0: same-origin static reads of the bundle's assets (S-WL-003),
// cached per deploy (contents byte-stable within a deploy — B-WL-002).
const wlAssetCache = new Map();
async function fetchWordlistAsset(id) {
  if (wlAssetCache.has(id)) return wlAssetCache.get(id);
  let asset = null;
  try {
    const r = await fetch("/wordlists/" + encodeURIComponent(id) + ".json");
    if (r.ok) asset = await r.json();
  } catch { /* network failure -> fallback path (logged delegation) */ }
  wlAssetCache.set(id, asset);
  return asset;
}

// ---------- auth ----------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "content-type": "application/json",
               ...(token ? { authorization: "Bearer " + token } : {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}
function refreshUser() {
  $("user").textContent = token ? "@" + (localStorage.getItem("pdd_name") || "me") : "";
  $("authbtn").textContent = token ? "logout" : "login";
}
$("authbtn").onclick = async () => {
  if (token) { await api("/api/account/logout", { method: "POST", body: "{}" });
    token = null; localStorage.removeItem("pdd_token"); refreshUser(); applyConfig(null); return; }
  $("authdlg").showModal();
};
$("closeDlg").onclick = () => $("authdlg").close();
async function doAuth(path) {
  const r = await api(path, { method: "POST",
    body: JSON.stringify({ name: $("authName").value, password: $("authPass").value }) });
  if (r.status === 200 && r.body.token) {
    token = r.body.token;
    localStorage.setItem("pdd_token", token);
    localStorage.setItem("pdd_name", r.body.profile.name);
    $("authMsg").textContent = "ok"; $("authdlg").close(); refreshUser(); loadConfig();
  } else $("authMsg").textContent = r.body?.error?.message || "failed";
}
$("doLogin").onclick = () => doAuth("/api/account/login");
$("doSignup").onclick = () => doAuth("/api/account/signup");

// ---------- theme (ui-presentation v2.0.0 B-UI-005 / S-UI-004) ----------
// Resolution precedence (sealed): (1) user-config custom slots when ALL NINE are
// non-empty AND charter-pattern conformant; (2) the catalog theme named by
// user-config theme, read from the theme-catalog handshake (GET /api/themes/:name);
// (3) the default dark theme (== style.css :root). Applying a theme sets :root
// token values only — never structure. Catalog reads are cached per deploy
// (byte-deterministic within a deploy, B-THM-003).
const catalogCache = { names: null, themes: new Map() };
async function catalogGet(name) {
  if (catalogCache.themes.has(name)) return catalogCache.themes.get(name);
  let theme = null;
  try {
    const r = await fetch("/api/themes/" + encodeURIComponent(name));
    if (r.status === 200) {
      const t = await r.json();
      theme = validateThemeShape(t).ok ? t : null; // fail-closed on malformed payloads
    }
  } catch { /* unreadable -> fallback path (B-UI-005 (3)) */ }
  catalogCache.themes.set(name, theme);
  return theme;
}
async function catalogNames() {
  if (catalogCache.names) return catalogCache.names;
  let names = [];
  try {
    const r = await fetch("/api/themes");
    if (r.status === 200) {
      const b = await r.json();
      names = Array.isArray(b?.themes) ? b.themes.map((x) => x?.name).filter((n) => typeof n === "string" && n) : [];
    }
  } catch { /* catalog unreachable -> empty list -> default theme */ }
  catalogCache.names = names;
  return names;
}
// Async twin of shared resolveThemeTokens (the catalog read is HTTP here; the
// precedence order itself is the sealed B-UI-005 order, mirrored in the shared
// module for the sync/unit-tested path).
async function resolveTokensFor(c) {
  const custom = customSlotsToTokens(c);            // (1) custom slots, all-nine gate
  if (custom) return { source: "custom", tokens: custom };
  const named = c.theme ? await catalogGet(c.theme) : null; // (2) catalog theme by name
  if (named) return { source: "catalog", name: named.name, tokens: named.tokens };
  return { source: "default", name: DEFAULT_THEME.name, tokens: DEFAULT_THEME.tokens }; // (3)
}
function applyTokens(tokens) {
  const st = document.documentElement.style;
  for (const slot of THEME_SLOTS) st.setProperty(slot, tokens[slot]);
  // B-UI-010(b): the colorful extra variant is derived from --colorful-error
  // (same hue/saturation, reduced lightness) at application time.
  st.setProperty("--colorful-error-extra",
    deriveColorfulExtra(tokens["--colorful-error"]) ?? tokens["--colorful-error"]);
}
let themeSeq = 0;
async function applyThemeResolved() {
  const seq = ++themeSeq;
  // randomTheme (B-UI-011): a catalog theme is selected at each test start and
  // applied atomically — resolution completes before the session's first
  // keystroke because newTest() awaits this. Selection algorithm delegated.
  let effCfg = cfg;
  if (cfg.randomTheme) {
    const names = await catalogNames();
    if (seq !== themeSeq) return; // superseded by a newer resolution
    if (names.length) {
      const pick = names[Math.floor(Math.random() * names.length)];
      const t = await catalogGet(pick);
      if (t) effCfg = { ...cfg, theme: t.name };
    }
  }
  const res = await resolveTokensFor(effCfg);
  if (seq !== themeSeq) return; // apply only the latest resolution
  applyTokens(res.tokens);
}

// ---------- effective config (user-config v1.2.0, 37 keys) ----------
// Local mirror of the sealed defaults so logged-out sessions and partial/pinned
// config payloads behave identically to the server defaults-merge (B-CFG-001).
// customThemeId was removed in v1.2.0 (BQ-CFG-01) and is gone here too.
const LOCAL_DEFAULTS = {
  mode: "time", mode2: "30", language: "english", punctuation: false,
  numbers: false, difficulty: "normal", blindMode: false, stopOnError: "off",
  theme: "serika_dark", lazyMode: false,
  confidenceMode: false, freedomMode: false, strictSpace: false,
  oppositeShift: false, minWpm: 0, minAcc: 0,
  fontFamily: "", fontSize: 0, tapeMode: false, quickRestart: "tab",
  flipTestColors: false, colorfulError: false, randomTheme: false,
  customThemeBg: "", customThemeMain: "", customThemeCaret: "",
  customThemeSub: "", customThemeSubAlt: "", customThemeText: "",
  customThemeError: "", customThemeErrorExtra: "", customThemeColorfulError: "",
  caretStyle: "line", smoothCaret: true,
  liveWpm: false, liveAcc: false, liveBurst: false,
};
let cfg = { ...LOCAL_DEFAULTS };
function applyConfig(next) {
  cfg = { ...LOCAL_DEFAULTS, ...(next ?? {}) };
  void applyThemeResolved(); // async; sets :root token values only (B-UI-005)
  applyFont();               // O-UI-004: configurable font, monospace default
  // Display modes (B-UI-007 blind / B-UI-010 flip+colorful): role classes only —
  // token values and letter-state classes are untouched (hiding is presentational).
  document.body.classList.toggle("flip", !!cfg.flipTestColors);
  document.body.classList.toggle("colorful", !!cfg.colorfulError);
  wordsEl.classList.toggle("blind", !!cfg.blindMode);
  wordsEl.classList.toggle("tape", !!cfg.tapeMode);
  if (!cfg.tapeMode) { tapeAnchor = null; wordsEl.scrollLeft = 0; }
  applyCaretStyle();
  liveStats(); // live-stats toggles (liveWpm/liveAcc/liveBurst) gate the enrichment
}
// O-UI-004: fontFamily configurable, monospace default. Applied to the word
// stream (the surface the invariant binds). Sanitized + generic fallback keeps
// the system-stack posture (O-UI-006: no font fetching).
function applyFont() {
  const fam = String(cfg.fontFamily ?? "").replace(/["';{}<>\\]/g, "").trim();
  wordsEl.style.fontFamily = fam ? `${fam}, ui-monospace, monospace` : "";
  // fontSize: rem, 0 = client default; presentation clamps (ambiguity-log) to
  // [1.5, 4] rem — the floor keeps letters >= 24px (O-UI-001 large-text clause).
  const fs = Number(cfg.fontSize);
  wordsEl.style.fontSize = fs > 0 ? Math.min(Math.max(fs, 1.5), 4) + "rem" : "";
  updateCaret(); // letter metrics changed
}
function applyCaretStyle() {
  caretEl.className = "";
  const style = ["off", "line", "block", "outline", "underline"].includes(cfg.caretStyle) ? cfg.caretStyle : "line";
  if (style !== "line") caretEl.classList.add(style);
  caretEl.classList.toggle("smooth", !!cfg.smoothCaret);
  updateCaret();
}
async function loadConfig() {
  if (!token) { applyConfig(null); return; }
  const r = await api("/api/config");
  applyConfig(r.status === 200 ? r.body : null);
}

// ---------- test setup ----------
function currentMode2() {
  const m = $("mode").value;
  if (m === "time") return $("mode2").value;
  if (m === "words") return { "15": "10", "30": "25", "60": "50" }[$("mode2").value];
  return $("mode2").value; // quote/zen/custom: raw select value (custom: the target)
}
// Custom-mode unit (seconds|words) is a test-start parameter (BQ-ENG-01), not a
// persisted config key. Minimal wiring here: ?unit=words URL override, default
// seconds. The unit picker UI is ui-presentation v2 scope.
function customUnit() {
  return new URLSearchParams(location.search).get("unit") === "words" ? "words" : "seconds";
}
async function newTest() {
  clearInterval(ticker);
  tapeAnchor = null; wordsEl.scrollLeft = 0; // tape re-anchors per session
  // Theme resolution completes BEFORE the view is shown / first keystroke —
  // this is the atomicity point for randomTheme (B-UI-011).
  await applyThemeResolved();
  const mode = $("mode").value, mode2 = currentMode2();
  sessionWordlist = null; // only the wordlists-asset branch sets a handshake list
  if (mode === "quote") {
    const r = await api("/api/quotes/random?language=english");
    if (r.status !== 200) { alert("no quotes"); return; }
    targetWords = r.body.text.split(" ");
  } else if (mode === "zen") {
    targetWords = [" ".repeat(1000)]; // freeform
  } else {
    // Wordlists bundle v1.0.0 (engine v2.0.1, BQ-WL-02): the engine consumes the
    // wordlists bundle's static assets via the S-ENG-004 handshake — the internal
    // default provider is RETIRED as the runtime source (kept only as an offline
    // fallback). Stream generation + decoration stay engine-side (B-ENG-006/009).
    const unit = customUnit();
    const n = mode === "words" || (mode === "custom" && unit === "words") ? Number(mode2) : 200;
    const seed = Math.floor(Math.random() * 1e9);
    const asset = await fetchWordlistAsset(cfg.language);
    if (asset) {
      const base = generateWords(n, seed, asset.words);
      const rnd = mulberry32(((seed ^ 0x9e3779b9) >>> 0) || 1); // same derivation as the retired provider
      targetWords = decorateWords(base, rnd, { punctuation: !!cfg.punctuation, numbers: !!cfg.numbers });
      sessionWordlist = { id: asset.id ?? asset.language, language: asset.language, words: targetWords };
    } else {
      // Offline/degraded fallback ONLY (logged delegation): retired internal provider.
      targetWords = internalWordlist({ language: cfg.language, count: n, seed,
        punctuation: !!cfg.punctuation, numbers: !!cfg.numbers }).words;
      sessionWordlist = null;
    }
  }
  try {
    session = new TypingSession({ mode, mode2, ...(sessionWordlist ? { wordlist: sessionWordlist } : { words: targetWords }), config: {
      language: cfg.language, punctuation: !!cfg.punctuation, numbers: !!cfg.numbers,
      blindMode: !!cfg.blindMode, stopOnError: cfg.stopOnError, lazyMode: !!cfg.lazyMode,
      confidenceMode: !!cfg.confidenceMode, freedomMode: !!cfg.freedomMode,
      strictSpace: !!cfg.strictSpace, minWpm: cfg.minWpm, minAcc: cfg.minAcc,
      ...(mode === "custom" ? { unit: customUnit() } : {}),
    } });
  } catch (e) {
    // B-ENG-008(g): confidenceMode × stopOnError!=off refuses session start.
    alert("cannot start test: " + e.message);
    return;
  }
  renderWords();
  $("result").hidden = true; $("board").hidden = true; $("test").hidden = false;
  timerEl.textContent = ""; wpmEl.textContent = "0"; accEl.textContent = "100"; $("livex").textContent = "";
  wordsEl.focus();
  updateCaret(); // after unhide: rects are measurable only when the view is visible
}

function renderWords() {
  wordsEl.innerHTML = "";
  const cap = Math.min(targetWords.length, 200);
  for (let wi = 0; wi < cap; wi++) {
    const w = document.createElement("span");
    w.className = "word" + (wi === 0 ? " active" : "");
    w.dataset.wi = wi;
    const typed = session.inputs[wi] ?? "";
    const target = targetWords[wi];
    const n = Math.max(target.length, typed.length);
    for (let i = 0; i < n; i++) {
      const c = document.createElement("span");
      const tc = target[i], ic = typed[i];
      c.className = "c" + (ic === undefined ? "" : ic === tc ? " correct" : tc === undefined ? " extra" : " incorrect");
      c.textContent = tc ?? ic;
      w.appendChild(c);
    }
    wordsEl.appendChild(w);
  }
  wordsEl.appendChild(caretEl); // absolute-positioned; outside the flex word flow
}

// B-UI-001: caret bounding rect tracks (wordIndex, n) — horizontally the right
// edge of letter n-1 of the active word (left edge of letter 0 when n == 0),
// vertically the active word's line box. Rect math is in CONTENT coordinates
// (viewport rect + scroll offsets), so it stays correct under window scroll and
// tape-mode stream translation without further updates.
let tapeAnchor = null; // px within the stream viewport; FIXITY sealed (±2px), location delegated
function updateCaret() {
  if (!session || $("test").hidden) return;
  const cur = wordsEl.querySelector(`[data-wi="${session.wordIndex}"]`);
  if (!cur) return;
  const letters = cur.querySelectorAll(".c");
  const n = (session.inputs[session.wordIndex] ?? "").length;
  const box = wordsEl.getBoundingClientRect();
  let ref;
  if (n > 0 && letters[n - 1]) ref = { rect: letters[n - 1].getBoundingClientRect(), edge: "right" };
  else if (letters[0]) ref = { rect: letters[0].getBoundingClientRect(), edge: "left" };
  else ref = { rect: cur.getBoundingClientRect(), edge: "left" };
  const contentX = (ref.edge === "right" ? ref.rect.right : ref.rect.left) - box.left + wordsEl.scrollLeft;
  caretEl.style.left = contentX + "px";
  // Zen edge: a whitespace-target letter span collapses to a zero-size rect;
  // fall back to the word's line box so the caret keeps a visible area (>= 4px^2).
  let top = ref.rect.top, height = ref.rect.height;
  if (height < 2) {
    const wr = cur.getBoundingClientRect();
    top = wr.top;
    height = Math.max(wr.height, parseFloat(getComputedStyle(wordsEl).lineHeight) || 0);
  }
  if (cfg.caretStyle === "underline") { top = top + height - 3; height = 3; } // bottom bar
  caretEl.style.top = top - box.top + wordsEl.scrollTop + "px";
  caretEl.style.height = height + "px";
  // Tape mode (B-UI-008): anchored caret — translate the stream so the caret's
  // viewport X stays fixed across keystrokes. 30% left padding (style.css) keeps
  // the anchor reachable from the first keystroke; scroll translation is a
  // permitted mutation-confinement exception (stream translation, B-UI-003).
  if (cfg.tapeMode) {
    if (tapeAnchor == null) tapeAnchor = Math.round(wordsEl.clientWidth * 0.3);
    wordsEl.scrollLeft = Math.max(0, contentX - tapeAnchor);
  }
  // smoothCaret: fade-ease pulse on position updates. A positional SLIDE
  // (left/top transition) would leave the caret mid-flight at scan time and
  // break the sealed ±2px tracking at the sealed default (smoothCaret=true);
  // the slide form is deferred to the v2 validator stage (see ui-v2-report).
  if (caretEl.classList.contains("smooth") && cfg.caretStyle !== "off") {
    // pulse from 0.65 back to the CLASS opacity (inline style removed at the
    // end so caretStyle-level opacities — off/block/outline — are preserved)
    caretEl.style.opacity = "0.65";
    requestAnimationFrame(() => { caretEl.style.opacity = ""; });
  }
}
function refreshActiveWord() {
  const cur = wordsEl.querySelector(`[data-wi="${session.wordIndex}"]`);
  // B-UI-003: only the previously active word may be re-classed — a no-op
  // classList.remove on every word still records an attribute mutation on each
  // committed word, which would violate per-keystroke mutation confinement.
  const prev = wordsEl.querySelector(".word.active");
  if (prev && prev !== cur) prev.classList.remove("active");
  if (cur) {
    const wi = session.wordIndex, typed = session.inputs[wi] ?? "", target = targetWords[wi];
    cur.innerHTML = "";
    const n = Math.max(target.length, typed.length);
    for (let i = 0; i < n; i++) {
      const c = document.createElement("span");
      const tc = target[i], ic = typed[i];
      c.className = "c" + (ic === undefined ? "" : ic === tc ? " correct" : tc === undefined ? " extra" : " incorrect");
      c.textContent = tc ?? ic;
      cur.appendChild(c);
    }
    cur.classList.add("active");
    cur.classList.toggle("error", [...typed].some((ch, i) => ch !== target[i]));
    // tape mode keeps the caret anchored via scrollLeft (updateCaret) instead;
    // scrollIntoView would fight the anchor. Non-tape: v1 scroll behavior (B-UI-006).
    if (!cfg.tapeMode) cur.scrollIntoView({ block: "center" });
  }
  updateCaret();
}

// ---------- input ----------
// Opposite-shift enforcement (B-ENG-008(d)) is DELEGATED to this input layer
// (round-3 ruling BQ-ENG-03): an input-filter preference. The engine admits char
// events identically with or without the optional `shift` evidence field, which
// rides the keystroke-event schema as plumbing only.
const shiftHeld = new Set();      // subset of {"left","right"}
let lastShiftSide = "left";
addEventListener("keydown", (e) => {
  if (e.key !== "Shift") return;
  const side = e.location === 2 ? "right" : "left"; // KeyboardEvent.location: 1 left, 2 right
  shiftHeld.add(side); lastShiftSide = side;
});
addEventListener("keyup", (e) => {
  if (e.key === "Shift") shiftHeld.delete(e.location === 2 ? "right" : "left");
});
// US-QWERTY touch-typing hand split (delegated data: the reference layout map
// was not sealed; this is the settled local table, see engine-v2-report).
const LEFT_HAND = new Set([..."`12345qwertasdfgzxcvb", ..."~!@#$%QWERTASDFGZXCVB"]);
const RIGHT_HAND = new Set([..."67890-=[]\\;',./yuiophjklnm", ..."^&*()_+{}|:\"<>?YUIOPHJKLNM"]);
const SHIFTED_SYMBOLS = new Set([..."~!@#$%^&*()_+{}|:\"<>?"]);
function requiresShift(ch) {
  if (SHIFTED_SYMBOLS.has(ch)) return true;
  return ch.toLowerCase() !== ch.toUpperCase() && ch === ch.toUpperCase(); // uppercase letter
}
// Returns false when the keystroke violates the opposite-shift preference and
// must be filtered here (never reaches the engine).
function oppositeShiftAdmits(ch) {
  if (!cfg.oppositeShift || !requiresShift(ch)) return true;
  const side = LEFT_HAND.has(ch) ? "left" : RIGHT_HAND.has(ch) ? "right" : null;
  if (!side) return true; // unknown key: admit (preference, not a hard gate)
  return shiftHeld.has(side === "left" ? "right" : "left");
}
function shiftEvidence() {
  if (shiftHeld.size === 0) return "none";
  if (shiftHeld.size === 2) return lastShiftSide;
  return [...shiftHeld][0];
}

wordsEl.addEventListener("keydown", (e) => {
  if (!session || session.completed) return;
  const t = performance.now();
  // quickRestart routing (user-config v1.1.0 key; default tab — off|tab|esc|enter).
  // Zen manual end (B-ENG-007: esc/enter routed client-side) takes precedence
  // over a colliding quickRestart binding.
  if (session.mode === "zen" && (e.key === "Escape" || e.key === "Enter")) {
    e.preventDefault(); finish(true); return;
  }
  const qr = cfg.quickRestart ?? "tab";
  const isQuickRestart = (qr === "tab" && e.key === "Tab") ||
                         (qr === "esc" && e.key === "Escape") ||
                         (qr === "enter" && e.key === "Enter");
  if (isQuickRestart) { e.preventDefault(); session.feed({ t, type: "restart" }); newTest(); return; }
  if (e.key === "Tab") { e.preventDefault(); return; } // unbound: keep focus, inert
  if (e.key === "Escape") { finish(true); return; }    // v1 bail behavior when unbound
  if (e.key === "Backspace") { e.preventDefault(); session.feed({ t, type: "backspace" }); }
  else if (e.key === " ") { e.preventDefault(); session.feed({ t, type: "space" }); }
  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    if (!oppositeShiftAdmits(e.key)) { e.preventDefault(); return; } // filtered at input layer
    session.feed({ t, type: "char", value: e.key, shift: shiftEvidence() });
  }
  else return;
  // Refresh BEFORE the completion branch (B-UI-002): the completing keystroke is
  // still a keystroke, so the final word's letter states must be faithful even as
  // the view transitions to results (B-UI-004).
  refreshActiveWord(); liveStats();
  if (session.completed) { finish(false); return; }
});

function liveStats() {
  if (!session || !session.startT) return;
  const now = performance.now();
  const dur = (now - session.startT) / 1000;
  const c = session._charCounts();
  wpmEl.textContent = String(Math.round(calculateWpm(c.allCorrect + c.incorrect + c.extra, dur)));
  const denom = c.allCorrect + c.incorrect + c.extra;
  accEl.textContent = String(denom ? Math.round((c.allCorrect / denom) * 100) : 100);
  if (session.mode === "time") {
    const left = Math.max(0, Number(session.mode2) - dur);
    timerEl.textContent = Math.ceil(left) + "s";
  }
  // Live-stats region (delegated; toggles persist in user-config v1.2.0 —
  // liveWpm/liveAcc/liveBurst, default false). Minimal display wiring: enabled
  // toggles enrich the region; defaults keep the v1 compact line untouched.
  const parts = [];
  if (cfg.liveWpm) parts.push(`live ${wpmEl.textContent} wpm`);
  if (cfg.liveAcc) parts.push(`acc ${accEl.textContent}%`);
  if (cfg.liveBurst) parts.push(`burst ${liveBurstWpm(now)} wpm`);
  $("livex").textContent = parts.length ? " · " + parts.join(" · ") : "";
}
// Burst = raw wpm over the trailing 1s of char events (same per-second bucket
// basis as the engine's completion chartData burst series).
function liveBurstWpm(now) {
  const recent = session.events.filter((e) => e.type === "char" && now - e.t <= 1000).length;
  return String(Math.round((recent / 5) * 60));
}

// ---------- finish ----------
async function finish(bailed) {
  clearInterval(ticker);
  if (bailed && !session.completed) session.bail(performance.now());
  const ev = session.completionEvent({
    timestamp: Date.now(),
    hash: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
  });
  $("test").hidden = true; $("result").hidden = false;
  $("resultStats").innerHTML = [
    [ev.wpm, "wpm"], [ev.rawWpm, "raw"], [ev.acc + "%", "acc"],
    [ev.consistency + "%", "consistency"], [ev.testDuration + "s", "time"],
    [ev.charStats.join("/"), "correct/incorrect/extra/missed"],
    [ev.keyConsistency + "%", "key consistency"], [ev.wpmConsistency + "%", "wpm consistency"],
  ].map(([v, l]) => `<div>${v}<small>${l}</small></div>`).join("");
  drawChart(ev.chartData);
  if (token && !bailed) {
    const r = await api("/api/results", { method: "POST", body: JSON.stringify(ev) });
    $("saveStatus").textContent = r.status === 201
      ? "saved" + (r.body.isPb ? " — new personal best!" : "")
      : "not saved: " + (r.body?.error?.message || r.status);
  } else $("saveStatus").textContent = token ? "bailed out — not eligible" : "login to save results";
}

function drawChart(cd) {
  const cv = $("chart"), ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (!cd || cd === "toolong" || !cd.wpm.length) return;
  const max = Math.max(...cd.wpm, 1);
  ctx.strokeStyle = "#e2b714"; ctx.beginPath();
  cd.wpm.forEach((v, i) => {
    const x = (i / Math.max(cd.wpm.length - 1, 1)) * cv.width;
    const y = cv.height - (v / max) * (cv.height - 10) - 5;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}

$("next").onclick = newTest;
$("restart").onclick = newTest;
$("mode").onchange = newTest; $("mode2").onchange = newTest;

// ---------- leaderboard ----------
$("boardbtn").onclick = () => { $("board").hidden = false; $("test").hidden = true; $("result").hidden = true; loadBoard("15"); };
document.querySelectorAll(".b2").forEach((b) => (b.onclick = () => loadBoard(b.dataset.m2)));
async function loadBoard(m2) {
  $("boardMode2").textContent = m2;
  const r = await api(`/api/leaderboards/${m2}`);
  const tb = document.querySelector("#boardTable tbody");
  tb.innerHTML = "";
  if (r.status !== 200) return;
  for (const e of r.body.entries) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${e.rank}</td><td>${e.name}</td><td>${e.wpm}</td><td>${e.rawWpm}</td><td>${e.acc}%</td><td>${e.consistency}%</td>`;
    tb.appendChild(tr);
  }
}

ticker = setInterval(() => { if (session && !session.completed) liveStats(); }, 250);
addEventListener("resize", updateCaret);
refreshUser();
loadConfig();
newTest();
