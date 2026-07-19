// JSON-file store with write counting (supports O-*-001 "max writes per request" checks).
// Repository handshake: other components never touch files directly.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class Store {
  constructor(path, seed = null) {
    this.path = path;
    this.writeCount = 0;
    this.data = {};
    if (existsSync(path)) {
      try { this.data = JSON.parse(readFileSync(path, "utf8")); } catch { this.data = {}; }
    } else if (seed) {
      this.data = seed;
      this._persist();
    }
  }
  _persist() {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }
  // One logical write per request budget — callers batch mutations into commit().
  commit(mutator) {
    const out = mutator(this.data);
    this.writeCount += 1;
    this._persist();
    return out;
  }
  read() { return this.data; }
}
