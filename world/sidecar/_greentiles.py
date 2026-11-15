# -*- coding: utf-8 -*-
import sys, json
from PIL import Image
import numpy as np
a = np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(np.int16)
R,G,B = a[:,:,0],a[:,:,1],a[:,:,2]
g = (G>110)&(G>R+35)&(G>B+35)
h,w = g.shape
seen = np.zeros_like(g, dtype=bool)
out=[]
ys,xs = np.nonzero(g)
idx = np.argsort(ys*0+np.arange(len(ys)))
for k in idx:
    y0,x0 = ys[k],xs[k]
    if seen[y0,x0]: continue
    stack=[(y0,x0)]; seen[y0,x0]=True; pts=[]
    while stack:
        y,x = stack.pop(); pts.append((y,x))
        for dy in (-2,-1,0,1,2):
            for dx in (-2,-1,0,1,2):
                ny,nx=y+dy,x+dx
                if 0<=ny<h and 0<=nx<w and g[ny,nx] and not seen[ny,nx]:
                    seen[ny,nx]=True; stack.append((ny,nx))
    if len(pts)<1500: continue
    pa=np.array(pts)
    out.append({"cx":round(float(pa[:,1].mean()),1),"cy":round(float(pa[:,0].mean()),1),"area":len(pts),
                "x1":int(pa[:,1].min()),"x2":int(pa[:,1].max()),"y1":int(pa[:,0].min()),"y2":int(pa[:,0].max())})
out.sort(key=lambda o:-o["area"])
print(json.dumps({"n":len(out),"blobs":out[:30]}))
