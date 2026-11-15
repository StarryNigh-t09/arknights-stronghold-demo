
import sys, json, numpy as np
from PIL import Image
def blue_box(path):
    im = np.asarray(Image.open(path).convert('RGB')).astype(int)
    r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    m = (b > 150) & (b - r > 40) & (g > 120) & (g < 230) & (r < 140)
    m[:, 1700:] = False
    ys, xs = np.nonzero(m)
    if len(xs) < 200:
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()), int(len(xs))]
for p in sys.argv[1:]:
    print(p.split('/')[-1], blue_box(p))
