# -*- coding: utf-8 -*-
# 2026-11-15 03:0x：休整期点中场上干员/装置会弹左侧详情面板，面板开着时甲板拖拽全被判成单击
# （.tmp/look-0300.png：阻隔工事面板，左中区域均值 63.5；关掉后同一区域 120.0）。
# 面板 = 画面左侧一块很暗的矩形；用均值阈值 85 判。
import sys, json
from PIL import Image
png = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else None
im = Image.open(png).convert("RGB")
w, h = im.size
def mean_of(box):
    crop = im.crop(box).resize((48, 12))
    px = list(crop.getdata())
    return sum((r + g + b) / 3.0 for r, g, b in px) / len(px)
boxL = (int(w * 0.015), int(h * 0.37), int(w * 0.27), int(h * 0.52))
boxL2 = (int(w * 0.03), int(h * 0.52), int(w * 0.25), int(h * 0.65))
mL = round(mean_of(boxL), 1)
mL2 = round(mean_of(boxL2), 1)
res = {"ok": True, "mean": mL, "mean2": mL2, "open": (mL < 85 and mL2 < 85)}
s = json.dumps(res, ensure_ascii=False)
if out:
    f = open(out, "w", encoding="utf-8"); f.write(s); f.close()
print(s)
