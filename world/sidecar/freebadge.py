# -*- coding: utf-8 -*-
"""商店「刷新」按钮上有没有挂 FREE 徽章。

用户 m00267：刷新 1 块钱一次；补给的 FREE 次数刷新不要钱。
徽章是青绿描边 + 白字「FREE x2」，位置固定在刷新按钮上方。

2026-11-11 09:47 实测（1920x1080，回合 8 休整期）：
  有徽章：青绿像素 1183 / 1207 个，落点 (1724,628)-(1860,666)
  商店折叠态（看不到按钮）：0 个
所以阈值取 400，判据是「够多」，不抠字形。

用法：python freebadge.py <png> [out.json]
"""
import json
import sys

from PIL import Image

BOX = (1690, 560, 1920, 675)
TEAL_MIN = 400


def count_teal(img):
    crop = img.convert("RGB").crop(BOX)
    w, h = crop.size
    px = crop.load()
    n = 0
    xs = []
    ys = []
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if g >= 140 and b >= 115 and r <= 120 and (g - r) >= 60 and (b - r) >= 40:
                n += 1
                xs.append(x)
                ys.append(y)
    box = None
    if xs:
        box = [min(xs) + BOX[0], min(ys) + BOX[1], max(xs) + BOX[0], max(ys) + BOX[1]]
    return n, box


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "usage: freebadge.py <png> [out.json]"}))
        return
    png = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else None
    data = {"ok": False, "free": False, "pixels": 0, "bbox": None}
    try:
        img = Image.open(png)
        n, box = count_teal(img)
        data = {"ok": True, "free": n >= TEAL_MIN, "pixels": n, "bbox": box}
    except Exception as exc:  # noqa: BLE001
        data = {"ok": False, "free": False, "pixels": 0, "bbox": None,
                "error": "%s: %s" % (type(exc).__name__, exc)}
    text = json.dumps(data, ensure_ascii=False)
    if out:
        with open(out, "w", encoding="utf-8") as fh:
            fh.write(text)
    print(text)


main()
