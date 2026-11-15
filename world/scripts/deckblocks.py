# -*- coding: utf-8 -*-
"""甲板（整备区）单位定位：分块算亮度标准差。
干员身上黑白相间、纹理复杂 → 局部标准差大；木台面均匀 → 标准差小。
用法: python scripts/deckblocks.py shot.png
"""
import sys
from PIL import Image

img = Image.open(sys.argv[1]).convert('RGB')
X1, X2 = 200, 1780
Y1 = int(sys.argv[2]) if len(sys.argv) > 2 else 615
Y2 = int(sys.argv[3]) if len(sys.argv) > 3 else 770
B = 16

p = img.load()
ncols = (X2 - X1) // B
score = [0.0] * ncols
for ci in range(ncols):
    x0 = X1 + ci * B
    tot = 0.0
    cnt = 0
    for by in range(Y1, Y2, B):
        rs = []
        for y in range(by, min(by + B, Y2)):
            for x in range(x0, min(x0 + B, X2)):
                r, g, b = p[x, y]
                rs.append((r * 299 + g * 587 + b * 114) / 1000)
        if len(rs) < 8:
            continue
        m = sum(rs) / len(rs)
        var = sum((v - m) ** 2 for v in rs) / len(rs)
        sd = var ** 0.5
        if sd > 38:
            tot += sd
        cnt += 1
    score[ci] = tot / max(1, cnt)

thr = 12.0
segs, cur = [], None
for i, v in enumerate(score):
    x = X1 + i * B
    if v > thr:
        cur = [x, x + B] if cur is None else [cur[0], x + B]
    else:
        if cur:
            segs.append(cur)
            cur = None
if cur:
    segs.append(cur)

merged = []
for s in segs:
    if merged and s[0] - merged[-1][1] < 28:
        merged[-1][1] = s[1]
    else:
        merged.append(list(s))

print('x=%d..%d y=%d..%d thr=%.1f' % (X1, X2, Y1, Y2, thr))
centers = []
for s in merged:
    if s[1] - s[0] < 20:
        continue
    cx = (s[0] + s[1]) // 2
    print('  单位 x=%d..%d 宽%d 中心%d' % (s[0], s[1], s[1] - s[0], cx))
    centers.append(cx)
print('中心列表:', centers)
