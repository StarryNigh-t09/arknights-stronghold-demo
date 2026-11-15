# -*- coding: utf-8 -*-
"""扫甲板（整备区）木台面上「站着人」的横向位置。
木台面是黄褐色浅色；干员有深色描边和深色衣服，暗像素比例明显高。
单张图内判断，不受整屏光照变化影响。

用法: python scripts/deckscan.py shot.png [y1 y2]
输出: 每个疑似有人的列段（实际像素 x 范围）
"""
import sys
from PIL import Image

img = Image.open(sys.argv[1]).convert('RGB')
y1 = int(sys.argv[2]) if len(sys.argv) > 2 else 640
y2 = int(sys.argv[3]) if len(sys.argv) > 3 else 880
x1, x2 = 150, 1520

p = img.load()
cols = []
for x in range(x1, x2):
    dark = 0
    for y in range(y1, y2, 2):
        r, g, b = p[x, y]
        if max(r, g, b) < 105:
            dark += 1
    cols.append(dark)

thr = 3
segs, cur = [], None
for i, v in enumerate(cols):
    x = x1 + i
    if v > thr:
        cur = [x, x] if cur is None else [cur[0], x]
    else:
        if cur:
            segs.append(cur)
            cur = None
if cur:
    segs.append(cur)

merged = []
for s in segs:
    if merged and s[0] - merged[-1][1] < 30:
        merged[-1][1] = s[1]
    else:
        merged.append(list(s))

print('扫描 y=%d..%d' % (y1, y2))
for s in merged:
    if s[1] - s[0] < 12:
        continue
    peak = max(cols[s[0] - x1:s[1] - x1 + 1])
    print('  段 x=%d..%d 宽%d 中心%d 峰值%d' % (s[0], s[1], s[1] - s[0] + 1, (s[0] + s[1]) // 2, peak))
