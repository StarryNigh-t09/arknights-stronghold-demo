
import sys, json, colorsys
import numpy as np
from PIL import Image

path, out = sys.argv[1], sys.argv[2]
img = Image.open(path).convert('RGB')
W, H = img.size
hsv = np.array(img.convert('HSV'), dtype=np.uint8)
Hh = hsv[:, :, 0].astype(int) * 360 // 255
S = hsv[:, :, 1].astype(int)
V = hsv[:, :, 2].astype(int)
mask = (S > 135) & (V > 105)
mask[:, 1720:] = False
mask[:120, :] = False
ys, xs = np.nonzero(mask)
print('cand px', len(xs))
N = len(xs)
vis = np.zeros(N, dtype=bool)
pos = {}
for i in range(N):
    pos[(xs[i], ys[i])] = i
comps = []
for i in range(N):
    if vis[i]:
        continue
    stack = [i]; vis[i] = True; comp = []
    while stack:
        j = stack.pop(); comp.append(j)
        x, y = xs[j], ys[j]
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
            k = pos.get((x+dx, y+dy))
            if k is not None and not vis[k]:
                vis[k] = True; stack.append(k)
    if len(comp) < 110 or len(comp) > 4000:
        continue
    cx = xs[comp].mean(); cy = ys[comp].mean()
    rad = np.hypot(xs[comp]-cx, ys[comp]-cy)
    if not (28 <= rad.mean() <= 55) or rad.std() > 7:
        continue
    bw = xs[comp].max()-xs[comp].min(); bh = ys[comp].max()-ys[comp].min()
    if not (60 <= bw <= 105 and 60 <= bh <= 105):
        continue
    # 空心：中心 9x9 不能大面积命中
    sel = (np.abs(xs[comp]-cx) < 5) & (np.abs(ys[comp]-cy) < 5)
    if sel.sum() > len(comp) * 0.06:
        continue
    h = int(np.median(Hh[ys[comp], xs[comp]]))
    comps.append(dict(x=round(float(cx)), y=round(float(cy)), r=round(float(rad.mean()),1), n=len(comp), hue=h))
json.dump(comps, open(out,'w'), indent=1)
def name(h):
    if h < 12 or h >= 345: return 'red'
    if h < 45: return 'gold'
    if h < 70: return 'yellow'
    if h < 165: return 'green'
    if h < 200: return 'cyan'
    if h < 240: return 'blue'
    if h < 300: return 'purple'
    return 'rose'
for c in sorted(comps, key=lambda q:(q['y'], q['x'])):
    print(name(c['hue']), c['x'], c['y'], 'hue', c['hue'], 'r', c['r'], 'n', c['n'])
print('total', len(comps))
