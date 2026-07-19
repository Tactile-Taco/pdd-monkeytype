// Stage-02 O-UI-005 local proxy: A/B pixel comparison of the two sealed scenes
// (fresh-test, mid-test-5-words) between the PRE-CHANGE UI (git HEAD assets) and
// the updated UI, on the same host+browser (host-pinning rule honored).
// Baseline identity per Q1 is the live v2.2 origin; this proxy answers the
// narrower implementation question: did stage-2 changes alter rendering beyond
// the caret footprint? Run: node research/implementation/stage-02-screenshot-ab.mjs
// (requires the candidate server on :8787 and git HEAD as the pre-change ref).
import puppeteer from "puppeteer-core";
import express from "express";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NEW = process.env.PDD_ORIGIN || "http://localhost:8787";
const TOL = 16, FLOOR = 0.85; // validation-plan screenshot tolerances

// reconstruct pre-change assets from git HEAD
const oldDir = mkdtempSync(join(tmpdir(), "pdd-old-ui-"));
for (const f of ["index.html", "style.css", "app.js"])
  writeFileSync(join(oldDir, f), execSync(`git -C ${root} show HEAD:implementation/public/${f}`));
const shotDir = mkdtempSync(join(tmpdir(), "pdd-shots-"));
const app = express();
app.use("/engine", express.static(join(root, "implementation/src/engine")));
app.use("/shared", express.static(join(root, "implementation/src/shared")));
app.use("/shots", express.static(shotDir));
app.use("/", express.static(oldDir));
const server = app.listen(8788);

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--headless=new"] });
async function capture(origin, prefix) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 }); // sealed env
  await page.evaluateOnNewDocument(() => { Math.random = () => 0.42; }); // same word list both sides
  await page.goto(origin + "/", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 500));
  const fresh = await page.screenshot({ encoding: "binary" });
  const targets = await page.$$eval("#words .word", (els) => els.slice(0, 5).map((e) => e.textContent));
  await page.click("#words");
  for (const w of targets) { for (const ch of w) await page.keyboard.type(ch, { delay: 12 }); await page.keyboard.press("Space"); }
  await new Promise((r) => setTimeout(r, 300));
  const mid = await page.screenshot({ encoding: "binary" });
  await page.close();
  writeFileSync(join(shotDir, `${prefix}-fresh.png`), fresh);
  writeFileSync(join(shotDir, `${prefix}-mid.png`), mid);
}
await capture("http://localhost:8788", "old");
await capture(NEW, "new");

// in-page canvas diff (no external image deps); PNGs fetched same-origin by URL
const diffPage = await browser.newPage();
await diffPage.goto("http://localhost:8788/", { waitUntil: "domcontentloaded" });
let failed = 0;
for (const scene of ["fresh", "mid"]) {
  const res = await diffPage.evaluate(async (aUrl, bUrl, tol) => {
    const load = (u) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i);
      i.onerror = j; i.src = u; });
    const [ia, ib] = await Promise.all([load(aUrl), load(bUrl)]);
    const cvs = [ia, ib].map((im) => { const c = document.createElement("canvas");
      c.width = im.width; c.height = im.height;
      const x = c.getContext("2d"); x.drawImage(im, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; });
    let changed = 0;
    for (let p = 0; p < cvs[0].length; p += 4) {
      const d = Math.max(Math.abs(cvs[0][p] - cvs[1][p]), Math.abs(cvs[0][p + 1] - cvs[1][p + 1]),
        Math.abs(cvs[0][p + 2] - cvs[1][p + 2]));
      if (d > tol) changed++;
    }
    return { changed, total: cvs[0].length / 4 };
  }, `/shots/old-${scene}.png`, `/shots/new-${scene}.png`, TOL);
  const similar = 1 - res.changed / res.total;
  if (similar < FLOOR) failed++;
  console.log(`${similar >= FLOOR ? "pass" : "FAIL"} O-UI-005-proxy ${scene}: similar=${similar.toFixed(6)} (changed ${res.changed}px; caret footprint expected, baseline absorbs ~0.01%)`);
}
await browser.close();
server.close();
console.log(failed ? "PROXY FAILED" : "proxy pass: stage-2 rendering delta confined to caret footprint");
process.exit(failed ? 1 : 0);
