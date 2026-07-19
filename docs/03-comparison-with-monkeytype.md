# Comparison: pdd-typing vs. the original monkeytype

## 1. Similarity assessment

### Statistically identical (verified against reference source)
| Semantic | Reference source | Our protocol/impl | Match |
|---|---|---|---|
| wpm formula (correctWord chars /5 /min) | `packages/util`, `test-logic.ts` | B-ENG-001 + `shared/stats.js` | exact |
| rawWpm numerator (allCorrect+incorrect+extra) | `test-logic.ts` | B-ENG-001 | exact |
| consistency `kogasa(cov)=100(1-tanh(c+c³/3+c⁵/5))` | `packages/util/src/numbers.ts` | B-ENG-002 | exact |
| keyConsistency drops last spacing sample | `test-logic.ts` | B-ENG-002 | exact |
| char accounting (correct/incorrect/extra/missed, partial credit on active word) | `frontend/src/ts/utils/strings.ts countChars` | `engine/countChars.js` | exact (minus Hangul/IME paths) |
| validity bounds (350/420 wpm, acc 75..100 / 50..100 lbOptOut) | `test-logic.ts` | B-AC-001/002 | exact |
| chart arrays capped at 122 samples | `packages/schemas/results.ts` | S-ENG-001 | exact |
| modes time/words/quote/zen/custom | reference | S-ENG-003 | exact |
| quote length groups 0..3 | `packages/schemas/quotes.ts` | B-QT-002 | exact (ranges authored) |
| idempotent submit via client hash | reference CompletedEvent.hash | B-RES-002 | exact semantics |
| PB per (mode,mode2,language,punctuation,numbers) | reference PB logic | B-RES-003 | exact semantics |
| leaderboards time/15,time/60 english, wpm desc | reference | B-LB-001/002 | exact semantics |
| UI layout & serika-dark palette | monkeytype.com | `public/` | visually near-identical |

### Deliberately different (recorded as protocol decisions)
- **Auth**: HMAC tokens instead of Firebase (same protocol-visible semantics).
- **Persistence**: JSON store instead of MongoDB/Redis (repository handshake).
- **Anticheat**: reference module is closed-source; ours is an authored, fully-specified admission function (bounds + stat cross-check + key-timing plausibility). Ours is arguably *more* governable: every rejection carries machine-readable reason codes bound into the ledger.
- **Scope**: single language, no funbox/challenges/daily boards/presets/tags/themes, no command-line palette, no settings page, no result-history graphs.

## 2. Is the designed implementation better or worse?

**As a product: strictly worse** — it is a focused subset of monkeytype's feature surface (the reference has ~40 config keys, themes, funbox, challenges, APE keys, webhooks, PSAs, result history analytics, pace caret, replay, TTS).

**As an engineering artifact: better in the ways PDD cares about.**
- Every protocol-visible behavior is pinned by an invariant with a validator mapping; nothing is tribal knowledge. In the reference, the validity bounds and formulas live only in code.
- The implementation is *substitutable*: a team can regenerate any component against the sealed bundles without touching its neighbors (the paper's protocol-level substitutability).
- Admission is evidence-producing: every accepted build ships a signed E=H(P,I,V,R,t); every runtime interval appends to a tamper-evident ledger. The reference has CI tests but no evidence chain.
- Our anticheat is specified, deterministic, and fail-closed — the reference's is closed-source and unverifiable from the repo.

## 3. Invariants that would improve conformance further

Captured as protocol-evolution candidates (post-v1 analysis):

1. **O-RES-004 (ADOPTED in test-results v1.1.0)** — single response-emitting choke point. Origin: runtime blind spot MT-1; promoted from runtime evidence per the paper's Discovery-Log-promotion concept.
2. **B-ENG-008 (candidate)** — quote mode MUST carry quoteLength 0..3; zen sessions MUST record bailedOut=true (matches reference's zen handling of unfinished sessions).
3. **B-UI-001 (candidate)** — per-char presentation states (untyped/correct/incorrect/extra) MUST derive from the same per-position comparison as char accounting (prevents UI/engine drift).
4. **S-CFG-004 (candidate)** — theme enum registered in the config schema with default `serika_dark` (already the effective default; making it an enum prevents invalid theme references).
5. **O-UI-001 (candidate)** — word rendering MUST NOT re-layout committed words (reference behavior; constrains reflow for caret stability).

## 4. Iteration executed in this cycle

- test-results v1.0.0 → **v1.1.0** (version event, O-RES-004 promoted from runtime evidence).
- New operational validator check: static scan rejects `res.send/writeHead/sendStatus` outside the RVL/envelope choke point. Result: pass.
- Full loop re-run: 19/35/12 all pass; evidence re-built with version-aware digests; ledgers extended (re-admission blocks).
