import sys, json
from PIL import Image
import numpy as np


def _runs(mask):
    """逐行找连续 True 段，返回 [(y, x0, x1_exclusive), ...]。numpy 向量化。"""
    H, W = mask.shape
    pad = np.zeros((H, W + 2), dtype=np.int8)
    pad[:, 1:W + 1] = mask
    d = np.diff(pad, axis=1)
    ys, xs = np.nonzero(d)
    out = []
    last = {}
    for y, x in zip(ys.tolist(), xs.tolist()):
        if d[y, x] > 0:
            last[y] = x
        else:
            y0 = last.pop(y)
            out.append((y, y0, x))
    return out


def chips(path, x0=80, x1=1720, y0=470, y1=900):
    """找甲板干员头顶的「I/II/III」小牌。

    2026-11-11 13:5x 用 numpy 重写：原来是 70 万像素的 Python 双循环 + 洪水填充，
    实测 8~9s，每回合要跑两次（整备区 + 放人），占了休整期近 1/4 时间。
    现在：numpy 出掩码 -> 逐行 run -> 相邻行 run 重叠就并查集合并，输出格式与老实现一致。
    老实现保留为 chips_old 便于对拍。
    """
    im = Image.open(path).convert("RGB").crop((x0, y0, x1, y1))
    a = np.asarray(im).astype(np.int16)
    mask = (a[:, :, 0] < 105) & (a[:, :, 1] < 105) & (a[:, :, 2] < 105)
    runs = _runs(mask)
    if not runs:
        return []

    parent = list(range(len(runs)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[rj] = ri

    by_row = {}
    for idx, (y, s, e) in enumerate(runs):
        by_row.setdefault(y, []).append(idx)
    for y in sorted(by_row):
        prev = by_row.get(y - 1)
        if not prev:
            continue
        prev_sorted = sorted(prev, key=lambda i: runs[i][1])
        for i in by_row[y]:
            s, e = runs[i][1], runs[i][2]
            for j in prev_sorted:
                s2, e2 = runs[j][1], runs[j][2]
                if s2 >= e:
                    break
                if e2 > s:
                    union(i, j)

    comp = {}
    for idx, (y, s, e) in enumerate(runs):
        r = find(idx)
        c = comp.get(r)
        if c is None:
            comp[r] = [s, e, y, y, e - s]
        else:
            if s < c[0]:
                c[0] = s
            if e > c[1]:
                c[1] = e
            if y < c[2]:
                c[2] = y
            if y > c[3]:
                c[3] = y
            c[4] += e - s

    # 2026-11-14 00:3x 真机（trace-night-2026-11-13T15-45-01 第 3 回合，布阵 0 上场）：
    # 「有徽章」不等于「徽章下面是牌」。收起态的空位、商店面板边缘都能检出 26~58px 的灰色方块，
    # 挑出来的行于是落在空位上，拖一次 2s 全是白干。这里顺手量按压点（徽章右下 +52,+99）周围
    # 11x11 的像素标准差：卡面有立绘和渐变，std 高；空位是纯色暗底，std 接近 0。
    # Node 侧（lib/run.js pickChipsFromDeckJson）用行内 pv 均值给候选行打分。
    # 用整图算而不是 chips() 的裁剪：大卡模式按压点在 y≈896，11px patch 会顶出 y1=900。
    full = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
    FH, FW = full.shape[0], full.shape[1]

    def patch_std(cx, cy, r=5):
        xa, ya = cx - r, cy - r
        xb, yb = cx + r + 1, cy + r + 1
        if xa < 0 or ya < 0 or xb > FW or yb > FH:
            return 0.0
        return float(full[ya:yb, xa:xb].std())

    cand = []
    for c in comp.values():
        w = c[1] - c[0]
        h = c[3] - c[2] + 1
        if not (26 <= w <= 58 and 26 <= h <= 58):
            continue
        if abs(w - h) > 12:
            continue
        if c[4] / float(w * h) < 0.35:
            continue
        cx = (c[0] + c[1] - 1) // 2 + x0
        cy = (c[2] + c[3] - 1) // 2 + y0
        cand.append({"x": cx, "y": cy, "w": w, "h": h, "n": c[4], "pv": round(patch_std(cx + 52, cy + 99), 1)})
    if not cand:
        return []
    cand.sort(key=lambda c: c["y"])
    rows = []
    for c in cand:
        if rows and abs(c["y"] - rows[-1][0]["y"]) <= 6:
            rows[-1].append(c)
        else:
            rows.append([c])
    out = [sorted(r, key=lambda c: -c["x"]) for r in rows]
    out.sort(key=lambda r: (-len(r), r[0]["y"]))
    return out


def chips_old(path, x0=80, x1=1720, y0=470, y1=900):
    """找甲板干员头顶的「Ⅰ/Ⅱ/Ⅲ」小牌。

    2026-11-10 实机：小牌是深灰圆角方块 + 白色罗马数字，边长 30..40。
    它的**纵向位置随界面变化**（商店展开/收起、镜头平移、详情面板遮罩都会挪）：
      - 09:19 那帧 y≈595；17:30 那帧 y≈760；17:45 那帧 y≈514（所以下线得放到 470）。
    纵向不再写死窄带，改成扫 470..900（下沿 2026-11-11 放到 900：折叠态干员甲板脚在 y≈911，头顶小牌落在 830~870，旧的 830 会把甲板行整个漏掉）。
    ⚠️ 只剩一个干员时会和悬浮的暂停按钮（Ⅱ）打平，只能靠「同分行取更靠下」兜底。
    """
    im = Image.open(path).convert("RGB")
    px = im.load()
    dark = set()
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = px[x, y]
            if r < 105 and g < 105 and b < 105:
                dark.add((x, y))
    seen = set()
    cand = []
    for p in dark:
        if p in seen:
            continue
        st = [p]; seen.add(p); comp = []
        while st:
            cx, cy = st.pop(); comp.append((cx, cy))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    q = (cx + dx, cy + dy)
                    if q in dark and q not in seen:
                        seen.add(q); st.append(q)
        xs = [c[0] for c in comp]; ys = [c[1] for c in comp]
        w = max(xs) - min(xs) + 1; h = max(ys) - min(ys) + 1
        if not (26 <= w <= 58 and 26 <= h <= 58):
            continue
        if abs(w - h) > 12:
            continue
        if len(comp) / float(w * h) < 0.35:
            continue
        cand.append({"x": (min(xs) + max(xs)) // 2, "y": (min(ys) + max(ys)) // 2, "w": w, "h": h, "n": len(comp)})
    if not cand:
        return []
    # 按行聚簇（y 相差 20 以内算同一行）。
    # ⚠️ 商店展开时，商店卡左上角的「阶」小牌和甲板小牌长得一模一样（都是深灰圆角方块 + 亮色罗马数字），
    #    而且数量更多（6 张卡 vs 3~4 个干员），旧代码「取牌最多的行」会选到商店那行。
    #    现在返回**所有行**，由 Node 侧按「成员最多、打平取更靠上」挑；甲板行永远在商店行上方。
    cand.sort(key=lambda c: c["y"])
    rows = []
    for c in cand:
        if rows and abs(c["y"] - rows[-1][0]["y"]) <= 6:
            rows[-1].append(c)
        else:
            rows.append([c])
    out = [sorted(r, key=lambda c: -c["x"]) for r in rows]
    out.sort(key=lambda r: (-len(r), r[0]["y"]))
    return out



def row_pv(row):
    """行内按压点像素标准差的均值：越高越像真卡面（空位/面板边缘接近 0）。"""
    if not row:
        return 0.0
    return sum(float(c.get("pv") or 0.0) for c in row) / float(len(row))


def best_row(rows):
    """甲板那一行：成员最多；打平时取更靠上的（商店行的 y 更大）。"""
    if not rows:
        return []
    rows = sorted(rows, key=lambda r: (-len(r), r[0]["y"]))
    return rows[0]


# 按压点相对徽章中心的纵向偏移。真整备区：徽章 y≈783 → 按压 y≈883。
PRESS_DY = 99
# 允许的余量：按压点必须落在木台亮带 [top-100, bottom+20] 内。
BAND_UP = 100
BAND_DOWN = 20


def _wood_counts(path, x0=200, x1=1700):
    """逐行统计「亮木色」像素数（x 200..1700）。木色判据来自 2026-11-12 实测。"""
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)[:, x0:x1]
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    wood = (r >= 150) & (g >= 120) & (b <= 150) & ((r - b) >= 45) & ((g - b) >= 10)
    return wood.sum(axis=1)


def bench_rail(path, y_lo=600, y_hi=1050, min_count=1000, min_len=30, min_mean=1100):
    """底部木台（整备区脚下那块平台）的上下沿，用来当甲板行的锚点。

    2026-11-12 实测（5 张折叠态帧 + 截图人工核对）：
      · 木台亮带恒定在 y 860..977，逐行木色计数 >1100；
      · 木台上方地图地面只有 650~760，所以「连续 >1000 且长度 ≥30」只命中木台；
      · 商店展开时底部被商店面板盖住，计数掉到 <150 → ok=False，调用方必须走 fallback。

    返回 {"ok": bool, "top": int|None, "bottom": int|None, "mean": int}。top/bottom 是包含端点。
    """
    cnt = _wood_counts(path)
    y_hi = min(y_hi, len(cnt))
    runs = []
    start = None
    for y in range(y_lo, y_hi):
        if cnt[y] > min_count:
            if start is None:
                start = y
        else:
            if start is not None:
                runs.append((start, y))
                start = None
    if start is not None:
        runs.append((start, y_hi))
    # 2026-11-14 01:0x 真机（deck-1794588394966.png，第 11 回合布阵）：甲板上站着干员时，
    # 干员身体把那几行的木色计数压到 1000 以下，木台带被切成 864-883 / 884-907 / 908-938 三小段，
    # 每段长度都 < min_len=60 被丢掉 → 只剩上方 635-731 那条（地图木栈道）当锚点，
    # 于是真甲板行 y=783（按压 882）被 BAND_UP 判在带外，bench 选到战场道具行 y=642（按压 741）→ 整回合按空。
    # 现在先合并间隔 <=8 行的小段（干员站位只切掉几行），再按长度/位置挑。
    #
    # 2026-11-14 17:5x 真机（.tmp/probe-deck.png，第 12 回合结束、折叠态、整备区 9 人）：
    # 实测木色带只剩 (635,723) 和 (945,982) 两条；真木台那条只有 37 行（干员站满把上沿全遮了），
    # 长度 < min_len=60 被丢 → 只剩上方地图木栈道 (635,723)，bottom=723 < 840 → ok=False，
    # 于是每一轮都报「甲板张数不可信」→ 布阵直接在扫甲板那步收手（第 12 回合 0 上场、掉 10 血）。
    # 代码从来只按「最靠下」挑带、并且要求 bottom>=840 才是木台，所以 min_len 收到 30 是安全的：
    # 上方那条木栈道永远比木台高，挑不到它；商店展开时木台行计数 <150，压根进不了 runs。
    def pick(segs):
        best = None
        for (t, b) in segs:
            if (b - t) < min_len:
                continue
            mean = float(cnt[t:b].mean())
            if mean < min_mean:
                continue
            # 取「最靠下」的合格带，不取最长的：
            # 2026-11-12 10:0x 实测，镜头平移后地图上方会出现另一条更长的木色带（804Z step-013 在 y 628..720），
            # 按长度会选到它，于是真整备区按压点 883 反而落在带外被判 0 张。甲板平台永远是最靠下那条。
            if best is None or b > best[1] or (b == best[1] and (b - t) > (best[1] - best[0])):
                best = (t, b, mean)
        return best

    # 2026-11-14 01:1x 真机（.tmp/dg.png，第 6 回合休整、折叠态、甲板 3 张）：
    # 甲板木台被干员身体切成 (864,883)(884,938)(940,982) 三小段，旧逻辑第一遍 pick(runs) 里三段都 <60 长度被丢，
    # 于是选中上方地图木栈道 (629,718)——它合格、但根本不是整备区；而且「第一遍选中就不再合并」
    # 让每回合都报 rail=629..718 → 按压点 y=882 落在带外 → bench=[] → lowConfidence → 布阵只能盲按。
    # 现在两遍都算、取「最靠下」那条；最靠下仍在上方（bottom < 840）说明木台被商店挡住 → ok=False。
    cands = []
    b1 = pick(runs)
    if b1 is not None:
        cands.append(b1)
    segs = [(t, b) for (t, b) in runs if t >= 840]
    merged = []
    for (t, b) in segs:
        if merged and t - merged[-1][1] <= 8:
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((t, b))
    b2 = pick(merged)
    if b2 is not None:
        cands.append(b2)
    if not cands:
        return {"ok": False, "top": None, "bottom": None, "mean": 0}
    # 2026-11-14 18:0x 夹具 bench-2.png：两遍算法给出 (863,982)（合并后整条木台）和 (940,982)（未合并的最后一小段），
    # 下沿都是 982，旧的 max(key=bottom) 取到先出现的 (940,982) → rail.top 从 863 抬到 940，
    # 于是 bench_rows 的「徽章必须在木台上沿上方 40 行」判据被放宽，木台里的杂物块 (1536,872) 多报成 1 张（2 张变 3 张）。
    # 下沿打平时取更宽的那条（top 更小）：木台上沿只会更保守，按压带也覆盖整块平台。
    best = max(cands, key=lambda x: (x[1], -x[0]))
    if best[1] < 840:
        return {"ok": False, "top": None, "bottom": None, "mean": 0}
    return {"ok": True, "top": int(best[0]), "bottom": int(best[1]), "mean": int(best[2])}


def bench_rows(path, rows=None):
    """只留「真整备区」那一行 —— 干员站在底部木台上、按压点落在木台亮带内。

    为什么需要它（2026-11-12 09:0x 夹具 + 人工看图确认）：
      场上道具（蓝色飞行器 / 青色球 / 黑色箱）头顶挂着同款「罗马数字」深灰牌，
      3 个一排、间距 142，与真整备区干员行的几何完全一致。旧规则「取最靠下的多成员行」
      在整备区空着的时候就会选中道具行，报「整备区 3 张」—— 这就是假阳性的根因。
      真整备区按压点 y≈883 落在木台带内，道具行按压点 y≈741 在带外，用锚点一次分开。

    返回 {"rail": {...}, "bench": [row, ...], "fallback": bool}；fallback=True 时调用方按旧规则走。
    """
    rail = bench_rail(path)
    if not rail["ok"]:
        return {"rail": rail, "bench": [], "fallback": True}
    if rows is None:
        rows = chips(path)
    lo = rail["top"] - BAND_UP
    hi = rail["bottom"] + BAND_DOWN
    kept = []
    for r in rows:
        if not r:
            continue
        # 2026-11-14 01:2x：徽章必须浮在木台**上方**（实测甲板行徽章 y≈783，木台上沿 863 → 差 80）。
        # 夹具 bench-2.png 里 (1536,872) 是木台里面的杂物块，按压点 971 也落在带内，只按 BAND 判会多报 1 张。
        if all(lo <= c["y"] + PRESS_DY <= hi and c["y"] <= rail["top"] - 40 for c in r):
            kept.append(r)
    kept.sort(key=lambda r: -r[0]["y"])
    return {"rail": rail, "bench": kept, "fallback": False}


if __name__ == "__main__":
    rows = chips(sys.argv[1])
    br = bench_rows(sys.argv[1], rows)
    out = json.dumps(
        {"rows": rows, "best": best_row(rows), "rail": br["rail"], "bench": br["bench"], "railFallback": br["fallback"]},
        ensure_ascii=False,
    )
    if len(sys.argv) > 2:
        open(sys.argv[2], "w", encoding="utf-8").write(out)
    else:
        print(out)
