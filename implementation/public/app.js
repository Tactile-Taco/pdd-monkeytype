// pdd-typing frontend — uses the SAME engine modules as the server (isomorphic).
// The engine performs no I/O (O-ENG-001); this shell owns all network/DOM work.
import { TypingSession } from "/engine/session.js";
import { generateWords } from "/engine/words.js";
import { round2, calculateWpm } from "/shared/stats.js";

const $ = (id) => document.getElementById(id);
const wordsEl = $("words"), wpmEl = $("wpm"), accEl = $("acc"), timerEl = $("timer");

let token = localStorage.getItem("pdd_token") || null;
let session = null, targetWords = [], ticker = null, activeWordIdx = 0;

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
    token = null; localStorage.removeItem("pdd_token"); refreshUser(); return; }
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
    $("authMsg").textContent = "ok"; $("authdlg").close(); refreshUser();
  } else $("authMsg").textContent = r.body?.error?.message || "failed";
}
$("doLogin").onclick = () => doAuth("/api/account/login");
$("doSignup").onclick = () => doAuth("/api/account/signup");

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
  activeWordIdx = 0;
  renderWords();
  $("result").hidden = true; $("board").hidden = true; $("test").hidden = false;
  timerEl.textContent = ""; wpmEl.textContent = "0"; accEl.textContent = "100";
  wordsEl.focus();
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
}
function refreshActiveWord() {
  const els = wordsEl.querySelectorAll(".word");
  els.forEach((el) => el.classList.remove("active"));
  const cur = wordsEl.querySelector(`[data-wi="${session.wordIndex}"]`);
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
  if (session.completed) { finish(false); return; }
  refreshActiveWord(); liveStats();
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
refreshUser();
newTest();
