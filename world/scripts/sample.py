import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB")
px = im.load()
for cx, cy in [(562,768),(843,768),(1119,768),(1394,768),(1681,768),(562,760),(843,760)]:
    best = {}
    for dy in range(-12,13):
        for dx in range(-12,13):
            c = px[cx+dx, cy+dy]
            best[c] = best.get(c,0)+1
    top = sorted(best.items(), key=lambda kv:-kv[1])[:3]
    print((cx,cy), top)
