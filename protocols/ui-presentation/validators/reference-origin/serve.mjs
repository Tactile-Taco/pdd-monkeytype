// Reference-origin server: serves the pinned v2.2 bytes (assets/) plus pinned,
// schema-shaped same-origin /api/* stubs, mimicking the live v2.2 origin
// (https://pdd-monkeytype.pdd-typing.workers.dev). Zero dependencies (node:http).
// Used for O-UI-005 baseline capture and smoke runs on egress-restricted hosts.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "assets");
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
               ".js": "text/javascript; charset=utf-8", ".json": "application/json" };

const PINNED_QUOTE = {
  id: "pinned-quote-1",
  text: "the quick brown fox jumps over the lazy dog near the river bank",
  source: "validator-pinned", language: "english", length: 62, group: 0,
  approved: true, rating: { average: 0, count: 0 },
};
const PINNED_CONFIG = { mode: "time", mode2: "30", punctuation: false, numbers: false,
                        difficulty: "normal", theme: "default", language: "english" };

const json = (res, status, body) => {
  const b = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(b) });
  res.end(b);
};

export async function serveReferenceOrigin({ port = 0 } = {}) {
  const server = createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const p = u.pathname;
    if (p.startsWith("/api/")) {
      if (p === "/api/account/signup" || p === "/api/account/login")
        return json(res, 200, { token: "replica-token-" + Math.random().toString(36).slice(2, 10),
                                profile: { name: "replica_user", created: 1752000000000 } });
      if (p === "/api/account/logout") return json(res, 200, { ok: true });
      if (p === "/api/quotes/random") return json(res, 200, PINNED_QUOTE);
      if (p === "/api/config") return json(res, 200, PINNED_CONFIG);
      if (p === "/api/results" && req.method === "POST") {
        let body = "";
        req.on("data", (c) => (body += c));
        return req.on("end", () => json(res, 201, { id: "r-" + Date.now(), uid: "replica",
          wpm: 0, rawWpm: 0, acc: 0, mode: "words", mode2: "10", language: "english",
          timestamp: Date.now(), testDuration: 1, consistency: 0, isPb: false,
          bailedOut: false, anticheat: { decision: "admit", reasons: [] } }));
      }
      if (p === "/api/results") return json(res, 200, { results: [] });
      if (p.startsWith("/api/leaderboards/")) return json(res, 200, { mode2: p.split("/").pop(), entries: [] });
      return json(res, 404, { error: { code: "not_found", message: "no such route", correlation_id: "replica" } });
    }
    const file = p === "/" ? "index.html" : p.slice(1);
    const full = join(ASSETS, file);
    if (!full.startsWith(ASSETS) || !existsSync(full)) {
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("not found");
    }
    const ext = file.slice(file.lastIndexOf("."));
    const body = readFileSync(full);
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream",
                         "content-length": body.length, "cache-control": "no-store" });
    res.end(body);
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const { port: bound } = server.address();
  return { url: `http://127.0.0.1:${bound}`, close: () => new Promise((r) => server.close(r)) };
}

// Standalone: node serve.mjs [port]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const s = await serveReferenceOrigin({ port: Number(process.argv[2] || 8901) });
  console.log("reference origin (v2.2 replica) listening at", s.url);
}
