# -*- coding: utf-8 -*-
import sys, json
from collections import deque
from PIL import Image
import numpy as np

def comps(mask, scale=4):
    h, w = mask.shape
    H, W = h // scale, w // scale
    small = mask[:H*scale:scale, :W*scale:scale]
    seen = np.zeros_like(small, dtype=bool)
    out = []
    for y0 in range(H):
        for x0 in range(W):
            if not small[y0, x0] or seen[y0, x0]:
                continue
            q = deque([(x0, y0)]); seen[y0, x0] = True
            cnt = 0; xmin = xmax = x0; ymin = ymax = y0
            while q:
                x, y = q.popleft(); cnt += 1
                if x < xmin: xmin = x
                if x > xmax: xmax = x
                if y < ymin: ymin = y
                if y > ymax: ymax = y
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    nx, ny = x+dx, y+dy
                    if 0 <= nx < W and 0 <= ny < H and small[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True; q.append((nx, ny))
            out.append({"cells": cnt*scale*scale, "cx": (xmin+xmax)//2*scale, "cy": (ymin+ymax)//2*scale,
                        "x0": xmin*scale, "x1": xmax*scale, "y0": ymin*scale, "y1": ymax*scale})
    out.sort(key=lambda t: -t["cells"])
    return out[:4]

def diamonds(path):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
    R, G, B = a[:,:,0], a[:,:,1], a[:,:,2]
    mx = np.maximum(np.maximum(R, G), B); mn = np.minimum(np.minimum(R, G), B)
    m = (mn > 205) & ((mx - mn) < 30)
    m[:170, :] = False; m[930:, :] = False; m[:, :380] = False; m[:, 1700:] = False
    return comps(m)

if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(json.dumps({"p": p.split("\\")[-1], "d": diamonds(p)}, ensure_ascii=False))
