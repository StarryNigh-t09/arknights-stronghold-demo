
import sys, json
import numpy as np
from PIL import Image

src = sys.argv[1]
im = np.asarray(Image.open(src).convert('RGB')).astype(np.int16)
R, G, B = im[:, :, 0], im[:, :, 1], im[:, :, 2]
mx = im.max(axis=2)

masks = {
  'red_gate':    (R > 160) & (R - G > 80) & (R - B > 80),
  'blue_gate':   (B > 150) & (B - R > 70) & (B - G > 30),
  'green':       (G > 140) & (G - R > 55) & (G - B > 55),
  'yellow':      (R > 160) & (G > 130) & (B < 100) & (abs(R - G) < 80),
  'purple':      (B > 120) & (R > 80) & (B - G > 55) & (R - G > 15) & (B - R < 90),
  'rose':        (R > 190) & (B > 140) & (G > 80) & (R - G > 70) & (B - G > 25),
  'black':       (mx < 45),
}

def comps(mask, min_area=150, max_area=6000):
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]:
            continue
        stack = [(y0, x0)]
        seen[y0, x0] = True
        pts = []
        while stack:
            y, x = stack.pop()
            pts.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
        if len(pts) < min_area or len(pts) > max_area:
            continue
        pa = np.array(pts)
        cy, cx = pa[:, 0].mean(), pa[:, 1].mean()
        y1, y2 = pa[:, 0].min(), pa[:, 0].max()
        x1, x2 = pa[:, 1].min(), pa[:, 1].max()
        bw, bh = x2 - x1 + 1, y2 - y1 + 1
        if not (25 <= bw <= 90 and 25 <= bh <= 90):
            continue
        out.append({'cx': float(cx), 'cy': float(cy), 'w': int(bw), 'h': int(bh), 'area': len(pts)})
    return out

res = {}
for k, m in masks.items():
    c = comps(m)
    res[k] = c
    print(k, len(c))

json.dump(res, open(sys.argv[2], 'w'), indent=1)
