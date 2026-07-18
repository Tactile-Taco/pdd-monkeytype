import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Loads every *.schema.json in a bundle's schemas/ dir; $ref like "x.schema.json" resolves by filename.
export function loadBundle(bundleDir) {
  const dir = join(bundleDir, "schemas");
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const files = readdirSync(dir).filter((f) => f.endsWith(".schema.json"));
  const schemas = {};
  for (const f of files) {
    const s = JSON.parse(readFileSync(join(dir, f), "utf8"));
    schemas[f] = s;
    ajv.addSchema(s, f);
  }
  const validate = (file, data) => {
    const v = ajv.getSchema(file) || ajv.compile(schemas[file]);
    const ok = v(data);
    return { ok, errors: v.errors ?? [] };
  };
  return { schemas, validate };
}
