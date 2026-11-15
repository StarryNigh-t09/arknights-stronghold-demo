# -*- coding: utf-8 -*-
"""在甲板（整备区）木台面上找站着的干员，返回每个干员的横向范围。
判据：木台面是黄褐色（r-b 大），干员有灰/黑描边、白毛、黑帽 —— 用「近中性色」筛。
用法: python scripts/deckunits.py shot.png [y1 y2]
"""
import sys
from PIL import Image

img = Image.open(sys.argv[1]).convert('RGB')
y1 = int(sys.argv[2]) if len(sys.argv) > 2 else 660
y2 = int(sys.argv[3]) if len(sys.argv) > 3 else 870
x1, x2 = 170, 1500

p = img.load()
cols = []
for x in range(x1, x2):
    n = 0
    for y in range(y1, y2):
        r, g, b = p[x, y]
        if abs(r - g) < 26 and abs(g - b) < 26:
            if max(r, g, b) < 120 or min(r, g, b) > 190:
                n += 1
    cols.append(n)

# 每列阈值随可用高度缩放
thr = max(4, int((y2 - y1) * 0.05))
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
    if merged and s[0] - merged[-1][1] < 24:
        merged[-1][1] = s[1]
    else:
        merged.append(list(s))

print('扫描 y=%d..%d thr=%d' % (y1, y2, thr))
res = []
for s in merged:
    if s[1] - s[0] < 14:
        continue
    peak = max(cols[s[0] - x1:s[1] - x1 + 1])
    cx = (s[0] + s[1]) // 2
    print('  单位 x=%d..%d 宽%d 中心%d 峰值%d' % (s[0], s[1], s[1] - s[0] + 1, cx, peak))
    res.append(cx)
print('中心列表:', res)
