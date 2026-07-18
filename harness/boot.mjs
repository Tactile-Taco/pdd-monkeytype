import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../implementation/src/server/app.js";

// Starts the implementation on an ephemeral port with a temp data dir.
export async function bootApp({ ledgerDir = null, heartbeatMs } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "pdd-data-"));
  const app = createApp({ dataDir, implVersion: "candidate", ledgerDir, ...(heartbeatMs ? { heartbeatMs } : {}) });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = "GET", body, token } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, body: json };
  };
  const signup = async (name, password = "password123") => {
    const r = await call("/api/account/signup", { method: "POST", body: { name, password } });
    return r.body?.token;
  };
  return { base, call, signup, close: () => server.close(), dataDir, app };
}

// A deterministic, protocol-valid completion event generator for tests.
export function makeEvent(over = {}) {
  const ev = {
    wpm: 80.5, rawWpm: 84, acc: 95.5,
    charStats: [100, 4, 1, 0], charTotal: 105,
    mode: "time", mode2: "15", testDuration: 15, timestamp: 1752000000000,
    consistency: 70.2, keyConsistency: 55.1, wpmConsistency: 65.3,
    chartData: { wpm: [80, 81], burst: [7, 7], err: [0, 0] },
    keySpacing: [120, 110, 130], keyDuration: [80, 75, 90],
    restartCount: 0, afkDuration: 0, bailedOut: false,
    language: "english", punctuation: false, numbers: false,
    blindMode: false, stopOnLetter: false,
    hash: "h-" + Math.random().toString(36).slice(2, 12), incompleteTests: [],
  };
  return { ...ev, ...over };
}
