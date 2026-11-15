
import sys, json
import numpy as np
from PIL import Image
im = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float32) / 255.0
r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]
mx = im.max(axis=2); mn = im.min(axis=2)
v = mx; s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
h = np.zeros_like(mx); d = mx - mn + 1e-6
m = (mx == r); h[m] = ((g - b) / d)[m] % 6
m = (mx == g); h[m] = ((b - r) / d + 2)[m]
m = (mx == b); h[m] = ((r - g) / d + 4)[m]
h = h * 60

bands = {
  'blue_gate': ((h > 168) & (h < 215) & (s > 0.35) & (v > 0.35)),
  'green':     ((h > 105) & (h < 168) & (s > 0.35) & (v > 0.35)),
  'purple':    ((h > 245) & (h < 320) & (s > 0.28) & (v > 0.30)),
  'rose':      ((h > 320) & (h <= 360) & (s > 0.25) & (v > 0.55)) | ((h >= 0) & (h < 8) & (s > 0.25) & (v > 0.75)),
  'red_gate':  (((h > 340) & (h <= 360)) | (h < 12)) & (s > 0.55) & (v > 0.55) & (g < 0.45),
  'yellow':    ((h > 46) & (h < 62) & (s > 0.55) & (v > 0.55)),
}

def comps(mask, min_area=120, max_area=1400):
    hh, ww = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]:
            continue
        stack = [(y0, x0)]; seen[y0, x0] = True; pts = []
        while stack:
            y, x = stack.pop(); pts.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < hh and 0 <= nx < ww and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True; stack.append((ny, nx))
        if not (min_area <= len(pts) <= max_area):
            continue
        pa = np.array(pts)
        y1, y2 = pa[:, 0].min(), pa[:, 0].max(); x1, x2 = pa[:, 1].min(), pa[:, 1].max()
        bw, bh = x2 - x1 + 1, y2 - y1 + 1
        if not (30 <= bw <= 75 and 30 <= bh <= 75):
            continue
        fill = len(pts) / float(bw * bh)
        if fill > 0.5 or fill < 0.08:
            continue
        cy, cx = pa[:, 0].mean(), pa[:, 1].mean()
        inner = mask[int(cy) - 6:int(cy) + 7, int(cx) - 6:int(cx) + 7]
        hole = 1.0 - inner.mean()
        if hole < 0.5:
            continue
        out.append({'cx': round(float(cx), 1), 'cy': round(float(cy), 1), 'w': int(bw), 'h': int(bh), 'fill': round(float(fill), 2), 'hole': round(float(hole), 2)})
    return out

res = {}
for k, mm in bands.items():
    c = comps(mm)
    res[k] = c
    print(k, len(c))
json.dump(res, open(sys.argv[2], 'w'), indent=1)
