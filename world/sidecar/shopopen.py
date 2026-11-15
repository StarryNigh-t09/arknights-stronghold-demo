# -*- coding: utf-8 -*-
import sys, json
from PIL import Image
png = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else None
im = Image.open(png).convert("RGB")
w, h = im.size
box = (int(w*0.13), int(h*0.80), int(w*0.38), int(h*0.93))
crop = im.crop(box)
px = list(crop.getdata())
mean = sum((r+g+b)/3.0 for r, g, b in px)/len(px)
res = {"ok": True, "mean": round(mean, 1), "open": mean < 72}
s = json.dumps(res, ensure_ascii=False)
if out:
    f = open(out, "w", encoding="utf-8"); f.write(s); f.close()
print(s)
