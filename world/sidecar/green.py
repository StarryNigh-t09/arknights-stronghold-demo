# -*- coding: utf-8 -*-
"""抓取态绿色高亮 → 可部署格候选（格心 + 绿占比 + 中心暗占比）。

用法: python green.py <png> [out.json]
输出: {"ok":true,"cells":[{"x":..,"y":..,"w":..,"h":..,"green":0.93,"dark":0.02}]}
"""
import sys, json
from PIL import Image
import numpy as np

def main():
    png = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else None
    im = Image.open(png).convert('RGB')
    a = np.asarray(im).astype(int)
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    m = (G > R + 20) & (G > B + 40) & (G > 105)
    # 只看棋盘区域，砍掉顶部 UI 与底部商店
    m[:150, :] = False
    m[760:, :] = False
    colsum = m.sum(axis=0)
    rowsum = m.sum(axis=1)
    def bands(arr, thresh):
        on = arr > thresh
        out, start = [], None
        for i, v in enumerate(on):
            if v and start is None:
                start = i
            elif not v and start is not None:
                out.append((start, i - 1))
                start = None
        if start is not None:
            out.append((start, len(on) - 1))
        return [b for b in out if b[1] - b[0] >= 30]
    cols = bands(colsum, 25)
    rows = bands(rowsum, 25)
    cells = []
    for (x0, x1) in cols:
        for (y0, y1) in rows:
            sub = m[y0:y1 + 1, x0:x1 + 1]
            frac = sub.mean() if sub.size else 0
            if frac < 0.35:
                continue
            cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
            h = min(30, (y1 - y0) // 3)
            w = min(30, (x1 - x0) // 3)
            cen = a[cy - h:cy + h, cx - w:cx + w]
            dark = float((cen.mean(axis=2) < 70).mean()) if cen.size else 1.0
            cells.append({
                'x': int(cx), 'y': int(cy),
                'w': int(x1 - x0 + 1), 'h': int(y1 - y0 + 1),
                'green': round(float(frac), 3), 'dark': round(dark, 3),
            })
    res = {'ok': True, 'cols': len(cols), 'rows': len(rows), 'cells': cells}
    s = json.dumps(res, ensure_ascii=False)
    if out:
        with open(out, 'w', encoding='utf-8') as f:
            f.write(s)
        print('cells', len(cells), '->', out)
    else:
        print(s)

main()
