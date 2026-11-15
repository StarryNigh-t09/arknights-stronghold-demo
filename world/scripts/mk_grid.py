# -*- coding: utf-8 -*-
"""Grid of one region across selected frame ids (for reading small UI text)."""
import os, sys, json, argparse
from PIL import Image, ImageDraw, ImageFont
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAG = os.environ.get("ZC_TAG", "zc-2026-11-10")
OUT = os.path.join(BASE, "data", "live", TAG)
SHOTS = os.path.join(BASE, "shots")
CROPS = os.path.join(OUT, "crops")
REG = {
 "top": (240, 0, 1040, 82),
 "upleft": (0, 545, 300, 720),
 "shop": (250, 495, 1160, 700),
 "bench": (150, 290, 1000, 470),
}
def font(sz):
    try: return ImageFont.truetype("C:/Windows/Fonts/consola.ttf", sz)
    except Exception: return ImageFont.load_default()
def load():
    rows = []
    for line in open(os.path.join(OUT, "frames.jsonl"), encoding="utf-8"):
        try: r = json.loads(line)
        except Exception: continue
        if r.get("ok") and r.get("file"): rows.append(r)
    rows.sort(key=lambda r: r["ts"]); return rows
ap = argparse.ArgumentParser()
ap.add_argument("--region", default="top"); ap.add_argument("--ids", default="")
ap.add_argument("--scale", type=int, default=2); ap.add_argument("--cols", type=int, default=2)
ap.add_argument("--out", default="")
a = ap.parse_args()
rows = load(); ids = [int(x) for x in a.ids.split(",") if x.strip() != ""]
box = REG[a.region]; w = (box[2]-box[0])*a.scale; h = (box[3]-box[1])*a.scale
cols = a.cols; rowsn = (len(ids)+cols-1)//cols
pad = 22
im = Image.new("RGB", (w*cols, (h+pad)*rowsn), (18,18,18))
d = ImageDraw.Draw(im); f = font(18)
for k, i in enumerate(ids):
    r = rows[i]; src = Image.open(os.path.join(SHOTS, r["file"])).convert("RGB").crop(box)
    src = src.resize((w, h), Image.LANCZOS)
    x = (k % cols)*w; y = (k//cols)*(h+pad)
    im.paste(src, (x, y+pad))
    import time
    d.text((x+4, y+2), "#%d %s %s" % (i, time.strftime("%H:%M:%S", time.localtime(r["ts"])), r["file"]), fill=(255,230,120), font=f)
os.makedirs(CROPS, exist_ok=True)
p = a.out or os.path.join(CROPS, "grid-%s-%s.png" % (a.region, a.ids.replace(",","_")))
im.save(p); print(p, im.size)
