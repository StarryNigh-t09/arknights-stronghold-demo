from PIL import Image
base = r"./world/shots/"
def bars(path, box=(400, 280, 1000, 560)):
    im = Image.open(path).convert("RGB")
    x0, y0, x1, y1 = box
    px = im.load()
    rows = []
    for y in range(y0, y1):
        run = 0
        start = None
        for x in range(x0, x1):
            r, g, b = px[x, y]
            white = r > 190 and g > 190 and b > 190
            if white:
                if start is None:
                    start = x
                run += 1
            else:
                if run >= 45:
                    rows.append((start, y, run))
                run = 0
                start = None
        if run >= 45:
            rows.append((start, y, run))
    # 合并相邻行的同一段
    out = []
    for s, y, w in rows:
        if out and abs(out[-1][0] - s) < 12 and y - out[-1][1] <= 2:
            out[-1] = (min(out[-1][0], s), out[-1][1], max(out[-1][2], w), y)
        else:
            out.append((s, y, w, y))
    return [(x, y0_, w, y1_) for x, y0_, w, y1_ in out]

for n in ["dk_fold", "eq1", "eq3", "eq4"]:
    print(n, bars(base + n + ".png"))
