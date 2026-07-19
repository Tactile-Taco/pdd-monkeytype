#!/usr/bin/env python3
"""O-UI-005 pixel diff (validation-plan tolerances.screenshot):
fraction of pixels whose max per-channel abs delta <= tol (default 16) must be
>= min_similar (default 0.85). Same-host captures only (enforced by caller via
manifest host_image_id). Prints a single JSON line.
Usage: pngdiff.py BASELINE.png CANDIDATE.png [--tol 16] [--min-similar 0.85]
Exit 0 when similar_fraction >= min_similar AND dimensions match, else 1.
"""
import argparse, hashlib, json, sys

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("baseline"); ap.add_argument("candidate")
    ap.add_argument("--tol", type=int, default=16)
    ap.add_argument("--min-similar", type=float, default=0.85)
    a = ap.parse_args()
    try:
        from PIL import Image
        import numpy as np
    except ImportError as e:
        print(json.dumps({"error": f"Pillow/numpy unavailable: {e}"})); return 2
    def load(p):
        with open(p, "rb") as f: raw = f.read()
        img = Image.open(p).convert("RGBA")
        return raw, img
    raw_a, ia = load(a.baseline); raw_b, ib = load(a.candidate)
    out = {"baseline": a.baseline, "candidate": a.candidate,
           "sha256_baseline": hashlib.sha256(raw_a).hexdigest(),
           "sha256_candidate": hashlib.sha256(raw_b).hexdigest(),
           "tol": a.tol, "min_similar": a.min_similar}
    if ia.size != ib.size:
        out.update({"pass": False, "reason": f"dimension mismatch {ia.size} vs {ib.size}"})
        print(json.dumps(out)); return 1
    x = np.asarray(ia, dtype=np.int16); y = np.asarray(ib, dtype=np.int16)
    delta = np.abs(x - y)[:, :, :3].max(axis=2)          # per-pixel max RGB channel delta
    similar = float((delta <= a.tol).mean())
    out.update({"pass": similar >= a.min_similar, "similar_fraction": round(similar, 6),
                "width": ia.size[0], "height": ia.size[1], "pixels": int(delta.size)})
    print(json.dumps(out)); return 0 if out["pass"] else 1

if __name__ == "__main__":
    sys.exit(main())
