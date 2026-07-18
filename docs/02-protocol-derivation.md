# Protocol-set derivation from the monkeytype reference

Orchestrator-only analysis (authors never saw the repo). Reference: `github.com/monkeytypegame/monkeytype` @ master (v26.28.0), pnpm monorepo: `frontend/` (TS), `backend/` (Express + MongoDB + Redis), `packages/` (zod schemas, ts-rest contracts, util).

## Reference architecture inventory

| Area in reference | Key facts extracted (used to answer author Q&A) |
|---|---|
| Test engine (`frontend/src/ts/test/*`) | Event-sourced session: event log -> chars/stats. Modes: `time`, `words`, `quote`, `zen`, `custom`. Live WPM/acc/burst per second. Caret, timer, restart, bail-out. |
| Stats (`utils/numbers.ts`, `packages/util`) | `wpm = correctWordChars/5 / (sec/60)`; `rawWpm = (allCorrect+incorrect+extra)/5 / (sec/60)`; `consistency = kogasa(stddev/mean)` with `kogasa(cov)=100*(1-tanh(cov+cov^3/3+cov^5/5))`; keyConsistency on keypress spacing (last sample dropped); wpmConsistency on wpm history. All rounded to 2dp. |
| Result validity (`test-logic.ts`) | Invalid if: repeated test; `wpm<0` or `wpm>350` (`>420` for mode=words, mode2=10); same for rawWpm; `acc<75 or acc>100` (`50..100` when lbOptOut). charStats = [correct, incorrect, extra, missed] (ints, nonneg). chartData arrays capped at 122 samples (schema max 122). |
| Result schema (`packages/schemas/results.ts`) | CompletedEvent: wpm, rawWpm, charStats[4], acc(>=50,<=100), mode, mode2, quoteLength(0..3, quote mode only), timestamp, testDuration(>=1), consistency, keyConsistency, wpmConsistency, chartData|`"toolong"`, keySpacing/keyDuration arrays, keyOverlap, afkDuration, restartCount, incompleteTests[{acc,seconds}], tags, language, punctuation/numbers/lazyMode/blindMode/stopOnLetter flags, bailedOut, difficulty, funbox, customText (custom mode only), hash (client token). |
| Anticheat (`backend/src/anticheat`) | OSS repo ships a STUB (real module private): `validateResult(result, version, ua, lbOptOut)` and `validateKeys(result, keySpacingStats, keyDurationStats, uid)`. Observable contract: boolean admission + the validity bounds above; key-timing stats {average, sd} computed server-side. |
| Leaderboards | Per-mode boards: `time` mode, mode2 `15`/`60`, english. Entry: wpm, rawWpm, acc, consistency, timestamp, uid/name, rank. Eligibility derived from valid, non-bailed results. |
| Quotes | Quote: `_id`, `text`, `source`, `language`, `length` group 0..3 (groups are 4 length ranges), `approved` flag; rating submission; random-quote fetch by language. |
| Configs | GET/PUT per-user settings object (mode, mode2, language, punctuation, numbers, themes, etc.), validated by zod schema; presets. |
| Users | Signup/login (Firebase in reference; we abstract to token auth), profile (name, addedAt), personal bests per mode/mode2, result history, tags. |

## Derived protocol set (7 protocols)

| # | Protocol | Boundary (in scope) | Depends on |
|---|---|---|---|
| P1 | `typing-test-engine` | Client-side test session: word generation, keystroke processing, caret/timer semantics, live stats, completion event production | user-config, quote-library |
| P2 | `test-results` | Result submission, validation, persistence, personal bests, history query | user-account, result-anticheat, typing-test-engine |
| P3 | `user-account` | Signup, login, token issuance/verification, profile | — |
| P4 | `user-config` | Config get/put, schema validation, defaults, partial merge | user-account |
| P5 | `quote-library` | Quote storage, random fetch by language+length group, submission + approval, rating | user-account |
| P6 | `leaderboards` | Ranked boards (time 15/60), eligibility, rank computation | test-results, user-account |
| P7 | `result-anticheat` | Result plausibility admission (bounds + key-timing analysis), fail-closed verdict | — |

Interdependency rule enforced by negotiation: P2 consumes P1's CompletedEvent handshake and P7's verdict handshake; P6 consumes P2's stored-result shape; P4/P5 consume P3's auth-token handshake. P1 consumes P4's config shape and P5's quote shape. No cycles (P1 is a client of P4/P5 read APIs only).

## Explicit simplifications (recorded as orchestrator decisions)
- Persistence: in-memory + optional JSON snapshot instead of MongoDB/Redis (operational invariant: durability mechanism abstracted behind repository handshake).
- Auth: HMAC bearer tokens instead of Firebase (same protocol-visible semantics: issue/verify/revoke).
- Anticheat: reference implementation is closed; protocol specifies only observable admission semantics + key-timing stats contract.
- Funbox/challenges/ape-keys/webhooks/themes: out of scope for v1 protocols (documented as excluded boundary).
