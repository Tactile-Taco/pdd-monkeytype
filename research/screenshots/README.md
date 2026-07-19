# research/screenshots

A/B captures for the visual-design paper (stage-2). The GitHub mirror carries
the PNGs as 76-char-wrapped base64 split into message-sized parts
(`ab-v22-baseline.png.b64.part-*`, `ab-v30-candidate.png.b64.part-*`) because
the push channel is text-only; reassemble and decode with
`cat <name>.png.b64.part-* | base64 -d > <name>.png`. Canonical binaries live
in the primary checkout. SHA-256 of the decoded PNGs:

- `ab-v22-baseline.png`: eb5fdc7ef158536f37f476ad1f2fa8312c4930164346d3779bc7069fe755591a
- `ab-v30-candidate.png`: 16e29373caaa8f0a8e8393e2fdbb289dbd0f13abee7878ec299919b908b02bf8
