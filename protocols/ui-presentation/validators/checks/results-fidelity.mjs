// Validator: results-fidelity (validator-set 0.1.0, behavioral layer)
// Covers B-UI-004: on completed_event the test view is hidden, the results view
// is shown, and the results text presents the CompletedEvent wpm/acc EXACTLY
// (canonical number-to-string; labels/'%'-decoration delegated; rounded display
// non-conformant). Mechanism: scripted perfect words-mode run + POST /api/results
// interception (payload = ground truth), fallback oracle-replay of the captured
// feed() log when a candidate defers the POST.
import { openSessionPage } from "../lib/browser.mjs";
import { readTargets, setWordsMode, focusWords } from "../lib/driver.mjs";
import { SessionOracle } from "../lib/oracle.mjs";
import { scanWordStream, settle } from "../lib/dom.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runResultsFidelity(ctx) {
  const { browser, origin, selectors, options } = ctx;
  const sp = await openSessionPage(browser, origin, { seed: options.seed * 17 + 5, selectors, initScript: options.initScript });
  try {
    // auth: sign up through the real same-origin account handshake so the
    // candidate emits the CompletedEvent POST (test-results family convention:
    // token persisted in localStorage 'pdd_token' and sent as Bearer).
    const authed = await sp.page.evaluate(async () => {
      try {
        const r = await fetch("/api/account/signup", { method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "ui_val_" + Math.floor(Math.random() * 1e9), password: "password123" }) });
        const b = await r.json();
        if (!b || !b.token) return false;
        localStorage.setItem("pdd_token", b.token);
        localStorage.setItem("pdd_name", b.profile?.name || "ui_val");
        return true;
      } catch { return false; }
    });
    if (!authed)
      return [{ invariant_id: "B-UI-004", layer: "behavioral", severity: "must", outcome: "fail",
        evidence: "could not authenticate via /api/account/signup — CompletedEvent POST interception impossible" }];
    await sp.page.reload({ waitUntil: "networkidle0" });
    await setWordsMode(sp.page, selectors);
    await focusWords(sp.page, selectors);
    const { targets } = await readTargets(sp.page, selectors);
    // scripted perfect run: every word correct + space (final word completes on last char)
    for (let wi = 0; wi < targets.length; wi++) {
      for (const ch of targets[wi]) await sp.page.keyboard.press(ch);
      if (wi < targets.length - 1) await sp.page.keyboard.press("Space");
    }
    await sp.page.evaluate(settle);
    await sleep(400); // finish() renders results and POSTs async

    const view = await sp.page.evaluate((sel) => {
      const vis = (el) => !!el && (el.offsetParent !== null || getComputedStyle(el).display !== "none");
      const t = document.querySelector(sel.testView), r = document.querySelector(sel.resultView);
      const rs = document.querySelector(sel.resultStats);
      return { testVisible: vis(t), resultVisible: vis(r),
               resultText: (rs || r || document.body).innerText };
    }, selectors);

    const payload = sp.meta.resultPosts.at(-1);
    let wpm, acc, source;
    if (payload && typeof payload.wpm === "number" && typeof payload.acc === "number") {
      ({ wpm, acc } = payload); source = "POST /api/results interception";
    } else {
      // fallback: replay the captured feed() log through the repo engine
      try {
        const { TypingSession } = await import("../../../../implementation/src/engine/session.js");
        const feedLog = await sp.page.evaluate(() => window.__feedLog);
        const s = new TypingSession({ mode: "words", mode2: String(targets.length), words: targets, now: () => 0 });
        for (const ev of feedLog) s.feed(ev);
        const ev = s.completionEvent({ timestamp: 1, hash: "validator-replay" });
        ({ wpm, acc } = ev); source = "oracle replay of feed() log (no POST observed)";
      } catch (e) {
        return [{ invariant_id: "B-UI-004", layer: "behavioral", severity: "must", outcome: "fail",
          evidence: `no CompletedEvent observable: no POST intercepted and replay failed (${e.message})` }];
      }
    }

    const issues = [];
    if (view.testVisible) issues.push("test view not hidden after completed_event");
    if (!view.resultVisible) issues.push("results view not shown after completed_event");
    const txt = view.resultText ?? "";
    if (!txt.includes(String(wpm))) issues.push(`wpm ${String(wpm)} not present exactly in results text`);
    if (!txt.includes(String(acc))) issues.push(`acc ${String(acc)} not present exactly in results text`);
    // rounding detector: rounded variant present while exact value absent
    const roundedW = String(Math.round(wpm)), roundedA = String(Math.round(acc));
    if (!txt.includes(String(wpm)) && txt.includes(roundedW)) issues.push(`wpm appears rounded (${roundedW}) — non-conformant`);
    if (!txt.includes(String(acc)) && new RegExp(`\\b${roundedA}\\s*%`).test(txt)) issues.push(`acc appears rounded (${roundedA}%) — non-conformant`);

    return [{ invariant_id: "B-UI-004", layer: "behavioral", severity: "must",
      outcome: issues.length === 0 ? "pass" : "fail",
      evidence: issues.length ? issues.join(" | ")
        : `results view shows wpm=${String(wpm)} acc=${String(acc)} exactly (source: ${source}); test view hidden` }];
  } finally {
    await sp.close();
    ctx.artifactMetas.push(sp.meta);
  }
}
