#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Read the covenant chips on the top bar of a Stronghold Protocol rest frame.

Usage: python covnames.py <out.json> <png> [<png> ...]

Writes {"<png>": [{"text": "...", "score": 0.98, "box": [x1,y1,x2,y2]}, ...]}.

Why a separate sidecar: ocr.py is the full-frame reader that runs every round
(~5s). The covenant strip is a 160px band at the top; cropping it keeps the hot
path untouched and costs one short call per round instead.
"""

import json
import sys

from PIL import Image

import ocr as ocr_mod

# 图标 + 名字 + 层数都在这个带子里（1920x1080 实测：图标 y≈95..150、名字 y≈150..175）。
REGION = (300, 55, 1720, 215)


def main(argv):
    out_path, paths = argv[1], argv[2:]
    eng = ocr_mod.Engine()
    result = {}
    for p in paths:
        img = Image.open(p).convert("RGB")
        w, h = img.size
        x1, y1, x2, y2 = REGION
        box = (x1, y1, min(x2, w), min(y2, h))
        items = eng.run(img, box, scale=2)
        result[p] = [
            {"text": r["text"], "score": round(float(r.get("score", 0)), 3),
             "box": [round(v, 1) for v in r["box"]]}
            for r in items
            if r.get("text")
        ]
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=1)
    print("ok", len(result))


if __name__ == "__main__":
    main(sys.argv)
