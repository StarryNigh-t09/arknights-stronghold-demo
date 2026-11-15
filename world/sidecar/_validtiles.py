# -*- coding: utf-8 -*-
import sys, json
from PIL import Image
import numpy as np

a = np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(np.int16)
G = a[:,:,1]; R = a[:,:,0]; B = a[:,:,2]
g = ((G > 110) & (G > R + 35) & (G > B + 35)).astype(np.float32)
# 积分图算任意 44x44 窗口绿占比
ii = g.cumsum(0).cumsum(1)
def ratio(x, y, r=22):
    x0, x1 = x - r, x + r; y0, y1 = y - r, y + r
    s = ii[y1, x1] - ii[y0 - 1, x1] - ii[y1, x0 - 1] + ii[y0 - 1, x0 - 1]
    return s / ((2 * r + 1) ** 2)
best = []
for y in range(240, 880, 20):
    for x in range(430, 1600, 20):
        v = ratio(x, y)
        if v > 0.75:
            best.append((round(float(v), 3), x, y))
best.sort(key=lambda t: -t[0])
# 去重：间距 60px 内只留最高
out = []
for v, x, y in best:
    if all(abs(x - o[1]) > 60 or abs(y - o[2]) > 60 for o in out):
        out.append((v, x, y))
    if len(out) >= 14: break
print(json.dumps({"n": len(best), "pts": out}))
