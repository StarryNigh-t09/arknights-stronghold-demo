# -*- coding: utf-8 -*-
"""抓取态目标格检测：装备被抓时，场上干员格=绿、甲板格=青。纯像素，无模型。"""
import json
import sys
from PIL import Image

def is_cyan(r, g, b):
    return g > 110 and b > 110 and r < 125 and abs(g - b) < 95 and (g + b - 2 * r) > 90

def is_green(r, g, b):
    return g > 110 and b < 125 and g > r + 25 and g > b + 28

def clusters(img, pred, min_px=800, region=None, step=6):
    w, h = img.size
    x0, y0, x1, y1 = region or (0, 0, w, h)
    px = img.load()
    pts = []
    for y in range(y0, y1, step):
        for x in range(x0, x1, step):
            r, g, b = px[x, y][:3]
            if pred(r, g, b):
                pts.append((x, y))
    used = [False] * len(pts)
    out = []
    for i in range(len(pts)):
        if used[i]:
            continue
        stack = [i]
        used[i] = True
        members = []
        while stack:
            j = stack.pop()
            jx, jy = pts[j]
            members.append((jx, jy))
            for k in range(len(pts)):
                if used[k]:
                    continue
                kx, ky = pts[k]
                if abs(kx - jx) <= step * 2 and abs(ky - jy) <= step * 2:
                    used[k] = True
                    stack.append(k)
        area = len(members) * step * step
        if area < min_px:
            continue
        mx = sum(p[0] for p in members) // len(members)
        my = sum(p[1] for p in members) // len(members)
        out.append({"x": int(mx), "y": int(my), "px": int(area)})
    out.sort(key=lambda d: -d["px"])
    return out

def main():
    png = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else None
    img = Image.open(png).convert("RGB")
    w, h = img.size
    region = (int(w * 0.05), int(h * 0.48), int(w * 0.97), int(h * 0.92))
    res = {
        "ok": True,
        "green": clusters(img, is_green, region=region)[:12],
        "cyan": clusters(img, is_cyan, region=region)[:12],
    }
    s = json.dumps(res, ensure_ascii=False)
    if out:
        fd = open(out, "w", encoding="utf-8")
        fd.write(s)
        fd.close()
    print(s)

if __name__ == "__main__":
    main()
