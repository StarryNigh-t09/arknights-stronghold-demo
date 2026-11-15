
import sys
import numpy as np
from PIL import Image
import colorsys
im = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float32) / 255.0
r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]
mx = im.max(axis=2); mn = im.min(axis=2)
v = mx; s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
# hue
h = np.zeros_like(mx)
d = mx - mn + 1e-6
m = (mx == r); h[m] = ((g - b) / d)[m] % 6
m = (mx == g); h[m] = ((b - r) / d + 2)[m]
m = (mx == b); h[m] = ((r - g) / d + 4)[m]
h = h * 60
mask = (s > 0.45) & (v > 0.35)
hh = h[mask]
hist, edges = np.histogram(hh, bins=36, range=(0, 360))
for i, c in enumerate(hist):
    if c > 2000:
        print(int(edges[i]), int(edges[i + 1]), int(c))
