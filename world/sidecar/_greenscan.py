import sys, json
from PIL import Image
import numpy as np
p = sys.argv[1]
im = Image.open(p).convert('RGB')
a = np.asarray(im).astype(int)
R,G,B = a[:,:,0], a[:,:,1], a[:,:,2]
m = (G > R+25) & (G > B+25) & (G > 110)
print('green px', int(m.sum()), 'shape', a.shape)
ys, xs = np.nonzero(m)
if len(xs):
    print('bbox', xs.min(), ys.min(), xs.max(), ys.max())
    # sample a few colors
    idx = np.random.RandomState(0).choice(len(xs), 5, replace=False)
    print('samples', [tuple(a[ys[i], xs[i]]) for i in idx])
