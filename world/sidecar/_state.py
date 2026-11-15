# -*- coding: utf-8 -*-
"""一张截图同时给：绿格像素数（判待确认）、红「点击取消」块（清残留）、商店底排亮度，
以及（--tiles 时）合法格表 —— 原来这些要跑两个 python 进程，一次落位白等 1.2s。

用法：python _state.py shot.png [--tiles]
输出：{green, red, redCenter, shop, pts?}
"""
import sys, json
from PIL import Image
import numpy as np
from collections import deque


def cancel_badge(m, y_max=520, x_min=400, x_max=1300):
    """找「点击取消」红徽章：紧凑红色块（面积 ≥800、宽 ≤220、宽高比 1.7~3.4、在上半屏）。

    2026-11-13 19:4x 实测（这是布阵失败的**真原因**）：原来用绿格像素判「待确认态」，
    但 wz-01 这张图的黄色地块本身就带绿（正常休整帧 green≈3400），而真待确认帧 green 只有 1874~2591
    （.tmp/dep-a-*.png 全是 pending）→ isPending 恒 false，日志整片「没拎起来」，牌其实早拎起来了，
    只是程序没去滑朝向确认，牌一直留在待确认态。
    红徽章在真 pending 帧面积 1746~2150、干净帧 0（x-1/x-2/rb-t2 vs now/runinfo）。
    """
    sub = m[:y_max, x_min:x_max]
    H, W = sub.shape
    seen = np.zeros_like(sub, dtype=bool)
    ys, xs = np.nonzero(sub)
    best = None
    for y, x in zip(ys, xs):
        if seen[y, x]:
            continue
        q = deque([(y, x)]); seen[y, x] = True
        n = 0; y0 = y1 = y; x0 = x1 = x
        while q:
            cy, cx = q.popleft(); n += 1
            if cy < y0: y0 = cy
            if cy > y1: y1 = cy
            if cx < x0: x0 = cx
            if cx > x1: x1 = cx
            for dy in (-2, -1, 0, 1, 2):
                for dx in (-2, -1, 0, 1, 2):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < H and 0 <= nx < W and sub[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True; q.append((ny, nx))
        w = x1 - x0 + 1; h = y1 - y0 + 1
        if n >= 800 and w <= 220 and 1.7 <= w / max(1, h) <= 3.4:
            if best is None or n > best['n']:
                best = {'n': int(n), 'x': int((x0 + x1) / 2) + x_min, 'y': int((y0 + y1) / 2), 'w': int(w), 'h': int(h)}
    return best


def analyze(path, with_tiles=False):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    G = a[:, :, 1]; R = a[:, :, 0]; B = a[:, :, 2]
    g_mask = (G > 110) & (G > R + 35) & (G > B + 35)
    green = int(g_mask[200:900, 400:1620].sum())
    r_mask = (R > 170) & (G < 80) & (B < 80)
    sub = r_mask[100:460, 500:1300]
    red = int(sub.sum())
    badge = cancel_badge((R > 150) & (G < 95) & (B < 95))
    rc = None
    if badge:
        rc = [badge['x'], badge['y']]
    elif red > 1500:
        ys, xs = np.nonzero(sub)
        rc = [int(xs.mean()) + 500, int(ys.mean()) + 100]
    shop = float(a[860:1060, 400:1600].mean())
    out = {"green": green, "red": red, "redCenter": rc, "shop": round(shop, 1),
           "cancel": int(badge['n']) if badge else 0}
    # 合法格：44x44 窗口绿占比 > 0.75，按 60px 去重取前 14（等价于 _validtiles.py）
    if with_tiles and (green > 2000 or (badge is not None)):
        g = g_mask.astype(np.float32)
        ii = g.cumsum(0).cumsum(1)

        def ratio(x, y, r=22):
            x0, x1 = x - r, x + r
            y0, y1 = y - r, y + r
            s = ii[y1, x1] - ii[y0 - 1, x1] - ii[y1, x0 - 1] + ii[y0 - 1, x0 - 1]
            return float(s) / ((2 * r + 1) ** 2)

        best = []
        for y in range(240, 880, 20):
            for x in range(430, 1600, 20):
                v = ratio(x, y)
                if v > 0.75:
                    best.append((round(v, 3), x, y))
        best.sort(key=lambda t: -t[0])
        out["pts"] = []
        for v, x, y in best:
            if all(abs(x - o[1]) > 60 or abs(y - o[2]) > 60 for o in out["pts"]):
                out["pts"].append((v, x, y))
            if len(out["pts"]) >= 14:
                break
    return out


if __name__ == "__main__":
    args = [a for a in sys.argv[1:]]
    tiles = "--tiles" in args
    args = [a for a in args if a != "--tiles"]
    print(json.dumps(analyze(args[0], tiles)))
