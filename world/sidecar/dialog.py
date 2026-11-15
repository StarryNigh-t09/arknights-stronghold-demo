#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Detect the "确认准备吗？" modal that appears after tapping 准备就绪.

The modal paints a near-black band across the middle of the screen, which never
happens in the normal rest/battle UI.  Cheap pixel check, no OCR.

Usage: python dialog.py <png>   ->  {"modal": true/false, "mean": 12.3}
"""
import json
import sys

from PIL import Image


def main(argv):
    img = Image.open(argv[1]).convert("L")
    w, h = img.size
    box = img.crop((0, int(h * 0.28), w, int(h * 0.52)))
    px = list(box.getdata())
    mean = sum(px) / max(1, len(px))
    dark = sum(1 for v in px if v < 30) / max(1, len(px))
    res = {"modal": mean < 45 and dark > 0.55, "mean": round(mean, 1), "dark": round(dark, 3)}
    payload = json.dumps(res)
    if len(argv) > 2:
        with open(argv[2], "w", encoding="utf-8") as fh:
            fh.write(payload)
    else:
        print(payload)


if __name__ == "__main__":
    main(sys.argv)
