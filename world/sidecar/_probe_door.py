# -*- coding: utf-8 -*-
import sys, json
from PIL import Image

def clusters(mask, w, h, minpix=120):
    # 简单 4-邻域连通域（在缩小 4 倍的网格上做，够用）
    step = 4
    gw, gh = w // step, h // step
    grid = [[False] * gw for _ in range(gh)]
    for y in range(gh):
        for x in range(gw):
            grid[y][x] = mask[y*step][x*step] if False else False
    return []

img = Image.open(sys.argv[1]).convert('RGB')
w, h = img.size
px = img.load()
import colorsys
red, cyan = [], []
for y in range(0, h, 3):
    for x in range(0, w, 3):
        r, g, b = px[x, y]
        mx, mn = max(r, g, b), min(r, g, b)
        if mx < 60:
            continue
        s = (mx - mn) / mx
        if s < 0.45:
            continue
        hh, _, _ = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
        hue = hh * 360
        if (hue < 12 or hue > 350) and r > 130 and g < 110 and b < 110:
            red.append((x, y))
        elif 150 <= hue <= 195 and g > 150 and b > 140 and r < 120:
            cyan.append((x, y))
print(json.dumps({'w': w, 'h': h, 'red': len(red), 'cyan': len(cyan)}, ensure_ascii=False))
# 分桶统计：把画面切成 8x6 格，看红/青分布
bw, bh = w // 8, h // 6
grid = [[[0, 0] for _ in range(8)] for _ in range(6)]
for (x, y) in red:
    grid[min(5, y // bh)][min(7, x // bw)][0] += 1
for (x, y) in cyan:
    grid[min(5, y // bh)][min(7, x // bw)][1] += 1
for gy in range(6):
    print(' '.join('%4d/%4d' % (grid[gy][gx][0], grid[gy][gx][1]) for gx in range(8)))
