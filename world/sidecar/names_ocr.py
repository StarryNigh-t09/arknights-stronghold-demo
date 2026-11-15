#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generic full-image text OCR using the same PaddleOCR engine as ocr.py.

Usage: python names_ocr.py <out.json> <png> [<png> ...]
"""
import json
import sys

from PIL import Image

import ocr as ocr_mod


def main(argv):
    out_path, paths = argv[1], argv[2:]
    eng = ocr_mod.Engine()
    result = {}
    for p in paths:
        img = Image.open(p).convert("RGB")
        items = eng.run(img, (0, 0, img.width, img.height), scale=1)
        result[p] = [
            {"text": r["text"], "score": r["score"], "box": [round(v, 1) for v in r["box"]]}
            for r in items
            if r["text"]
        ]
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=1)
    print("ok", len(result))


if __name__ == "__main__":
    main(sys.argv)
