
import sys, numpy as np
from PIL import Image
def prof(path):
    im = np.asarray(Image.open(path).convert('L')).astype(float)
    return im[:, 380:1700]
a = prof(sys.argv[1]); b = prof(sys.argv[2])
# 只在棋盘区域比较：y 220..700
Ay = a[220:700]; By = b[220:700]
best = None
for dy in range(-140, 141, 1):
    y0 = 220 + dy
    if y0 < 0 or y0 + 480 > b.shape[0]:
        continue
    B = b[y0:y0 + 480]
    d = np.abs(Ay - B).mean()
    if best is None or d < best[1]:
        best = (dy, d)
print('best dy', best[0], 'mad', round(best[1], 2))
