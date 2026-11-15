# -*- coding: utf-8 -*-
"""找战场上「可部署」的格子（半透明绿高亮）。
判据：G 明显高于 R、B，且不是纯绿 UI 按钮（限制在战场区域内）。
用法: python scripts/greengrid.py shot.png
"""
import sys
from PIL import Image

img = Image.open(sys.argv[1]).convert('RGB')
X1, X2, Y1, Y2 = 380, 1560, 140, 720
B = 24

p = img.load()
cols = [0] * ((X2 - X1) // B + 1)
rows = [0] * ((Y2 - Y1) // B + 1)
cells = []
for by in range(Y1, Y2, B):
    for bx in range(X1, X2, B):
        green = 0
        for y in range(by, min(by + B, Y2), 2):
            for x in range(bx, min(bx + B, X2), 2):
                r, g, b = p[x, y]
                if g - r > 28 and g - b > 28 and g > 110:
                    green += 1
        if green >= 10:
            cells.append((bx + B // 2, by + B // 2, green))
            cols[(bx - X1) // B] += 1
            rows[(by - Y1) // B] += 1

# 简单聚类：把相邻的块合并成格
cells.sort(key=lambda t: (t[1], t[0]))
clusters = []
for cx, cy, g in cells:
    hit = None
    for c in clusters:
        if abs(c['x'] / c['n'] - cx) < 70 and abs(c['y'] / c['n'] - cy) < 55:
            hit = c
            break
    if hit:
        hit['x'] += cx
        hit['y'] += cy
        hit['n'] += 1
        hit['g'] = max(hit['g'], g)
    else:
        clusters.append({'x': cx, 'y': cy, 'n': 1, 'g': g})

print('可部署格候选（按 y 再 x）:')
out = []
for c in sorted(clusters, key=lambda c: (round(c['y'] / c['n'] / 40), c['x'] / c['n'])):
    x, y, n = c['x'] // c['n'], c['y'] // c['n'], c['n']
    if n < 2:
        continue
    out.append([x, y])
    print('  格中心 ≈ (%d, %d)  块数%d' % (x, y, n))
print('列表:', out)
