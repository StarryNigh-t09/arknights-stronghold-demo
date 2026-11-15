import sys
from PIL import Image

src = sys.argv[1]
im = Image.open(src).convert("RGB")
px = im.load()
W, H = im.size
cols = {}
for y in range(727, 812):
    for x in range(380, 1810):
        R, G, B = px[x, y]
        if R > 160 and G > 115 and B < 100 and R - B > 85:
            cols[x] = cols.get(x, 0) + 1
xs = sorted(cols)
groups = []
for x in xs:
    if groups and x - groups[-1][1] <= 8:
        groups[-1][1] = x
    else:
        groups.append([x, x])
for a, b in groups:
    cnt = sum(cols.get(x, 0) for x in range(a, b + 1))
    if cnt >= 250 and 20 <= (b - a) <= 100:
        print("badge", (a + b) // 2, "w", b - a, "cnt", cnt)
