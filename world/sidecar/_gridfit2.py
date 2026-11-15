import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('L')
W, H = im.size
px = im.load()
xs = range(500, 1500, 2)
energy = []
for y in range(1, H - 1):
    s = 0
    for x in xs:
        s += abs(px[x, y + 1] - px[x, y - 1])
    energy.append((y, s))
best = None
for step in range(95, 130):
    for off in range(0, step):
        tot = 0; n = 0
        y = off
        while y < H - 1:
            tot += energy[y - 1][1]; n += 1
            y += step
        if n > 6:
            avg = tot / n
            if best is None or avg > best[0]:
                best = (avg, step, off)
print('rows step/offset/score', best)