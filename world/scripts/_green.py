# 找画面里的「可放置」绿色高亮格，输出格心坐标（游戏坐标 1920x1080）
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
w, h = im.size
px = im.load()
pts = []
for y in range(0, h, 4):
    for x in range(0, w, 4):
        r, g, b = px[x, y]
        if g > 120 and g > r + 40 and g > b + 40:
            pts.append((x, y))
if not pts:
    print(json.dumps({"n": 0}))
    sys.exit()
# 按 100px 网格聚成 tile，取每格点数的加权中心
from collections import defaultdict
cells = defaultdict(list)
for x, y in pts:
    cells[(x // 100, y // 100)].append((x, y))
grid = []
for k, arr in cells.items():
    if len(arr) < 40:  # 噪声过滤
        continue
    gx = sum(p[0] for p in arr) / len(arr)
    gy = sum(p[1] for p in arr) / len(arr)
    grid.append({"x": round(gx), "y": round(gy), "n": len(arr)})
grid.sort(key=lambda d: -d["n"])
print(json.dumps({"n": len(pts), "tiles": grid[:12]}, ensure_ascii=False))
