
import sys, json, math
import numpy as np
from PIL import Image
im = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float32)
H, W, _ = im.shape
refs = {
  'green':  (60, 200, 110),
  'yellow': (255, 220, 40),
  'gold':   (240, 160, 30),
  'purple': (160, 110, 224),
  'red':    (224, 60, 60),
  'blue':   (58, 160, 224),
  'rose':   (255, 158, 203),
  'black':  (16, 16, 16),
}
cols = [485, 603, 721, 839, 957, 1075, 1193, 1311, 1429, 1547]
rows = [236, 346, 456, 566, 676, 786, 896]
angles = [i * 2 * math.pi / 48 for i in range(48)]

def sample(cx, cy, r):
    x = int(round(cx + r * math.cos(angles[0])))
    return None

def ring_score(cx, cy, name):
    ref = np.array(refs[name], dtype=np.float32)
    hit = 0; tot = 0
    for r in (22, 24, 26, 28):
        for a in angles:
            x = int(round(cx + r * math.cos(a))); y = int(round(cy + r * math.sin(a)))
            if not (0 <= x < W and 0 <= y < H):
                continue
            px = im[y, x]
            d = float(np.linalg.norm(px - ref))
            tot += 1
            if d < 80:
                hit += 1
    return hit / max(tot, 1)

out = {}
for row in rows:
    line = []
    for cx in cols:
        cy = row
        best = ('-', 0.0)
        for name in refs:
            s = ring_score(cx, cy, name)
            if s > best[1]:
                best = (name, s)
        if best[1] >= 0.45:
            line.append(str(cx) + ':' + best[0] + '(' + str(round(best[1], 2)) + ')')
        else:
            line.append(str(cx) + ':-')
    out[row] = line
    print('y=' + str(row), ' '.join(line))
json.dump(out, open(sys.argv[2], 'w'), indent=1)
