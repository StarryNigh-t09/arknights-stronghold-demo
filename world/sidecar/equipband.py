# -*- coding: utf-8 -*-
"""Loose equipment icons lying on the deck band (between level badges and unit bodies).

User rule (2026-11-10): equipment sits on the row above the deck units; drag its
grid cell onto the unit's cell.  We only need the icon's press point.

Geometry-only: the sand/wood deck is light & warm (r>g>b); equipment icons are
either dark, or cold-coloured (blue/cyan), and always sit inside a narrow band.
"""
import json, sys
from PIL import Image

def detect(png, band):
    im = Image.open(png).convert("RGB")
    x0, y0, x1, y1 = band
    w, h = x1 - x0, y1 - y0
    px = im.crop(band).load()
    mask = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            cold = (b > r + 18) or (g > r + 25 and g > 90)
            dark = lum < 105
            mask[y][x] = dark or cold
    # connected components (4-neighbour, iterative)
    seen = [[False] * w for _ in range(h)]
    out = []
    for y in range(h):
        for x in range(w):
            if not mask[y][x] or seen[y][x]:
                continue
            stack = [(x, y)]
            seen[y][x] = True
            xs = []; ys = []
            n = 0
            while stack:
                cx, cy = stack.pop()
                n += 1
                xs.append(cx); ys.append(cy)
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if n < 260:
                continue
            bx0, bx1 = min(xs), max(xs)
            by0, by1 = min(ys), max(ys)
            bw, bh = bx1 - bx0 + 1, by1 - by0 + 1
            if bw < 26 or bh < 24 or bw > 130 or bh > 110:
                continue
            fill = n / float(bw * bh)
            if fill < 0.16:
                continue
            out.append({"x": x0 + (bx0 + bx1) // 2, "y": y0 + (by0 + by1) // 2,
                        "w": bw, "h": bh, "n": n, "fill": round(fill, 3)})
    out.sort(key=lambda d: d["x"])
    return out

if __name__ == "__main__":
    png = sys.argv[1]
    band = json.loads(sys.argv[2]) if len(sys.argv) > 2 else [860, 500, 1400, 600]
    res = {"ok": True, "band": band, "items": detect(png, band)}
    payload = json.dumps(res, ensure_ascii=False)
    if len(sys.argv) > 3:
        with open(sys.argv[3], "w", encoding="utf-8") as fh:
            fh.write(payload)
    else:
        sys.stdout.write(payload)
