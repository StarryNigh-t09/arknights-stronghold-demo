
import sys, numpy as np
from PIL import Image
def phase(path):
    im = np.asarray(Image.open(path).convert('L')).astype(float)
    band = im[170:820, 420:1700]
    e = np.abs(np.diff(band, axis=0)).sum(axis=1)
    e = e - e.mean()
    best = None
    for off in range(0, 110):
        idx = np.arange(off, len(e), 110)
        v = float(e[idx].mean())
        if best is None or v > best[1]:
            best = (off, v)
    # 最优相位 → 对应行中心 = 170 + off + 55 (+110k)
    return best[0], 170 + best[0] + 55
for p in sys.argv[1:]:
    o, y = phase(p)
    print(p.split('/')[-1], 'off', o, 'firstRowCenter', y)
