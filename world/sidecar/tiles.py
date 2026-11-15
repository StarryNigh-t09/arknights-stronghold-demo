# -*- coding: utf-8 -*-
"""休整期棋盘格分类：把 110px 网格逐格判成 tile(可站) / rock(不可站) / unit(有干员)。

用法: python tiles.py <png> <originX> <originY> [out.json] [mark.png]
判据（实测 2026-11-10 13:44 的棋盘截图）:
  可站格 = 浅棕石砖、四角有菱形纹，中心区 mean 亮度 100–210、R>G>B 且 R-B 在 40–110
  岩壁/石堆 = 暗棕或灰蓝，亮度 < 95 或 B>R
  有干员 = 中心区彩色像素多、亮度方差大（Q 版小人）
"""
import sys, json
from PIL import Image, ImageDraw
import numpy as np

def main():
    png, ox, oy = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    out = sys.argv[4] if len(sys.argv) > 4 else None
    mark = sys.argv[5] if len(sys.argv) > 5 else None
    im = Image.open(png).convert('RGB')
    a = np.asarray(im).astype(int)
    H, W = a.shape[:2]
    step = 110
    cells = []
    for gy in range(6):
        for gx in range(9):
            cx, cy = ox + gx * step, oy + gy * step
            if cx < 60 or cy < 60 or cx > W - 60 or cy > H - 60:
                continue
            sub = a[cy - 45:cy + 45, cx - 45:cx + 45]
            mean = sub.reshape(-1, 3).mean(axis=0)
            r, g, b = mean
            lum = float(sub.mean())
            sat = float((sub.max(axis=2) - sub.min(axis=2)).mean())
            kind = 'rock'
            if lum > 95 and r >= g >= b and 25 <= (r - b) <= 130:
                kind = 'tile'
            # 小人：中心区偏暗（阴影）+ 高饱和
            dark = float((sub.mean(axis=2) < 60).mean())
            if dark > 0.18:
                kind = 'unit'
            cells.append({'x': int(cx), 'y': int(cy), 'gx': gx, 'gy': gy,
                          'kind': kind, 'lum': round(lum, 1), 'sat': round(sat, 1),
                          'dark': round(dark, 3)})
    res = {'ok': True, 'origin': [ox, oy], 'step': step, 'cells': cells}
    if out:
        with open(out, 'w', encoding='utf-8') as f:
            f.write(json.dumps(res, ensure_ascii=False))
    if mark:
        d = ImageDraw.Draw(im)
        col = {'tile': (0, 255, 0), 'rock': (255, 0, 0), 'unit': (0, 160, 255)}
        for c in cells:
            x, y = c['x'], c['y']
            d.rectangle([x - 50, y - 50, x + 50, y + 50], outline=col[c['kind']], width=3)
            d.text((x - 40, y - 46), c['kind'][:2], fill=col[c['kind']])
        im.save(mark)
    print(json.dumps({'tile': sum(1 for c in cells if c['kind'] == 'tile'),
                      'rock': sum(1 for c in cells if c['kind'] == 'rock'),
                      'unit': sum(1 for c in cells if c['kind'] == 'unit'),
                      'total': len(cells)}))

main()
