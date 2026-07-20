// Abstract wordlist handshake (typing-test-engine S-ENG-004).
// Word lists injected at session start must conform to
// protocols/typing-test-engine/schemas/wordlist.schema.json:
//   { language: string(>=1), words: string[](>=1, each >=1), id?: string(<=100),
//     ordered?: boolean } — additional properties tolerated (schema: true).
// Fail-closed: a non-conforming list is rejected BEFORE the first keystroke and
// never starts a session (the session constructor throws).
// Hand-rolled validation keeps the engine at zero runtime dependencies
// (O-ENG-003); the harness independently schema-validates with ajv.
import { generateWords, decorateWords, mulberry32, ENGLISH_200 } from "./words.js";

export function validateWordlist(wl) {
  const errs = [];
  if (!wl || typeof wl !== "object" || Array.isArray(wl)) return ["wordlist object required"];
  if (typeof wl.language !== "string" || wl.language.length < 1) errs.push("language: non-empty string required");
  if (!Array.isArray(wl.words) || wl.words.length < 1) errs.push("words: array of >=1 words required");
  else if (wl.words.some((w) => typeof w !== "string" || w.length < 1)) errs.push("words: every entry a non-empty string");
  if (wl.id !== undefined && (typeof wl.id !== "string" || wl.id.length > 100)) errs.push("id: string <=100 chars");
  if (wl.ordered !== undefined && typeof wl.ordered !== "boolean") errs.push("ordered: boolean");
  return errs;
}

export function isValidWordlist(wl) { return validateWordlist(wl).length === 0; }

// Internal default provider (S-ENG-004: internal lists remain the default
// provider; the wordlists bundle plugs in later with no engine re-versioning).
// Deterministic given (language, count, seed, decoration toggles) — B-ENG-006/009(d).
export function internalWordlist({ language = "english", count = 50, seed = 1,
                                   punctuation = false, numbers = false,
                                   list = ENGLISH_200 } = {}) {
  const base = generateWords(count, seed, list);
  // Independent decoration stream derived from the same seed (B-ENG-009(d)).
  const rnd = mulberry32(((seed ^ 0x9e3779b9) >>> 0) || 1);
  const words = decorateWords(base, rnd, { punctuation, numbers });
  return { id: `internal/${language}`, language, words };
}
