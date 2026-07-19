# Base64 PNG parts — integrity status (authoritative)

The PNG evidence is transported as wrapped-base64 parts (`*.png.b64.part-NNN`).
Reassemble per file with:

```
cat <name>.png.b64.part-* | base64 -d > <name>.png
```

(Part sizes may mix; `base64 -d` ignores newlines, so only part ORDER matters.)

Expected decoded SHA-256 anchors are recorded in `manifest.json` (this directory)
and in `research/screenshots/README.md` for the A/B screenshots.

## Status of parts in this repo (verified by git blob SHA vs local `git hash-object`)

### fresh-test.png.b64 — INCOMPLETE, mixed status
- GOOD (hash-verified): part-005, part-006, part-007 (blob SHAs 5d2618af12880e11a1ace2f993ceee766a867a30, 63c2a89be00468d0806591098e9485965da33522, 78ed18fd7752d2aaefb5ace0d2585c203cafffd1)
- CORRUPT (silent truncation during MCP transport): part-001..004, part-008..013 as of this writing; the 130-line re-push effort is replacing them with parts 001..022 (001-012 @130 lines, 013-022 @90 lines). Check `B64-STATUS` updates or verify locally via `git hash-object` against the manifest before relying on any part.

### mid-test-5-words.png.b64 — CORRUPT part-001 only; parts 002+ not yet pushed
- part-001 is silently truncated (16,287 bytes; expected 38,500 for 500 lines).
- Planned replacement: 17 parts of 130 lines (mid-test-5-words.png.b64.part-001..017).

### research/screenshots/ab-v22-baseline.png.b64, ab-v30-candidate.png.b64
- Not yet pushed (planned: 130-line parts, 22 and 23 parts respectively).

## Why parts were corrupt
The GitHub MCP `push_files` transport silently truncates large file-content strings
at a stochastic per-call threshold (~7-20KB in this session). Every part listed
as GOOD above was verified by exact git blob SHA comparison against the canonical
local source; any part not so verified must be treated as untrusted.
