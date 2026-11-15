import sys, json
from PIL import Image
import numpy as np

def tiles(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    g = (a[:,:,1] > 110) & (a[:,:,1] > a[:,:,0] + 35) & (a[:,:,1] > a[:,:,2] + 35)
    H, W = g.shape
    grid = {}
    ys, xs = np.nonzero(g)
    for x, y in zip(xs.tolist(), ys.tolist()):
        if not (400 <= x < 1620 and 180 <= y < 900):
            continue
        key = (x // 40, y // 40)
        c = grid.get(key)
        if c is None:
            grid[key] = [1, x, y, x, y]
        else:
            c[0] += 1
            if x < c[1]: c[1] = x
            if y < c[2]: c[2] = y
            if x > c[3]: c[3] = x
            if y > c[4]: c[4] = y
    # 相邻格合并成块
    keys = set(grid.keys())
    seen = set()
    out = []
    for k in list(keys):
        if k in seen: continue
        stack = [k]; seen.add(k); comp = []
        while stack:
            cx, cy = stack.pop()
            comp.append(grid[(cx, cy)])
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    q = (cx + dx, cy + dy)
                    if q in keys and q not in seen:
                        seen.add(q); stack.append(q)
        n = sum(c[0] for c in comp)
        x0 = min(c[1] for c in comp); y0 = min(c[2] for c in comp)
        x1 = max(c[3] for c in comp); y1 = max(c[4] for c in comp)
        if n < 60: continue
        out.append({"x": (x0 + x1) // 2, "y": (y0 + y1) // 2, "n": n, "w": x1 - x0 + 1, "h": y1 - y0 + 1})
    out.sort(key=lambda t: -t["n"])
    return out

if __name__ == "__main__":
    print(json.dumps({"tiles": tiles(sys.argv[1])[:60]}))
