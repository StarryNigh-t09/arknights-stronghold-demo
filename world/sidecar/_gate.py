
import sys, numpy as np
from PIL import Image
def gate(path):
    im = np.asarray(Image.open(path).convert('RGB')).astype(int)
    sub = im[380:720, 380:720]
    r, g, b = sub[:, :, 0], sub[:, :, 1], sub[:, :, 2]
    m = (b > 190) & (g > 150) & (r < 130)
    ys, xs = np.nonzero(m)
    if len(xs) < 100:
        return None
    return dict(n=int(len(xs)), cx=int(xs.mean()) + 380, cy=int(ys.mean()) + 380,
                x0=int(xs.min()) + 380, x1=int(xs.max()) + 380, y0=int(ys.min()) + 380, y1=int(ys.max()) + 380)
for p in sys.argv[1:]:
    print(p.split('/')[-1], gate(p))
