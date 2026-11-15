# -*- coding: utf-8 -*-
"""抓取态绿色高亮 → 本回合可放置的空格中心（不需要知道网格原点）。

用法:
  python freetiles.py <png> [out.json]                 自动找所有绿块（旧行为）
  python freetiles.py <png> [out.json] --cells cells.json
        只判定给定格心（地图里的可部署格）是不是绿的 —— 2026-11-11 18:0x 新增，
        用户 m02704：「除了我标记过的格子其他都是废格子」，所以候选格以地图为准，
        绿格只用来确认「这一格这一回合能不能站人（空着）」。像素同时取自抓牌态，
        所以站着干员的格自然不会绿。

输出: {"ok":true,"cells":[{"x":..,"y":..,"green":0.87}...],"tiles":[{"x","y","green"}]}
判据（2026-11-10 实测）：空格绿覆盖 ~0.7–0.9，站着干员的格 ~0.25（小人挡掉中心），
岩石/水面 ~0.0–0.26。阈值 0.55 能把空的可站格和别的东西分开。
"""
import sys, json
from PIL import Image
import numpy as np

def box_mean(m, w, h):
    ii = np.cumsum(np.cumsum(m.astype(np.float64), 0), 1)
    ii = np.pad(ii, ((1, 0), (1, 0)))
    s = ii[h:, w:] - ii[:-h, w:] - ii[h:, :-w] + ii[:-h, :-w]
    return s / float(w * h)

def main():
    args = [a for a in sys.argv[1:]]
    cells_path = None
    if '--cells' in args:
        i = args.index('--cells')
        cells_path = args[i + 1]
        del args[i:i + 2]
    png = args[0]
    out = args[1] if len(args) > 1 else None
    a = np.asarray(Image.open(png).convert('RGB')).astype(int)
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    m = (G > R + 20) & (G > B + 40) & (G > 105)
    m[:170, :] = False        # 顶部 UI
    # 2026-11-11 18:0x：原来一刀切 m[520:,:]=False，把地图第 4 行（y≈665）整个排除了。
    # 改成只挖掉真 UI（甲板/商店面板、右侧冻结刷新那一块）：
    m[700:, :] = False
    # 2026-11-11 18:3x：这条原来把 (1489,665) 挡掉了，其实抓牌态那里就是绿的（冻结按钮在空闲态才盖住它）。
    m[:, :330] = False        # 左侧详情面板

    if cells_path:
        cells = json.load(open(cells_path, encoding='utf-8'))
        res = []
        for c in cells:
            x, y = int(c['x']), int(c['y'])
            hw, hh = 32, 22
            y0, y1 = max(0, y - hh), min(m.shape[0], y + hh)
            x0, x1 = max(0, x - hw), min(m.shape[1], x + hw)
            score = float(m[y0:y1, x0:x1].mean()) if (y1 > y0 and x1 > x0) else 0.0
            res.append({'x': x, 'y': y, 'green': round(score, 3)})
        res.sort(key=lambda t: -t['green'])
        outj = {'ok': True, 'mode': 'cells', 'cells': res,
                'tiles': [{'x': t['x'], 'y': t['y'], 'green': t['green']} for t in res if t['green'] >= 0.5]}
    else:
        W, H = 60, 44
        score = box_mean(m, W, H)
        cand = []
        ys, xs = np.nonzero(score > 0.55)
        for y, x in zip(ys, xs):
            cand.append((float(score[y, x]), x + W // 2, y + H // 2))
        cand.sort(reverse=True)
        kept = []
        for s, x, y in cand:
            if all((x - kx) ** 2 + (y - ky) ** 2 > 70 ** 2 for _, kx, ky in kept):
                kept.append((s, x, y))
        tiles = [{'x': int(x), 'y': int(y), 'green': round(s, 3)} for s, x, y in kept]
        tiles.sort(key=lambda t: (t['y'], t['x']))
        outj = {'ok': True, 'mode': 'auto', 'count': len(tiles), 'tiles': tiles}

    s = json.dumps(outj, ensure_ascii=False)
    if out:
        with open(out, 'w', encoding='utf-8') as f:
            f.write(s)
        print('tiles', len(outj['tiles']))
    else:
        print(s)

main()
