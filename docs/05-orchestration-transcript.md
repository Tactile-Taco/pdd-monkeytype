# Orchestration transcript — greenfield protocol authoring for a typing-test platform

Convention: `Orchestrator` is the only agent with access to the reference repo. Each `Author(<protocol>)` has the `pdd-protocol-author` skill, the mediated-Q&A rule, and no reference access. All exchanges in natural language; formal facts from the reference are marked **[REF]**. This transcript is abridged to decision-relevant exchanges; the full Q&A set is mirrored in each bundle's `ambiguity-log.md` (provenance `orchestrator`).

---

## Session 1 — bootstrap

**Orchestrator -> Team:** We are recreating a typing-test web application as greenfield PDD protocols. Seven protocol domains, one author each: typing-test-engine, test-results, user-account, user-config, quote-library, leaderboards, result-anticheat. You may not access the reference. Ask me anything about technical needs; I answer from the reference and mark it [REF]. Ambiguity I cannot resolve becomes an open question in your ambiguity log. Target: draft bundles, then negotiation, then sealing.

**Author(user-account) -> Orchestrator:** What is the auth surface? Social login? Email? Tokens?
**Orchestrator:** [REF] Reference uses an external identity provider with bearer tokens; clients attach the token to API calls. For our protocols, abstract to: credential signup/login, opaque bearer token issuance, token verification on protected routes, token revocation. No provider dependency — that's an operational-invariant point.

**Author(typing-test-engine) -> Orchestrator:** What exactly is a "test"? What does the engine produce at the end?
**Orchestrator:** [REF] A test is an event-sourced keystroke session. Modes: `time`, `words`, `quote`, `zen`, `custom`. The engine produces a completion event with: final stats (wpm, rawWpm, acc, consistency, keyConsistency, wpmConsistency), char stats [correct, incorrect, extra, missed], per-second chart data (wpm, raw/burst, errors — capped at 122 samples), key timing arrays, duration, afk time, restart count, incomplete-test log, and the mode/config snapshot.

---

## Session 2 — Author(typing-test-engine)

**Author(typing-test-engine) -> Orchestrator:** Q1: precise WPM formula?
**Orchestrator:** [REF] `wpm = (correctWordChars / 5) / (testSeconds / 60)`. `rawWpm` substitutes `(allCorrect + incorrect + extra)` for the numerator. Guard: duration <= 0 => 0. Round to 2 decimals.
**Author:** Q2: consistency?
**Orchestrator:** [REF] `consistency = kogasa(stddev(burstPerSecond)/mean(burstPerSecond))`, where `kogasa(c) = 100 * (1 - tanh(c + c^3/3 + c^5/5))`. NaN/0 => 0. `keyConsistency` applies the same to keypress spacings with the LAST spacing sample dropped; `wpmConsistency` applies it to the per-second wpm history.
**Author:** Q3: how do errors behave mid-test — can the user skip words, correct mid-word?
**Orchestrator:** [REF] Typed chars beyond a word's length count as `extra`. Chars not attempted when a word is submitted count as `missed`. Backspace edits within the current word. Space commits the word and advances. `stopOnLetter` config can halt on first wrong letter. Zen mode has no target text (freeform) and never completes — it is ended by user action.
**Author:** Q4: are live stats part of the protocol or UI detail?
**Orchestrator:** [REF] Live per-second stats feed the result's chartData and burst history, so per-second sampling is protocol-visible; rendering is out of scope. Record as: B-invariant on sampling correctness, O-invariant "no network during an active test".
**Author(typing-test-engine):** Draft ready. 5 structural, 7 behavioral, 4 operational invariants. One open question: whether quote-mode text length group is engine-visible (answered later by P5: yes, 0..3).

## Session 3 — Author(test-results)

