# O-UI-005 screenshot baseline set

Populated by the validator harness at validator-authoring time (stage 3),
captured from the live v2.2 origin:

    https://pdd-monkeytype.pdd-typing.workers.dev

Adjudicated round 2 (Q1): baseline is the **pre-caret** reference aesthetic;
the caret's ~0.01% pixel footprint is absorbed by the 0.85 similar-pixel
threshold. Re-baselining after the caret lands is a **minor version event**.

## Capture requirements (per O-UI-005 / validation-plan.yaml)

- Viewport 1280x800, deviceScaleFactor 1, default theme.
- Quote/config API responses pinned by the validator (deterministic content).
- Scenes: (1) `fresh-test.png`, (2) `mid-test-5-words.png`.
- Record per capture: SHA-256, host image id, Chromium version, capture date.
- Comparisons are admitted only between captures from the SAME host image
  (system font rasterization is host-dependent).

## GitHub mirror note: `.png.b64` siblings (lossless encoding)

The GitHub copy of this directory (pushed via the GitHub MCP `push_files`
channel, which is text-only and would corrupt binary payloads) carries the two
scene PNGs as 76-char-wrapped base64, split into message-sized parts:
`fresh-test.png.b64.part-*` and `mid-test-5-words.png.b64.part-*`.
They are byte-lossless — reassemble and decode with:

    cat fresh-test.png.b64.part-* | base64 -d > fresh-test.png
    cat mid-test-5-words.png.b64.part-* | base64 -d > mid-test-5-words.png

Verify after decoding against the SHA-256 values in `manifest.json`
(e.g. `sha256sum fresh-test.png`). The canonical binary artifacts remain in
the team's primary repo checkout; the same encoding applies to
`research/screenshots/*.png.b64.part-*`.
