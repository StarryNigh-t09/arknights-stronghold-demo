"""equipmatch.py — 用 ASP 的 88 张装备图标做模板匹配，认出甲板头顶那一排是什么装备。
用法: python equipmatch.py <shot.png> <x0,y0,x1,y1> [out.json]
输出: {"ok":true,"hits":[{name,score,x,y,w,h}]}
"""
import sys, json, os
import numpy as np
from PIL import Image

ICON_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "refs",
                                        "asp-assistant-arknights-main", "data", "icons", "equipment"))


def load_icons(size):
    out = {}
    if not os.path.isdir(ICON_DIR):
        return out
    for fn in os.listdir(ICON_DIR):
        if not fn.lower().endswith(".png"):
            continue
        try:
            im = Image.open(os.path.join(ICON_DIR, fn)).convert("RGBA").resize((size, size), Image.LANCZOS)
        except Exception:
            continue
        out[os.path.splitext(fn)[0]] = im
    return out


def cut(im, box, size):
    x, y, w, h = box
    return im.crop((x, y, x + w, y + h)).convert("RGBA").resize((size, size), Image.LANCZOS)


def score(a, b):
    """带 alpha 的归一化相关：只在模板不透明的像素上比较。"""
    aa = np.asarray(a, dtype=np.float32)
    bb = np.asarray(b, dtype=np.float32)
    m = (aa[:, :, 3] > 40) & (bb[:, :, 3] > 120)
    if m.sum() < 200:
        return -1.0
    ga = aa[:, :, :3].mean(axis=2)[m]
    gb = bb[:, :, :3].mean(axis=2)[m]
    if ga.std() < 1e-3 or gb.std() < 1e-3:
        return -1.0
    return float(np.corrcoef(ga, gb)[0, 1])


def main(argv):
    path = argv[1]
    box = json.loads(argv[2])
    out = argv[3] if len(argv) > 3 else None
    shot = Image.open(path).convert("RGBA")
    size = 56
    icons = load_icons(size)
    x0, y0, x1, y1 = box
    cands = []
    step = 8
    for y in range(y0, y1 - size + 1, step):
        for x in range(x0, x1 - size + 1, step):
            cands.append((x, y))
    hits = []
    for (x, y) in cands:
        win = cut(shot, (x, y, size, size), size)
        best = (-1.0, None)
        for name, ic in icons.items():
            s = score(win, ic)
            if s > best[0]:
                best = (s, name)
        if best[0] >= 0.62:
            hits.append({"name": best[1], "score": round(best[0], 3), "x": x, "y": y, "w": size, "h": size})
    # 非极大抑制
    hits.sort(key=lambda h: -h["score"])
    keep = []
    for h in hits:
        if all(abs(h["x"] - k["x"]) > 30 or abs(h["y"] - k["y"]) > 30 for k in keep):
            keep.append(h)
    res = {"ok": True, "icons": len(icons), "hits": keep[:8]}
    txt = json.dumps(res, ensure_ascii=False)
    if out:
        open(out, "w", encoding="utf-8").write(txt)
    print(txt)


if __name__ == "__main__":
    main(sys.argv)
