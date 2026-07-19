// Manual UI test: real keyboard typing against the served frontend.
// Usage: start the server (npm start), then `node harness/manual-ui.mjs`.
import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--headless=new"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://localhost:8787/", { waitUntil: "networkidle0" });
await page.click("#mode"); await page.select("#mode", "words");
await new Promise((r) => setTimeout(r, 300));

const targets = await page.$$eval(".word", (els) => els.map((e) => e.textContent));
await page.click("#words");
const t0 = Date.now();
for (const w of targets) {
  for (const ch of w) await page.keyboard.type(ch, { delay: 45 + Math.random() * 60 });
  await page.keyboard.press("Space", { delay: 30 });
  if (await page.$eval("#result", (e) => !e.hidden)) break;
}
await new Promise((r) => setTimeout(r, 600));
const resultVisible = await page.$eval("#result", (e) => !e.hidden);
const stats = await page.$eval("#resultStats", (e) => e.innerText);
console.log("words mode completed -> result shown:", resultVisible);
console.log("stats:", stats.replace(/\n/g, " | ").slice(0, 200));
console.log("duration ~", ((Date.now() - t0) / 1000).toFixed(1) + "s");
console.log("js errors:", errors.length ? errors : "none");

await page.click("#next");
await page.click("#authbtn");
await page.type("#authName", "ui_tester");
await page.type("#authPass", "password123");
await page.click("#doSignup");
await new Promise((r) => setTimeout(r, 500));
const user = await page.$eval("#user", (e) => e.textContent);
console.log("signed up:", user);

await page.select("#mode", "time"); await page.select("#mode2", "15");
await new Promise((r) => setTimeout(r, 300));
await page.click("#words");
const end = Date.now() + 16000;
while (Date.now() < end) {
  const word = await page.$eval(".word.active", (e) => e.textContent);
  for (const ch of word) await page.keyboard.type(ch, { delay: 18 + Math.random() * 25 });
  await page.keyboard.press("Space", { delay: 10 });
  if (await page.$eval("#result", (e) => !e.hidden)) break;
}
await new Promise((r) => setTimeout(r, 800));
const save = await page.$eval("#saveStatus", (e) => e.textContent);
console.log("time-15 result save status:", save);
console.log("js errors:", errors.length ? errors : "none");
await browser.close();
