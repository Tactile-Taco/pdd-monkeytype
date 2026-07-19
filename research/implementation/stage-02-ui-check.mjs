// Stage-02 ui-presentation v1.0.0 conformance self-check (implementation-side;
// NOT the sealed validator — that is authored by the Validator role).
// Drives a scripted typing session against the served UI and asserts every
// `must` invariant observable from the client, mirroring engine state in Node.
// Usage: start the server (npm start / PORT=8787), then
//   node research/implementation/stage-02-ui-check.mjs
import puppeteer from "puppeteer-core";
import { TypingSession } from "../../implementation/src/engine/session.js";

const ORIGIN = process.env.PDD_ORIGIN || "http://localhost:8787";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (id, cond, msg) => {
  if (!cond) failures++;
  console.log(`${cond ? "pass" : "FAIL"} ${id} ${msg}`);
};

// ---- color math (WCAG 2.x relative luminance; RGB->HSL) ----
const parseRgb = (s) => {
  s = s.trim();
  if (s.startsWith("#")) { // custom properties report their declared token string
    let h = s.slice(1);
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  return s.match(/[\d.]+/g).slice(0, 3).map(Number); // rgb()/rgba() computed colors
};
const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };
const hsl = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s };
};
const maxDelta = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--headless=new"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 }); // validation-plan env
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") pageErrors.push("console: " + m.text()); });
const requests = [];
page.on("request", (r) => requests.push(r.url()));
let resultsPost = null;
page.on("request", (r) => {
  if (r.url().endsWith("/api/results") && r.method() === "POST") resultsPost = JSON.parse(r.postData());
});

await page.goto(ORIGIN + "/", { waitUntil: "networkidle0" });
await sleep(300);

// ---------- S-UI-004 + O-UI-001/002: tokens on :root ----------
const tokens = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  for (const t of ["--bg", "--main", "--caret", "--text", "--sub", "--error", "--error-extra"])
    out[t] = cs.getPropertyValue(t).trim();
  return out;
});
const tokenRgb = Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, parseRgb(v)]));
check("S-UI-004", Object.values(tokens).every((v) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) || /^rgb/.test(v)),
  `tokens resolve to parseable colors: ${JSON.stringify(tokens)}`);
check("O-UI-001", contrast(tokenRgb["--text"], tokenRgb["--bg"]) >= 4.5,
  `text/bg=${contrast(tokenRgb["--text"], tokenRgb["--bg"]).toFixed(2)} >= 4.5`);
check("O-UI-001", contrast(tokenRgb["--error"], tokenRgb["--bg"]) >= 3.0,
  `error/bg=${contrast(tokenRgb["--error"], tokenRgb["--bg"]).toFixed(2)} >= 3.0 (large-text clause)`);
check("O-UI-001", contrast(tokenRgb["--caret"], tokenRgb["--bg"]) >= 3.0,
  `caret/bg=${contrast(tokenRgb["--caret"], tokenRgb["--bg"]).toFixed(2)} >= 3.0`);
check("O-UI-002", lum(tokenRgb["--bg"]) <= 0.2 && lum(tokenRgb["--text"]) > lum(tokenRgb["--bg"]),
  `L(bg)=${lum(tokenRgb["--bg"]).toFixed(3)} <= 0.2, L(text) > L(bg)`);
for (const t of ["--error", "--error-extra"]) {
  const { h, s } = hsl(tokenRgb[t]);
  check("O-UI-002", (h <= 15 || h >= 340) && s >= 0.45, `${t} h=${h.toFixed(1)} in redband, s=${s.toFixed(3)} >= 0.45`);
}

