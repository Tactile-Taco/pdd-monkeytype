# Brownfield gap analysis — monkeytype.com feature inventory vs PDD MVP

Orchestrator-only reference analysis (2026-07-20). Confidence: high unless marked [verify];
per-domain ground-truthing against the reference repo happens at authoring time
(precedent: before-delete.ts for B-ENG-005).

## MVP baseline (current, sealed + live)
- Test modes: time (15/30/60/120), words (10/25/50/100), quote, zen [verify zen scope]
- Engine: keystroke semantics v1.1.0 (backspace retreat rule), wpm/acc/consistency
  (kogasa), raw/burst stats, anticheat basic (duration vs keystrokes envelope)
- Accounts: signup/login (scrypt/HMAC tokens), user-config round-trip (theme string)
- Quotes: random quote endpoint (S-QT-001), leaderboards 15/60 (S-LB-001)
- Results: completed-event → results screen (wpm/acc), ui-presentation v1.0.0 (caret,
  tokens, contrast charter)
- Deployments: Node/Express + Workers candidates, KV store, no RVL on Workers

## Full reference inventory → gap domains

### D1 test-config (HIGH priority — engine core)
Custom mode (user-defined time/word count), punctuation mode, numbers mode,
stop-on-error (letter/word), confidence mode (no backspace), tape mode (horizontal
scroll), lazy mode (auto accents/diacritics), quick-restart (tab), blind mode
(hide errors), freedom mode [verify], strict-space [verify], opposite-shift [verify],
min speed/acc custom thresholds [verify], bilingual [verify].
Engine impact: config object drives test generation + keystroke rules →
typing-test-engine v2 candidate (version event path) or new bundle consuming engine.

### D2 commands-settings (HIGH — cross-cutting infra)
Command palette (esc → search all settings/actions), full settings schema:
behavior (quick tab, live wpm/acc/burst, timer style, smooth caret, caret style),
input (freedom, stop on error, confidence, opposite shift, keymap/layouts,
code indicators), sound (error/volume/click), caret+smoothness, theme (see D4),
account (see D8), presets (named config bundles, apply/save), import/export
settings JSON, danger zone (clear/reset).
Config schema versioning + migration becomes critical (user-config v2).

### D3 languages-wordlists (MEDIUM-HIGH)
~60 languages/groups, language groups, wordlist size tiers (10k/200 etc.),
quote language filter, language-specific leaderboards [verify].

### D4 themes-appearance (MEDIUM — builds on ui-presentation)
Theme catalog (~150 named themes), live theme preview, custom theme editor
(9 slots bg/main/caret/sub/text/error), share theme as URL/JSON, font family
selection (~30 fonts + custom), smooth caret, font size scale, flip test colors,
colorful error mode, random theme per test, favicon themes [verify].
ui-presentation v2 path: token charter already supports this; catalog is data.

### D5 results-history (HIGH — account value)
Result persistence per user (all modes), history page (sortable/filterable table,
mode filter, tag filter, date range), per-mode stats (tests completed, time typing),
personal bests per mode/config, wpm-over-time chart data, accuracy histogram,
activity calendar heatmap data, account-best averages (10/100 tests) [verify],
result tags (create/assign/filter), result sharing (screenshot URL) [verify].

### D6 quote-management (MEDIUM)
Quote submission (text/source/language → moderation queue states: pending/
approved/refused), quote rating (up/down per user, affects selection weight),
favorites, quote search/browse page, per-quote personal best [verify].

### D7 leaderboards-expansion (MEDIUM)
Daily leaderboards (per mode, rolling 24h [verify]), all-time boards with rank +
percentile ("top x%"), language-specific boards, XP accrual per test result,
level from XP, friends [verify D8].

### D8 profile-progression (LOW-MEDIUM)
Public profile pages (avatar, bio, keyboard, social links, join date, streaks:
current/max daily-test streak, XP/level), badges [verify], personal bests display,
name change history [verify], inbox/notifications [verify].

### D9 public-api (LOW)
ApeKeys (generate/revoke scoped API keys), REST surface: /results, /stats,
/profile, /quotes with strict rate limits + error envelopes, docs page.

### Explicitly EXCLUDED (recorded decision)
Ads, supporter payments/Stripe, Discord rich presence, captcha providers,
email verification flows, oauth providers (Google/GitHub login), admin
moderation dashboards, PSA system, dev-only endpoints. Rationale: monetization/
third-party integrations out of recreation scope; core product features only.

## Dependency notes
D2 (config schema v2) blocks D1/D4 presets; D5 depends on completed-event schema
stability (have); D7 XP feeds D8 profile; D3 wordlists feed D1 generation.
Suggested order: D2 → D1 → D4 → D5 → D3 → D6 → D7 → D8 → D9.
