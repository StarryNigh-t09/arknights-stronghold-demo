
import sys, json, math
import numpy as np
from PIL import Image

REF = {
 'green': (60, 220, 120),
 'yellow': (255, 235, 40),
 'gold': (240, 170, 40),
 'purple': (170, 120, 230),
 'red': (230, 60, 60),
 'blue': (60, 150, 235),
 'rose': (255, 150, 200),
}
path, outjson = sys.argv[1], sys.argv[2]
im = np.array(Image.open(path).convert('RGB'), dtype=int)
H, W = im.shape[0], im.shape[1]
found = []
for name, ref in REF.items():
    d = np.abs(im - np.array(ref)).sum(axis=2)
    m = d < 105
    m[:, 1750:] = False
    ys, xs = np.nonzero(m)
    if len(xs) < 50:
        continue
    # 简易连通：按坐标网格聚类
    pts = list(zip(xs.tolist(), ys.tolist()))
    used = [False] * len(pts)
    pts_sorted = sorted(range(len(pts)), key=lambda i: pts[i][0])
    for i in pts_sorted:
        if used[i]:
            continue
        stack = [i]; used[i] = True; comp = []
        while stack:
            j = stack.pop(); comp.append(pts[j])
            x0, y0 = pts[j]
            for k in pts_sorted:
                if used[k]:
                    continue
                x1, y1 = pts[k]
                if abs(x1 - x0) <= 2 and abs(y1 - y0) <= 2:
                    used[k] = True; stack.append(k)
        if len(comp) < 120:
            continue
        ax = np.array(comp, dtype=float)
        cx, cy = ax[:, 0].mean(), ax[:, 1].mean()
        rad = np.hypot(ax[:, 0] - cx, ax[:, 1] - cy)
        if rad.mean() < 25 or rad.mean() > 60:
            continue
        if rad.std() > 9.5:
            continue
        w = ax[:, 0].max() - ax[:, 0].min(); h = ax[:, 1].max() - ax[:, 1].min()
        if w < 55 or h < 55 or w > 110 or h > 110:
            continue
        found.append(dict(color=name, x=round(float(cx)), y=round(float(cy)), r=round(float(rad.mean()), 1), n=int(len(comp))))
json.dump(found, open(outjson, 'w'), indent=1)
for f in sorted(found, key=lambda q: (q['y'], q['x'])):
    print(f['color'], f['x'], f['y'], 'r', f['r'], 'n', f['n'])
print('total', len(found))