// ---------- O-UI-001 large-text clause + O-UI-004 monospace ----------
const metrics = await page.evaluate(() => {
  const letter = document.querySelector("#words .word .c");
  const cs = getComputedStyle(letter);
  const cv = document.createElement("canvas").getContext("2d");
  cv.font = cs.font || `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return { fontSize: parseFloat(cs.fontSize), fontFamily: cs.fontFamily,
           i: cv.measureText("i").width, m: cv.measureText("m").width };
});
check("O-UI-001", metrics.fontSize >= 24, `letter computed font-size=${metrics.fontSize}px >= 24`);
check("O-UI-004", Math.abs(metrics.i - metrics.m) <= 1, `adv(i)=${metrics.i} adv(m)=${metrics.m} within 1px`);
check("O-UI-004", /monospace/.test(metrics.fontFamily), `font-family resolves through monospace generic: ${metrics.fontFamily}`);

// ---------- S-UI-001 fresh word-stream structure + reading order ----------
const structure = await page.evaluate(() => {
  const words = [...document.querySelectorAll("#words .word")];
  return words.map((w) => {
    const r = w.getBoundingClientRect();
    return { wi: Number(w.dataset.wi), text: w.textContent, top: r.top, left: r.left };
  });
});
check("S-UI-001", structure.length > 0 && structure.every((w, i) => w.wi === i),
  `one .word per engine word, data-wi == index (${structure.length} words)`);
let rowMajor = true;
for (let i = 0; i < structure.length - 1; i++) {
  const a = structure[i], b = structure[i + 1];
  if (!(b.top > a.top + 2 || (Math.abs(b.top - a.top) <= 2 && b.left >= a.left - 2))) rowMajor = false;
}
check("S-UI-001", rowMajor, "row-major visual reading order (2px tolerance)");

// ---------- sign up (enables /api/results capture for B-UI-004 + config for B-UI-005) ----------
const uname = "stage02_" + Math.random().toString(36).slice(2, 8);
await page.click("#authbtn"); await page.type("#authName", uname); await page.type("#authPass", "password123");
await page.click("#doSignup"); await sleep(500);
const loggedIn = await page.$eval("#user", (e) => e.textContent.startsWith("@"));
check("setup", loggedIn, `signed up as @${uname}`);

// ---------- words mode (10 words) + mirror engine session ----------
await page.select("#mode", "words"); await page.select("#mode2", "15"); // -> 10 words
await sleep(400);
const targets = await page.$$eval("#words .word", (els) => els.map((e) => e.textContent));
const mirror = new TypingSession({ mode: "words", mode2: "10", words: targets });
let mt = 1000;

// mutation observer for B-UI-003 (drained after every keystroke)
await page.evaluate(() => {
  window.__muts = [];
  window.__drainMuts = () => { const m = window.__muts; window.__muts = []; return m; };
  new MutationObserver((rs) => {
    for (const r of rs) {
      const t = r.target;
      const w = t.nodeType === 1 && t.closest ? t.closest(".word") : null;
      if (w) window.__muts.push({ kind: "word", wi: Number(w.dataset.wi) });
      else if ((t.id || (t.parentElement && t.parentElement.id)) === "caret") window.__muts.push({ kind: "caret" });
      else window.__muts.push({ kind: "other", tag: t.nodeName, id: t.id || "" });
    }
  }).observe(document.getElementById("words"), { subtree: true, childList: true, attributes: true, characterData: true });
});
await page.click("#words");

const snap = () => page.evaluate(() => {
  const words = [...document.querySelectorAll("#words .word")];
  const caret = document.getElementById("caret");
  const cr = caret.getBoundingClientRect();
  const cs = getComputedStyle(caret);
  const active = document.querySelector("#words .word.active");
  const activeLetters = active ? [...active.querySelectorAll(".c")].map((c) => {
    const r = c.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }) : [];
  return {
    activeWi: active ? Number(active.dataset.wi) : -1,
    activeCount: words.filter((w) => w.classList.contains("active")).length,
    words: words.map((w) => ({ wi: Number(w.dataset.wi),
      letters: [...w.querySelectorAll(".c")].map((c) => c.className) })),
    activeLetters,
    caret: { x: cr.x, y: cr.y, w: cr.width, h: cr.height,
             display: cs.display, visibility: cs.visibility, opacity: Number(cs.opacity) },
    muts: window.__drainMuts(),
  };
});

const expCls = (typed, target, i) => {
  const ic = typed[i], tc = target[i];
  return "c" + (ic === undefined ? "" : ic === tc ? " correct" : tc === undefined ? " extra" : " incorrect");
};

let lastActive = 0;
async function checkState(label) {
  const s = await snap();
  const m = mirror;
  const sessionActive = !m.completed; // invariants S-UI-003/B-UI-001 scope: active session
  // S-UI-003: exactly one active word, index == engine wordIndex
  if (sessionActive)
    check("S-UI-003", s.activeCount === 1 && s.activeWi === m.wordIndex,
      `${label}: active=${s.activeWi} engine=${m.wordIndex} count=${s.activeCount}`);
  // S-UI-002 + B-UI-002: every letter of every word faithful to engine state
  let classOk = true, detail = "";
  for (let wi = 0; wi < m.words.length && classOk; wi++) {
    const typed = m.inputs[wi] ?? "", target = m.words[wi], dom = s.words[wi];
    if (!dom || dom.wi !== wi) { classOk = false; detail = `word ${wi} binding`; break; }
    const expN = Math.max(target.length, typed.length);
    if (dom.letters.length !== expN) { classOk = false; detail = `word ${wi} letter count ${dom.letters.length}!=${expN}`; break; }
    for (let i = 0; i < expN; i++) {
      const exp = expCls(typed, target, i);
      if (dom.letters[i] !== exp) { classOk = false; detail = `w${wi} l${i}: '${dom.letters[i]}' != '${exp}'`; break; }
    }
  }
  check("B-UI-002", classOk, `${label}: letter classes faithful (${detail || "ok"})`);
  // B-UI-001: caret position/visibility (test view active only)
  if (sessionActive) {
    const n = (m.inputs[m.wordIndex] ?? "").length;
    if (s.activeLetters.length) {
      const ref = n > 0 ? s.activeLetters[n - 1] : s.activeLetters[0];
      const expX = n > 0 ? ref.right : ref.left;
      check("B-UI-001", Math.abs(s.caret.x - expX) <= 2,
        `${label}: caret.x=${s.caret.x.toFixed(1)} vs boundary=${expX.toFixed(1)} (n=${n})`);
      check("B-UI-001", s.caret.y < ref.bottom && s.caret.y + s.caret.h > ref.top,
        `${label}: caret vertically overlaps active word line box`);
    }
    check("B-UI-001", s.caret.display !== "none" && s.caret.visibility !== "hidden" &&
      s.caret.w * s.caret.h >= 4 && s.caret.opacity >= 0.5,
      `${label}: caret visible (area=${(s.caret.w * s.caret.h).toFixed(0)}px^2, opacity=${s.caret.opacity})`);
  }
  // B-UI-003: mutations confined to active-before/active-after words (+ caret)
  if (sessionActive) {
    const allowed = new Set([lastActive, m.wordIndex]);
    const bad = s.muts.filter((mu) => mu.kind !== "caret" && (mu.kind !== "word" || !allowed.has(mu.wi)));
    check("B-UI-003", bad.length === 0,
      `${label}: mutations confined {${[...allowed].join(",")}} ${bad.length ? "-> " + JSON.stringify(bad.slice(0, 3)) : ""}`);
  }
  lastActive = m.wordIndex;
}

async function key(k) {
  if (k === "\b") { await page.keyboard.press("Backspace"); mirror.feed({ t: (mt += 50), type: "backspace" }); }
  else if (k === " ") { await page.keyboard.press("Space"); mirror.feed({ t: (mt += 50), type: "space" }); }
  else { await page.keyboard.type(k); mirror.feed({ t: (mt += 50), type: "char", value: k }); }
  await sleep(15);
  await checkState(JSON.stringify(k));
}
const wrongChar = (c) => (c === "x" ? "z" : "x");

// --- scripted stream: CA-UI-01 revealing test first (2 chars, backspace -> caret between l0/l1) ---
await key(targets[0][0]);
await key(targets[0][1]);
await key("\b"); // n=1: caret must sit between letter 0 and letter 1
await key(targets[0][1]); // retype
await key(wrongChar(targets[0][1])); // force an incorrect letter at pos 1
for (const c of targets[0].slice(2)) await key(c);
await key("x"); // extra letter beyond target length
await key(" "); // commit word 0 (contains incorrect + extra)
await key(targets[1][0]);
await key(targets[1][1]);

// ---------- O-UI-003: 4-state color distinction (all states on screen now) ----------
const stateColors = await page.evaluate(() => {
  const pick = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).color : null; };
  return {
    untyped: pick("#words .word:not(.active) .c:not(.correct):not(.incorrect):not(.extra)"),
    correct: pick("#words .c.correct"),
    incorrect: pick("#words .c.incorrect"),
    extra: pick("#words .c.extra"),
  };
});
check("setup", Object.values(stateColors).every(Boolean), `all 4 letter states rendered: ${JSON.stringify(stateColors)}`);
const pairs = [["untyped", "correct"], ["untyped", "incorrect"], ["untyped", "extra"],
               ["correct", "incorrect"], ["correct", "extra"], ["incorrect", "extra"]];
for (const [a, b] of pairs) {
  const d = maxDelta(parseRgb(stateColors[a]), parseRgb(stateColors[b]));
  check("O-UI-003", d >= 32, `${a} vs ${b}: max channel delta=${d} >= 32`);
}

// ---------- B-UI-001 visibility: 3 samples 250ms apart (blink tolerance) ----------
const samples = [];
for (let i = 0; i < 3; i++) {
  samples.push(await page.evaluate(() => {
    const c = document.getElementById("caret"), r = c.getBoundingClientRect(), cs = getComputedStyle(c);
    return cs.display !== "none" && cs.visibility !== "hidden" && r.width * r.height >= 4 && Number(cs.opacity) >= 0.5;
  }));
  await sleep(250);
}
check("B-UI-001", samples.filter(Boolean).length >= 1, `visibility samples=${samples} (>=1 of 3)`);

// --- backspace retreat into erroneous committed word, fix it, re-commit ---
await key("\b"); await key("\b"); // empty word 1 input
await key("\b"); // retreat into word 0 (has error -> retreat allowed, B-ENG-005 v1.1)
await key("\b"); // delete extra 'x'
while ((mirror.inputs[0] ?? "").length > 1) await key("\b"); // back to first char
for (const c of targets[0].slice(1)) await key(c); // retype word 0 perfectly
await key(" "); // commit word 0 (now fully correct)

// --- finish remaining words perfectly ---
for (let wi = 1; wi < targets.length; wi++) {
  for (const c of targets[wi]) await key(c);
  if (wi < targets.length - 1) await key(" ");
}
await sleep(600);
check("setup", mirror.completed, "mirror session completed (words mode)");

// ---------- B-UI-004: results view shows event wpm/acc exactly ----------
const resultState = await page.evaluate(() => ({
  testHidden: document.getElementById("test").hidden,
  resultHidden: document.getElementById("result").hidden,
  cells: [...document.querySelectorAll("#resultStats > div")].map((d) => d.childNodes[0].textContent),
}));
check("B-UI-004", resultState.testHidden && !resultState.resultHidden, "test view hidden, results view shown");
await sleep(500); // allow POST /api/results to fire
check("setup", !!resultsPost, "captured POST /api/results payload");
if (resultsPost) {
  check("B-UI-004", resultState.cells[0] === String(resultsPost.wpm),
    `wpm rendered '${resultState.cells[0]}' === payload '${String(resultsPost.wpm)}' (exact)`);
  check("B-UI-004", resultState.cells[2] === String(resultsPost.acc) + "%",
    `acc rendered '${resultState.cells[2]}' === payload '${String(resultsPost.acc)}' + '%' (delegated decoration)`);
}

// ---------- B-UI-005 (should): unknown theme value falls back to default dark ----------
const tokenSnapshot = async () => page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  return ["--bg", "--main", "--caret", "--text", "--sub", "--error", "--error-extra"]
    .map((t) => cs.getPropertyValue(t).trim()).join("|");
});
const defaultTokens = await tokenSnapshot();
const authedFetch = (path, opts) => page.evaluate(async (p, o) => {
  const r = await fetch(p, { ...o, headers: { "content-type": "application/json",
    authorization: "Bearer " + localStorage.getItem("pdd_token") } });
  return r.status;
}, path, opts);
const put1 = await authedFetch("/api/config", { method: "PUT", body: JSON.stringify({ theme: "no-such-theme" }) });
await page.reload({ waitUntil: "networkidle0" }); await sleep(400);
const afterUnknown = await tokenSnapshot();
check("B-UI-005", put1 === 200 && afterUnknown === defaultTokens,
  `unknown theme '${put1 === 200 ? "no-such-theme" : ""}' -> default dark tokens (fallback)`);
const put2 = await authedFetch("/api/config", { method: "PUT", body: JSON.stringify({ theme: "dark" }) });
await page.reload({ waitUntil: "networkidle0" }); await sleep(400);
check("B-UI-005", put2 === 200 && (await tokenSnapshot()) === defaultTokens, "theme=dark -> same token set");

// ---------- zen mode (ambiguity-log: covered, not excepted — one long word) ----------
await page.select("#mode", "zen"); await sleep(400);
await page.click("#words");
for (const ch of "hey you") await page.keyboard.type(ch, { delay: 12 });
await sleep(150);
const zen = await page.evaluate(() => {
  const words = [...document.querySelectorAll("#words .word")];
  const active = document.querySelector("#words .word.active");
  const letters = [...active.querySelectorAll(".c")];
  const caret = document.getElementById("caret").getBoundingClientRect();
  const ref = letters[6].getBoundingClientRect(); // n = 7 typed chars
  return { wordCount: words.length, activeCount: words.filter((w) => w.classList.contains("active")).length,
    classes: letters.slice(0, 7).map((c) => c.className),
    caretDx: Math.abs(caret.x - ref.right), caretArea: caret.width * caret.height };
});
check("zen", zen.wordCount === 1 && zen.activeCount === 1, `one long word, single active (${zen.wordCount}/${zen.activeCount})`);
check("zen", zen.classes.every((c, i) => c === (i === 3 ? "c correct" : "c incorrect")),
  `letter classes faithful to space-target: ${zen.classes.join(",")}`);
check("zen B-UI-001", zen.caretDx <= 2 && zen.caretArea >= 4,
  `caret tracks (dx=${zen.caretDx.toFixed(1)}), visible area=${zen.caretArea.toFixed(0)}px^2 (whitespace-span fallback)`);
await page.select("#mode", "time"); await sleep(300); // restore default view

// ---------- O-UI-006: same-origin request audit ----------
const thirdParty = requests.filter((u) => /^https?:/.test(u) && !u.startsWith(ORIGIN));
check("O-UI-006", thirdParty.length === 0,
  `${requests.length} requests, all same-origin ${thirdParty.length ? "-> " + thirdParty.join(", ") : ""}`);

check("hygiene", pageErrors.length === 0, `js errors: ${pageErrors.length ? pageErrors.join(" | ") : "none"}`);
console.log(failures === 0 ? "\nALL CHECKS PASS" : `\n${failures} CHECK(S) FAILED`);
await browser.close();
process.exit(failures ? 1 : 0);
