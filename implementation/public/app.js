// pdd-typing frontend — uses the SAME engine modules as the server (isomorphic).
// The engine performs no I/O (O-ENG-001); this shell owns all network/DOM work.
import { TypingSession } from "/engine/session.js";
import { generateWords } from "/engine/words.js";
import { round2, calculateWpm } from "/shared/stats.js";

const $ = (id) => document.getElementById(id);
const wordsEl = $("words"), wpmEl = $("wpm"), accEl = $("acc"), timerEl = $("timer");

// Caret element (ui-presentation B-UI-001): one per test view, repositioned after
// every keystroke. Logical position = (wordIndex, n), n = inputs[wordIndex].length
// (CA-UI-01 reading A: insertion point after the last typed char of the active word).
const caretEl = document.createElement("div");
caretEl.id = "caret";
caretEl.setAttribute("aria-hidden", "true");

let token = localStorage.getItem("pdd_token") || null;
let session = null, targetWords = [], ticker = null;

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
    token = null; localStorage.removeItem("pdd_token"); refreshUser(); applyTheme(null); return; }
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
    $("authMsg").textContent = "ok"; $("authdlg").close(); refreshUser(); loadTheme();
  } else $("authMsg").textContent = r.body?.error?.message || "failed";
}
$("doLogin").onclick = () => doAuth("/api/account/login");
$("doSignup").onclick = () => doAuth("/api/account/signup");

// ---------- theme (ui-presentation B-UI-005 / S-UI-004) ----------
// Single charter-conformant dark theme ships this iteration (ambiguity-log Q2).
// Theme values arrive only via user-config; unknown or absent values fall back
// to the default dark theme. Applying a theme sets :root token values only —
// never structure. Token names are sealed (S-UI-004); values match style.css.
const THEMES = {
  dark: { "--bg": "#323437", "--main": "#e2b714", "--caret": "#e2b714",
          "--text": "#d1d0c5", "--sub": "#646669",
          "--error": "#cf5763", "--error-extra": "#7e2a33" }, // == style.css :root
};
function applyTheme(name) {
  const tokens = THEMES[name] || THEMES.dark; // conservative fallback (B-UI-005)
  for (const [k, v] of Object.entries(tokens)) document.documentElement.style.setProperty(k, v);
}
async function loadTheme() {
  if (!token) { applyTheme(null); return; }
  const r = await api("/api/config");
  applyTheme(r.status === 200 ? r.body?.theme : null);
}

// ---------- test setup ----------
function currentMode2() {
  const m = $("mode").value;
  if (m === "time") return $("mode2").value;
  if (m === "words") return { "15": "10", "30": "25", "60": "50" }[$("mode2").value];
  return $("mode2").value;
}
async function newTest() {
  clearInterval(ticker);
  const mode = $("mode").value, mode2 = currentMode2();
  if (mode === "quote") {
    const r = await api("/api/quotes/random?language=english");
    if (r.status !== 200) { alert("no quotes"); return; }
    targetWords = r.body.text.split(" ");
  } else if (mode === "zen") {
    targetWords = [" ".repeat(1000)]; // freeform
  } else {
    const n = mode === "words" ? Number(mode2) : 200;
    targetWords = generateWords(n, Math.floor(Math.random() * 1e9));
  }
  session = new TypingSession({ mode, mode2, words: targetWords });
  renderWords();
  $("result").hidden = true; $("board").hidden = true; $("test").hidden = false;
  timerEl.textContent = ""; wpmEl.textContent = "0"; accEl.textContent = "100";
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
// vertically the active word's line box. Rect math is container-relative, so it
// stays correct under window scroll without further updates.
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
  caretEl.style.left = (ref.edge === "right" ? ref.rect.right : ref.rect.left) - box.left + "px";
  // Zen edge: a whitespace-target letter span collapses to a zero-size rect;
  // fall back to the word's line box so the caret keeps a visible area (>= 4px^2).
  let top = ref.rect.top, height = ref.rect.height;
  if (height < 2) {
    const wr = cur.getBoundingClientRect();
    top = wr.top;
    height = Math.max(wr.height, parseFloat(getComputedStyle(wordsEl).lineHeight) || 0);
  }
  caretEl.style.top = top - box.top + "px";
  caretEl.style.height = height + "px";
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
    cur.scrollIntoView({ block: "center" });
  }
  updateCaret();
}

// ---------- input ----------
wordsEl.addEventListener("keydown", (e) => {
  if (!session || session.completed) return;
  const t = performance.now();
  if (e.key === "Tab") { e.preventDefault(); session.feed({ t, type: "restart" }); newTest(); return; }
  if (e.key === "Escape") { finish(true); return; }
  if (e.key === "Backspace") { e.preventDefault(); session.feed({ t, type: "backspace" }); }
  else if (e.key === " ") { e.preventDefault(); session.feed({ t, type: "space" }); }
  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) session.feed({ t, type: "char", value: e.key });
  else return;
  // Refresh BEFORE the completion branch (B-UI-002): the completing keystroke is
  // still a keystroke, so the final word's letter states must be faithful even as
  // the view transitions to results (B-UI-004).
  refreshActiveWord(); liveStats();
  if (session.completed) { finish(false); return; }
});

function liveStats() {
  if (!session.startT) return;
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
loadTheme();
newTest();
