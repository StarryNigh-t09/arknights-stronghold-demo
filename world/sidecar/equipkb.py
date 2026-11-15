"""equipkb.py — 用「图库」认甲板上的装备（纯看图，不点屏幕）。

图库 = world/assets/equip-icons/<装备名>.png，**按游戏里的原始像素裁**（不要缩放），
新增装备就把图标裁下来存进图库，文件名就是装备名。

匹配：图库图补成正方形后，按**原生尺寸**在截图里滑动，灰度零均值相关；
只比中间 84%，避开裁图边缘带进来的界面。

用法：python equipkb.py <shot.png> <x0,y0,x1,y1> [out.json]
输出：{"ok":true,"hits":[{name,score,x,y,w,h}]}，x/y 是命中窗口左上角。
"""
import os, sys, json
import numpy as np
from PIL import Image

KB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "equip-icons")
THRESHOLD = 0.55


def square_pad(im):
    w, h = im.size
    side = max(w, h)
    canvas = Image.new("RGB", (side, side), (128, 128, 128))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2))
    return canvas


def feat(im, margin=0.08):
    g = np.asarray(im.convert("L"), np.float32)
    s = g.shape[0]
    m = max(2, int(s * margin))
    g = g[m:s - m, m:s - m]
    g = g - g.mean()
    return g / (g.std() + 1e-6)


def load_kb():
    out = []
    if not os.path.isdir(KB_DIR):
        return out
    for fn in os.listdir(KB_DIR):
        if not fn.lower().endswith(".png"):
            continue
        im = square_pad(Image.open(os.path.join(KB_DIR, fn)).convert("RGB"))
        out.append({"name": fn[:-4], "tpl": feat(im), "side": im.size[0]})
    return out


def match(shot, box, kb, step=3):
    x0, y0, x1, y1 = box
    hits = []
    for item in kb:
        s = item["side"]
        t = item["tpl"]
        for y in range(y0, y1 - s + 1, step):
            for x in range(x0, x1 - s + 1, step):
                w = feat(shot.crop((x, y, x + s, y + s)))
                if w.shape != t.shape:
                    continue
                sc = float((w * t).mean())
                if sc >= THRESHOLD:
                    hits.append({"name": item["name"], "score": round(sc, 3), "x": x, "y": y, "w": s, "h": s})
    hits.sort(key=lambda h: -h["score"])
    keep = []
    for h in hits:
        if all(abs(h["x"] - k["x"]) > 30 or abs(h["y"] - k["y"]) > 30 for k in keep):
            keep.append(h)
    return keep[:6]


if __name__ == "__main__":
    shot = Image.open(sys.argv[1]).convert("RGB")
    box = json.loads(sys.argv[2])
    kb = load_kb()
    res = {"ok": True, "kb": [k["name"] for k in kb], "hits": match(shot, box, kb)}
    txt = json.dumps(res, ensure_ascii=False)
    if len(sys.argv) > 3:
        open(sys.argv[3], "w", encoding="utf-8").write(txt)
    print("ok")
