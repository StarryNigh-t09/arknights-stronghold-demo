# -*- coding: utf-8 -*-
import sys, json
from PIL import Image
import numpy as np

def ghost(path):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
    R, G, B = a[:,:,0], a[:,:,1], a[:,:,2]
    mx = np.maximum(np.maximum(R, G), B); mn = np.minimum(np.minimum(R, G), B)
    # 幽灵是"发白的半透明剪影 + 脚下亮环"：三通道都高、彼此接近
    m = (mn > 150) & ((mx - mn) < 45)
    m[:180, :] = False; m[900:, :] = False; m[:, :400] = False; m[:, 1620:] = False
    ys, xs = np.nonzero(m)
    if len(xs) == 0:
        return {"ok": False, "n": 0}
    # 100px 网格取最密块
    grid = {}
    for x, y in zip(xs.tolist(), ys.tolist()):
        grid[(x // 100, y // 100)] = grid.get((x // 100, y // 100), 0) + 1
    best = sorted(grid.items(), key=lambda kv: -kv[1])[:6]
    out = [{"x": (k[0] * 100 + 50), "y": (k[1] * 100 + 50), "n": v} for k, v in best]
    return {"ok": True, "n": int(len(xs)), "top": out}

if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(json.dumps({"p": p.split("\\")[-1], "r": ghost(p)}, ensure_ascii=False))
