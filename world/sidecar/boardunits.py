# -*- coding: utf-8 -*-
import sys, json
from PIL import Image
import numpy as np
a = np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(np.int16)
R,G,B = a[:,:,0],a[:,:,1],a[:,:,2]
# 我方干员血条：偏蓝/青（敌方是橙红）
m = (B > 120) & (B > R + 40) & (G > 90) & (G < B + 60)
m[:160,:] = False; m[730:,:] = False; m[:, :380] = False; m[:, 1580:] = False
h,w = m.shape
ys,xs = np.nonzero(m)
seen = np.zeros_like(m, dtype=bool)
out=[]
for k in range(len(ys)):
    y0,x0 = ys[k], xs[k]
    if seen[y0,x0]: continue
    stack=[(y0,x0)]; seen[y0,x0]=True; pts=[]
    while stack:
        y,x = stack.pop(); pts.append((y,x))
        for dy in range(-2,3):
            for dx in range(-2,3):
                ny,nx = y+dy,x+dx
                if 0<=ny<h and 0<=nx<w and m[ny,nx] and not seen[ny,nx]:
                    seen[ny,nx]=True; stack.append((ny,nx))
    if len(pts) < 120: continue
    pa = np.array(pts)
    x1,x2 = int(pa[:,1].min()), int(pa[:,1].max())
    y1,y2 = int(pa[:,0].min()), int(pa[:,0].max())
    wid = x2-x1; hei = y2-y1
    if wid < 36 or wid < hei*2: continue   # 要横条
    out.append({"cx": round(float(pa[:,1].mean()),1), "cy": round(float(pa[:,0].mean()),1), "w": wid, "h": hei, "n": len(pts)})
out.sort(key=lambda o: (o["cy"], o["cx"]))
print(json.dumps({"n": len(out), "bars": out[:20]}))
