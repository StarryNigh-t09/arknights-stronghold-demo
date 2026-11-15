# -*- coding: utf-8 -*-
"""对比两张 wz_rest 截图，找甲板区域里「多出来/少掉」的像素块。
用法: python scripts/deckdiff.py base.png now.png [x1 y1 x2 y2]
"""
import sys
from PIL import Image

base_p, now_p = sys.argv[1], sys.argv[2]
box = (150, 600, 1500, 900)
if len(sys.argv) >= 6:
    box = tuple(int(v) for v in sys.argv[3:7])

a = Image.open(base_p).convert('RGB').crop(box)
b = Image.open(now_p).convert('RGB').crop(box)
W, H = a.size
pa, pb = a.load(), b.load()

cols = [0] * W
rows = [0] * H
for y in range(H):
    for x in range(W):
        ra, ga, ba = pa[x, y]
        rb, gb, bb = pb[x, y]
        d = abs(ra - rb) + abs(ga - gb) + abs(ba - bb)
        if d > 66:
            cols[x] += 1
            rows[y] += 1

# 列方向找连续段（相邻列差异像素都超过阈值才算同一块）
thr = 6
segs, cur = [], None
for x in range(W):
    if cols[x] > thr:
        cur = [x, x] if cur is None else [cur[0], x]
    else:
        if cur:
            segs.append(cur)
            cur = None
if cur:
    segs.append(cur)
# 合并间隔 < 20px 的段
merged = []
for s in segs:
    if merged and s[0] - merged[-1][1] < 20:
        merged[-1][1] = s[1]
    else:
        merged.append(list(s))

print('box', box, 'size', (W, H))
for s in merged:
    if s[1] - s[0] < 8:
        continue
    xs = [cols[x] for x in range(s[0], s[1] + 1)]
    print('  block x=(%d..%d) 实际 x=%d..%d  中心 %d  峰值 %d' % (
        s[0], s[1], box[0] + s[0], box[0] + s[1], box[0] + (s[0] + s[1]) // 2, max(xs)))

ys = [y for y in range(H) if rows[y] > 4]
if ys:
    print('  y 范围 实际 %d..%d' % (box[1] + ys[0], box[1] + ys[-1]))
