# -*- coding: utf-8 -*-
import sys, json
from PIL import Image
import numpy as np

a = np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(np.int16)
G = a[:,:,1]; R = a[:,:,0]; B = a[:,:,2]
g = (G > 110) & (G > R + 35) & (G > B + 35)
out = []
for spec in sys.argv[2:]:
    x, y = [int(v) for v in spec.split(",")]
    box = g[max(0,y-40):y+40, max(0,x-40):x+40]
    out.append({"p": [x, y], "n": int(box.sum()), "ratio": round(float(box.mean()), 3)})
print(json.dumps({"g": out}))
