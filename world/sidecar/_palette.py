
import sys
import numpy as np
from PIL import Image
im = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.int16)
R, G, B = im[:, :, 0], im[:, :, 1], im[:, :, 2]
mx = im.max(axis=2); mn = im.min(axis=2)
sat = (mx - mn)
# 只统计高饱和像素
mask = (sat > 90) & (mx > 110)
cols = im[mask]
q = (cols // 16) * 16
uniq, counts = np.unique(q.reshape(-1, 3), axis=0, return_counts=True)
idx = np.argsort(-counts)[:18]
for i in idx:
    print(uniq[i].tolist(), int(counts[i]))
