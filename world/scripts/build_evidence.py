# -*- coding: utf-8 -*-
"""Build contact sheets + change metric + crops for the ZC live capture."""
import os, sys, json, glob, argparse
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAG = os.environ.get("ZC_TAG", "zc-2026-11-10")
OUT = os.path.join(BASE, "data", "live", TAG)
SHOTS = os.path.join(BASE, "shots")
SHEETS = os.path.join(OUT, "sheets")
CROPS = os.path.join(OUT, "crops")

def load():
    rows = []
    mp = os.path.join(OUT, "frames.jsonl")
    for line in open(mp, encoding="utf-8"):
        try:
            r = json.loads(line)
        except Exception:
            continue
        if r.get("ok") and r.get("file"):
            r["path"] = os.path.join(SHOTS, r["file"])
            if os.path.exists(r["path"]):
                rows.append(r)
    rows.sort(key=lambda r: r["ts"])
    return rows

def font(sz):
    for p in ["C:/Windows/Fonts/consola.ttf", "C:/Windows/Fonts/arial.ttf"]:
        try:
            return ImageFont.truetype(p, sz)
        except Exception:
            pass
    return ImageFont.load_default()

def hhmmss(ts):
    import time
    return time.strftime("%H:%M:%S", time.localtime(ts))

def sheets(rows, per=4):
    os.makedirs(SHEETS, exist_ok=True)
    f = font(22)
    made = []
    for i in range(0, len(rows), per):
        chunk = rows[i:i + per]
        im = Image.new("RGB", (1280, 380 * 2), (20, 20, 20))
        d = ImageDraw.Draw(im)
        for k, r in enumerate(chunk):
            img = Image.open(r["path"]).convert("RGB").resize((640, 360))
            x = (k % 2) * 640; y = (k // 2) * 380
            im.paste(img, (x, y + 20))
            d.text((x + 6, y + 2), f"#{i+k:02d} {hhmmss(r['ts'])}", fill=(255, 230, 120), font=f)
        p = os.path.join(SHEETS, f"sheet-{i:03d}.png")
        im.save(p)
        made.append(p)
    return made

def diffstats(rows):
    prev = None
    out = []
    for r in rows:
        im = Image.open(r["path"]).convert("L").resize((64, 36))
        px = list(im.getdata())
        if prev is None:
            out.append({"ts": r["ts"], "diff": 0.0})
        else:
            d = sum(abs(a - b) for a, b in zip(px, prev)) / len(px)
            out.append({"ts": r["ts"], "diff": round(d, 2)})
        prev = px
    return out

REGIONS = {
    "top": (240, 0, 1040, 82),
    "cov": (330, 52, 1120, 128),
    "shop": (255, 500, 965, 700),
    "left": (0, 155, 155, 500),
    "upleft": (0, 560, 280, 720),
    "hand": (250, 440, 1000, 520),
}

def crops(rows, ids, scale=2):
    os.makedirs(CROPS, exist_ok=True)
    out = []
    for i in ids:
        r = rows[i]
        im = Image.open(r["path"]).convert("RGB")
        for name, box in REGIONS.items():
            c = im.crop(box)
            c = c.resize((c.width * scale, c.height * scale), Image.LANCZOS)
            p = os.path.join(CROPS, f"{r['ts']}-{name}.png")
            c.save(p)
            out.append(p)
    return out

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", default="sheets")
    ap.add_argument("--ids", default="")
    ap.add_argument("--scale", type=int, default=2)
    a = ap.parse_args()
    rows = load()
    print("rows", len(rows))
    if a.mode == "sheets":
        for p in sheets(rows):
            print(p)
        ds = diffstats(rows)
        json.dump(ds, open(os.path.join(OUT, "diff.json"), "w"))
        for r, d in zip(rows, ds):
            print(f"{r['ts']} {hhmmss(r['ts'])} diff={d['diff']:6.2f} {r['file']}")
    elif a.mode == "crops":
        ids = [int(x) for x in a.ids.split(",") if x.strip() != ""]
        for p in crops(rows, ids, a.scale):
            print(p)
