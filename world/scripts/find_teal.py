import sys
from PIL import Image

src = sys.argv[1]
l, t, r, b = map(int, sys.argv[2:6])
im = Image.open(src).convert("RGB")
W, H = im.size
px = im.load()
xs, ys = [], []
for y in range(t, min(b, H)):
    for x in range(l, min(r, W)):
        R, G, B = px[x, y]
        if G > 140 and B > 120 and R < 130 and G - R > 60:
            xs.append(x); ys.append(y)
if not xs:
    print("no teal pixels")
    sys.exit(0)
print("teal count", len(xs))
print("bbox", min(xs), min(ys), max(xs), max(ys))
print("center", (min(xs)+max(xs))//2, (min(ys)+max(ys))//2)
