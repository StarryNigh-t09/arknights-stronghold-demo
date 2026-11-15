# -*- coding: utf-8 -*-
"""甲板/整备区 Q 版小人识别：按列找深色小人 → 与候选 chibi 图做归一化相关。

用法：
  python sidecar/chibi.py <shot.png> [--cand 名字,名字,...] [--json out.json]

候选不传时用 assets/chibi 下全部 png（22 个）。用户 m07310 要求只比对
「本局编队里有的干员」，调用方应传 --cand 限制候选，皮肤差异靠多模板实现
（同一干员可有 <名字>__2.png 这类第二套外观）。
"""
import sys, os, json, glob

def main():
    import numpy as np
    from PIL import Image

    args = sys.argv[1:]
    if not args:
        print(json.dumps({"ok": False, "error": "need png"}, ensure_ascii=False)); return
    shot = args[0]
    cand = None
    out = None
    dirs = None
    i = 1
    while i < len(args):
        if args[i] == '--cand':
            cand = [x for x in args[i+1].split(',') if x]; i += 2
        elif args[i] == '--dir':
            dirs = [x for x in args[i+1].split(',') if x]; i += 2
        elif args[i] == '--json':
            out = args[i+1]; i += 2
        else:
            i += 1

    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.join(here, '..', 'assets', 'chibi')
    roots = [os.path.join(here, '..', 'assets', d) for d in dirs] if dirs else [root]

    im = Image.open(shot).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    H, Wd = a.shape[:2]
    # 整备区木台：y 600~1000，x 260~1700（1920x1080 基准，按实际分辨率等比）
    sx = Wd / 1920.0
    y0, y1 = int(600 * sx), min(H, int(1000 * sx))
    x0, x1 = int(260 * sx), min(Wd, int(1700 * sx))
    sub = a[y0:y1, x0:x1]
    lum = sub.sum(axis=2) / 3.0
    # 小人偏暗（木台亮度 ~170），用 120 做阈值，同时要求不是蓝色按钮那种纯色块
    dark = (lum < 118) & (np.abs(sub[:, :, 2] - sub[:, :, 0]) < 90)
    # 木台底边/阴影会横贯整行，先把「暗像素占满 >55% 宽」的行剔掉，免得被当成一排小人
    rowfrac = dark.mean(axis=1)
    bad_rows = rowfrac > 0.55
    dark[bad_rows, :] = False
    colsum = dark.sum(axis=0)
    th = max(8, int(0.015 * (y1 - y0)))
    cols = []
    run = None
    for x in range(len(colsum)):
        if colsum[x] >= th:
            if run is None: run = [x, x]
            else: run[1] = x
        else:
            if run is not None:
                if run[1] - run[0] >= 18: cols.append(run)
                run = None
    if run is not None and run[1] - run[0] >= 18: cols.append(run)
    # 合并间隔 < 14px 的列块（同一个小人被武器/披风切开）
    merged = []
    for c in cols:
        if merged and c[0] - merged[-1][1] <= 14: merged[-1][1] = c[1]
        else: merged.append([c[0], c[1]])
    merged = [c for c in merged if 50 <= (c[1] - c[0]) <= 190]
    slots = []
    for c in merged:
        xs, xe = c
        band = dark[:, max(0, xs - 4):min(dark.shape[1], xe + 5)]
        rows = np.where(band.sum(axis=1) >= 3)[0]
        if len(rows) == 0: continue
        ys, ye = int(rows[0]), int(rows[-1])
        if ye - ys < 40: continue
        slots.append({"x": int(x0 + (xs + xe) / 2), "box": [int(x0 + xs), int(y0 + ys), int(x0 + xe), int(y0 + ye)]})
    res = {"ok": True, "slots": slots, "picked": []}

    names = cand
    if names is None:
        seen = set()
        for rt in roots:
            for pp in glob.glob(os.path.join(rt, '*.png')):
                b = os.path.splitext(os.path.basename(pp))[0]
                seen.add(b.split('__')[0])
        names = sorted(seen)
    # 模板：每个候选可能有 <名>.png / <名>__2.png（皮肤）
    tmpl = {}
    for n in names:
        files = []
        for rt in roots:
            files.append(os.path.join(rt, n + '.png'))
            files.extend(sorted(glob.glob(os.path.join(rt, n + '__*.png'))))
        arrs = []
        for f in files:
            if not os.path.exists(f): continue
            t = Image.open(f).convert('RGBA')
            bb = t.split()[3].getbbox()
            if not bb: continue
            t = t.crop(bb)
            arrs.append(t)
        if arrs: tmpl[n] = arrs

    def feat(img, size=(48, 96)):
        # 合成到中灰背景 → 灰度 → 归一化
        bg = Image.new('RGBA', img.size, (150, 140, 120, 255))
        bg.alpha_composite(img.convert('RGBA'))
        g = np.asarray(bg.convert('L').resize(size)).astype(np.float32)
        g -= g.mean()
        s = g.std()
        return g / (s if s > 1e-6 else 1)

    for s in slots:
        bx = s["box"]
        crop = im.crop((bx[0] - 6, bx[1] - 6, bx[2] + 6, bx[3] + 6))
        f0 = feat(crop)
        best = None
        for n, arrs in tmpl.items():
            sc = -2
            for t in arrs:
                v = float((f0 * feat(t)).mean())
                if v > sc: sc = v
            if best is None or sc > best[0]: best = (sc, n)
        s["name"] = best[1] if best else None
        s["score"] = round(best[0], 3) if best else None
        # 第二、三名用来判断可不可信
        allsc = sorted(((max(float((f0 * feat(t)).mean()) for t in arrs), n) for n, arrs in tmpl.items()), reverse=True)
        s["top3"] = [[n, round(v, 3)] for v, n in allsc[:3]]
        res["picked"].append({"x": s["x"], "name": s["name"], "score": s["score"]})

    if out:
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(res, f, ensure_ascii=False, indent=1)
    print(json.dumps(res, ensure_ascii=False))

if __name__ == '__main__':
    main()
