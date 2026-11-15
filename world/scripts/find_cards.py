import sys
from PIL import Image
img = Image.open(sys.argv[1]).convert("RGB")
px = img.load()
ys = [int(v) for v in sys.argv[2:]] or [880]
for y in ys:
    vals = []
    for x in range(380, 1830):
        R, G, B = px[x, y]
        vals.append((R * 299 + G * 587 + B * 114) // 1000)
    # 平滑
    sm = []
    for i, v in enumerate(vals):
        a = max(0, i - 4); b = min(len(vals), i + 5)
        sm.append(sum(vals[a:b]) // (b - a))
    runs = []
    inrun = False
    for i, v in enumerate(sm):
        bright = v >= 42
        if bright and not inrun:
            start = i; inrun = True
        elif not bright and inrun:
            runs.append((380 + start, 380 + i - 1)); inrun = False
    if inrun:
        runs.append((380 + start, 380 + len(sm) - 1))
    runs = [r for r in runs if r[1] - r[0] >= 60]
    print("y", y, "->", [(a, b, (a + b) // 2, b - a) for a, b in runs])
