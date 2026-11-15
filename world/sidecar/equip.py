import sys, json
from PIL import Image


def find_items(path, box):
    """在给定矩形里找装备图标（甲板干员头顶那一排）。
    判据：非暖色沙地、非纯黑、且（彩色 或 金属灰）。输出外接框（屏幕坐标，左上角）。
    """
    x0, y0, x1, y1 = box
    im = Image.open(path).convert("RGB")
    px = im.load()
    mask = set()
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = px[x, y]
            mx = max(r, g, b); mn = min(r, g, b)
            if r - b > 40 and r > 140:      # 沙地
                continue
            if r < 110 and g < 110 and b < 110:  # 深色牌
                continue
            grey = abs(r - g) < 26 and abs(g - b) < 26 and 70 < mx < 200
            color = (mx - mn) > 60 and mx > 90
            if grey or color:
                mask.add((x, y))
    seen = set()
    out = []
    for p in mask:
        if p in seen:
            continue
        st = [p]; seen.add(p); comp = []
        while st:
            cx, cy = st.pop(); comp.append((cx, cy))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    q = (cx + dx, cy + dy)
                    if q in mask and q not in seen:
                        seen.add(q); st.append(q)
        if len(comp) < 300 or len(comp) > 7000:
            continue
        xs = [c[0] for c in comp]; ys = [c[1] for c in comp]
        w = max(xs) - min(xs) + 1; h = max(ys) - min(ys) + 1
        if not (24 <= w <= 80 and 24 <= h <= 80):
            continue
        if len(comp) / float(w * h) < 0.22:
            continue
        out.append({"x": min(xs), "y": min(ys), "w": w, "h": h, "n": len(comp)})
    out.sort(key=lambda c: c["x"])
    return out


if __name__ == "__main__":
    path = sys.argv[1]
    box = json.loads(sys.argv[2]) if len(sys.argv) > 2 else [900, 470, 1700, 660]
    res = find_items(path, box)
    txt = json.dumps({"ok": True, "items": res}, ensure_ascii=False)
    if len(sys.argv) > 3:
        open(sys.argv[3], "w", encoding="utf-8").write(txt)
    else:
        print(txt)
