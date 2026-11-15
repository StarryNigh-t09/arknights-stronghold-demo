#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Detect the 「道具补给」three-card supply panel.

The panel paints a big green TITLE at the top-left ("道具补给", colour ~ (0,255,196))
and dims everything else.  Cheap colour count, no OCR.

Usage: python item.py <png> [out.json]  ->  {"item": true/false, "green": 1234}
"""
import json
import sys

from PIL import Image


def main(argv):
    img = Image.open(argv[1]).convert("RGB")
    # title band: x 220..520, y 30..120 (1920x1080 reference, scaled if needed)
    w, h = img.size
    x0, x1 = int(w * 0.11), int(w * 0.28)
    y0, y1 = int(h * 0.03), int(h * 0.12)
    box = img.crop((x0, y0, x1, y1))
    green = 0
    for r, g, b in box.getdata():
        if g > 190 and r < 90 and b > 130:
            green += 1
    res = {"item": green > 400, "green": green}
    payload = json.dumps(res)
    if len(argv) > 2:
        with open(argv[2], "w", encoding="utf-8") as fh:
            fh.write(payload)
    else:
        print(payload)


if __name__ == "__main__":
    main(sys.argv)
