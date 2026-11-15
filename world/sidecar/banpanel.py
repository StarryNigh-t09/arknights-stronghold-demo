"""banpanel.py — 从「本局信息」面板截图里数出禁用干员头像。

面板结构（2026-11-12 实测，1920x1080）：
  每张被禁用的头像是 ~110x110 的方块，右上角压一个红色 ✖（≈20x20，纯红）。
  头像按盟约分组，组名是左侧绿色圆圈图标 + 中文名（OCR 可读，见 names_ocr.py）。
  这一屏读不到干员名字（只有头像），所以这里只出「每行几个 + 每行 y」，组名在 JS 侧用 OCR 配。

用法：python banpanel.py <shot.png> [out.json]
输出：{"ok":true,"rows":[{"y":536,"xs":[378,531,...]}, ...]}
"""
import json, sys
import numpy as np
from PIL import Image

PITCH_MIN, PITCH_MAX = 130, 205


def red_points(im, x0=180, x1=1740, y0=140, y1=1080, step=10, min_px=6):
    a = np.array(im.convert('RGB')).astype(int)[y0:y1, x0:x1]
    m = (a[:, :, 0] > 140) & (a[:, :, 1] < 90) & (a[:, :, 2] < 90)
    ys, xs = np.nonzero(m)
    buckets = {}
    for y, x in zip(ys.tolist(), xs.tolist()):
        buckets.setdefault((y // step, x // step), []).append((y, x))
    groups = []
    for _k, v in buckets.items():
        if len(v) < min_px:
            continue
        groups.append([sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v), len(v)])
    merged = []
    for gy, gx, n in sorted(groups):
        for g in merged:
            if abs(g[0] - gy) < 16 and abs(g[1] - gx) < 16:
                t = g[2] + n
                g[0] = (g[0] * g[2] + gy * n) / t
                g[1] = (g[1] * g[2] + gx * n) / t
                g[2] = t
                break
        else:
            merged.append([gy, gx, n])
    return [(gy + y0, gx + x0) for gy, gx, n in merged if n >= 25]


def chain(xs):
    """行内挑出「等距头像链」，滤掉头像画里的红点。

    2026-11-12 23:4x 实测（data/bans-20261112-234322.png）：同一行的头像间距是 144~156px，
    但旧版把范围写死成 138~172 且没做去重 —— 一张头像被检出两个点（间距 8px）时整行就断链，
    结果 5 行只认出 1 行（3 张，真实是 23 张）。现在先合并近点，再丢掉孤立点，再取最长链。
    """
    xs = sorted(xs)
    ded = []
    for x in xs:
        if ded and x - ded[-1] < 60:
            continue
        ded.append(x)
    keep = [x for i, x in enumerate(ded)
            if any(abs(x - o) <= 240 for j, o in enumerate(ded) if j != i)]
    best = []
    for i in range(len(keep)):
        cur = [keep[i]]
        for j in range(i + 1, len(keep)):
            if PITCH_MIN <= keep[j] - cur[-1] <= PITCH_MAX:
                cur.append(keep[j])
        if len(cur) > len(best):
            best = cur
    return best


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'ok': False, 'error': 'usage: banpanel.py <shot.png> [out.json]'}))
        return 1
    im = Image.open(sys.argv[1])
    pts = red_points(im)
    # 先按 y 聚行（±10），再在行内挑等距链
    rows = []
    for y, x in sorted(pts):
        if rows and abs(rows[-1]['ys'][-1] - y) < 12:
            rows[-1]['ys'].append(y)
            rows[-1]['raw'].append(x)
        else:
            rows.append({'ys': [y], 'raw': [x]})
    out_rows = []
    for r in rows:
        keep = chain(r['raw'])
        if len(keep) >= 2:
            out_rows.append({'y': int(round(sum(r['ys']) / len(r['ys']))), 'xs': [int(round(v)) for v in keep]})
    res = {'ok': True, 'rows': out_rows, 'tiles': sum(len(r['xs']) for r in out_rows)}
    txt = json.dumps(res, ensure_ascii=False)
    if len(sys.argv) > 2:
        with open(sys.argv[2], 'w', encoding='utf-8') as f:
            f.write(txt)
    print(txt)
    return 0


if __name__ == '__main__':
    sys.exit(main())
