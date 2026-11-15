import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('L')
W, H = im.size
px = im.load()
ys = range(230, 510, 2)
energy = []
for x in range(1, W - 1):
    s = 0
    for y in ys:
        s += abs(px[x + 1, y] - px[x - 1, y])
    energy.append((x, s))
best = None
for step in range(100, 121, 1):
    for off in range(0, step):
        tot = 0; n = 0
        x = off
        while x < W - 1:
            tot += energy[x - 1][1]; n += 1
            x += step
        if n > 8:
            avg = tot / n
            if best is None or avg > best[0]:
                best = (avg, step, off)
print('best step/offset/score', best)