**Author(test-results) -> Orchestrator:** Q1: which results are admissible to store?
**Orchestrator:** [REF] Client marks invalid and skips save when: repeated test; wpm<0 or wpm>350 (bound 420 for words/10); rawWpm same bounds; acc outside [75,100] ([50,100] if user opted out of leaderboards). Server-side, results pass an anticheat admission + schema validation before persistence. Also schema floor: acc>=50 always, testDuration>=1s.
**Author:** Q2: personal bests?
**Orchestrator:** [REF] PB tracked per (mode, mode2, language, punctuation, numbers) tuple; a stored result with wpm strictly greater than the current PB for its tuple becomes the new PB (`isPb`).
**Author:** Q3: idempotency of submission?
**Orchestrator:** [REF] Reference dedupes by a client hash field; repeated submission of the same hash must not double-store. (I'll confirm: the CompletedEvent carries a `hash` token <=100 chars.) Treat as: same (uid, hash) => return originally stored record, no second write.
**Author:** Q4: what may be queried?
**Orchestrator:** [REF] Result history for the authenticated user, plus PBs. Large chart/key arrays may be elided in list responses ("toolong" literal exists for oversized arrays).
**Author(test-results):** Draft ready. Depends on user-account (identity), result-anticheat (admission verdict), typing-test-engine (consumes completion-event handshake).

## Session 4 — Author(user-account)

**Author(user-account) -> Orchestrator:** Q1: password rules?
**Orchestrator:** No [REF] constraint worth copying; set our own explicit rule: min 8 chars, stored only as salted hash (record as assumption, severity must, operational: plaintext passwords never logged/persisted).
**Author:** Q2: token semantics?
**Orchestrator:** [REF-abstracted] Opaque bearer; verification on every protected route; expired/unknown token => 401 error envelope. Add expiry (24h) as our assumption — reference delegates expiry to the provider.
**Author:** Q3: usernames?
**Orchestrator:** [REF] Unique, case-insensitive matching, profile has name + addedAt; we add: name regex `^[a-zA-Z0-9_-]{3,16}$`.
**Author(user-account):** Draft ready. Provides `auth-token` handshake. No dependencies.

## Session 5 — Author(user-config)

**Author(user-config) -> Orchestrator:** Q1: shape of config?
**Orchestrator:** [REF] A flat-ish settings object: mode, mode2, language, punctuation, numbers, difficulty, blindMode, stopOnError, theme, plus many UI preferences. For protocol purposes: defined keys with typed values + enums; unknown keys rejected; GET returns full effective config (defaults merged).
**Author:** Q2: partial updates?
**Orchestrator:** [REF] Clients save partial updates; missing keys keep prior/default values. Invalid enum value => 422, no partial write of the invalid key set.
**Author(user-config):** Draft ready. Depends on user-account. Provides `user-config` handshake.

## Session 6 — Author(quote-library)

**Author(quote-library) -> Orchestrator:** Q1: quote model?
**Orchestrator:** [REF] Quote: id, text, source, language, length, length group 0..3 (four configured length ranges), approved flag. Random fetch by language (+optional group) returns only approved quotes.
**Author:** Q2: submission flow?
**Orchestrator:** [REF] Users submit quotes; they enter a pending state until approved by a moderator. Rating: users rate quotes; average rating exposed with the quote.
**Author:** Q3: duplicate submissions?
**Orchestrator:** No explicit [REF]; adopt: identical (language, normalized text) submission is idempotent — returns existing pending/approved quote.
**Author(quote-library):** Draft ready. Depends on user-account. Provides `quote` handshake (consumed by typing-test-engine for quote mode).

## Session 7 — Author(leaderboards)

**Author(leaderboards) -> Orchestrator:** Q1: which boards exist?
**Orchestrator:** [REF] Boards keyed by (mode=time, mode2 in {15,60}, language=english). Entries rank by wpm desc; tie-break: earlier timestamp wins.
**Author:** Q2: eligibility?
**Orchestrator:** [REF] Only VALID stored results (passed anticheat, not bailed out, acc within bounds). A user's best valid result per board appears once.
**Author:** Q3: rank pagination?
**Orchestrator:** [REF-abstracted] Top-N query (N<=100 default 50) + the requesting user's own entry + rank. Board updates are eventually consistent is acceptable — but simpler: recompute on read from admitted results (state it as a B-invariant: board reflects all admitted eligible results at read time).
**Author(leaderboards):** Draft ready. Depends on test-results, user-account.

## Session 8 — Author(result-anticheat)

**Author(result-anticheat) -> Orchestrator:** Q1: what does the anticheat actually check?
**Orchestrator:** [REF] The reference ships a stub — the production module is closed-source. Observable contract only: `validateResult(result, clientVersion, uaString, lbOptOut) -> bool` and `validateKeys(result, keySpacingStats, keyDurationStats, uid) -> bool`, where key stats are {average, sd}. So the protocol must specify OUR admissibility semantics explicitly.
**Author:** Then I need ground rules. Propose: (a) hard bounds as in P2's validity rules; (b) key-timing plausibility — median key spacing below 20ms or spacing sd ~0 across >=50 keystrokes is implausible; (c) wpm/consistency cross-check — claimed wpm must be reproducible from charTotal and testDuration within 0.5; (d) verdict is fail-closed: malformed or missing key data on a result that claims leaderboard eligibility => reject from leaderboard eligibility but MAY store flagged. Confirm?
**Orchestrator:** Confirmed as our authored semantics — mark provenance `assumption (reference is closed-source)`. One correction: make (c) tolerance 1.0 wpm to absorb client rounding (roundTo2 of a duration measured in ms).
**Author(result-anticheat):** Draft ready. Provides `anticheat-verdict` handshake. No dependencies (must stay independent of P2's storage to preserve admission authority).

---

## Session 9 — Contract negotiation (Negotiator + all authors)

**Negotiator:** Built dependency graph; ran `check_compatibility.py`. Three open conflicts:

1. **C1 — semantic-collision:** `typing-test-engine` defined `charStats` as an object `{correct, incorrect, extra, missed}`; `test-results` consumes the reference-shaped tuple `[correct, incorrect, extra, missed]` **[REF]**. Resolution: provider (P1) yields — tuple with fixed positions is the handshake; P1 B-invariant updated to emit tuple. Engine author accepted.
2. **C2 — capability-gap:** `test-results` O-invariant "no synchronous calls to result-anticheat over network" assumed in-process verdict; `result-anticheat` O-invariant declared "verdict computed within 5ms, in-process" — actually compatible, but P6 `leaderboards` assumed it can read P2's stored results directly ("database read access"). P2's capability manifest grants NO cross-component DB reads. Resolution: strengthen provider — P6 consumes P2's published `stored-result` read handshake (service call), not the database. P6 author accepted; P2 added `provides: stored-result-reader`.
3. **C3 — severity-conflict:** `leaderboards` treated "result passed anticheat" as implied; `result-anticheat` exports the verdict as `must`-severity, but P2 stored the verdict as advisory `should`. Resolution: verdict recorded on the stored result is `must`; leaderboard eligibility filter reads only stored verdicts. All three recorded in `negotiation-minutes.md`.

**Negotiator:** Compatibility re-run: zero conflicts. **Orchestrator:** Sealing all seven bundles at v1.0.0. Registry frozen; generation may begin.

---

## Gate summary after authoring phase

- draft-complete: 7/7 (all pass `check_bundle.py`)
- negotiated: 7/7 (3 conflicts resolved)
- sealed: 7/7 @ v1.0.0
