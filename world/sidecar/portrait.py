#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""整备区立绘/头像匹配器（纯 PIL，无第三方依赖）。

用法：
    python portrait.py <out.json> <screenshot.png> <x1,y1,w,h> [<x2,y2,w,h> ...]

对每个矩形从截图里裁一块，与 world/assets/portraits/ 下的 143 张 128x128
头像模板比对，输出 top3：

    { "x1,y1,w,h": [ {"name": "灰喉", "dist": 0.0123}, ... ] }

匹配距离全部大于阈值（默认 0.15）时返回 [{"name": null, "dist": <最小距离>}]。

算法（32x32 RGB 均值网格 + alpha 掩码）：
  1. 模板转 RGBA，半透明像素先合成到中灰 (128,128,128) 上，再 LANCZOS 缩到
     32x32，得到 3072 维 RGB 描述子；同时把 alpha 通道缩到 32x32 当权重。
  2. 截图裁块缩到 32x32 得到查询描述子。
  3. 距离 = 只在模板不透明的像素上求三通道平均绝对误差 / 255，取值 0..1。
     这样整备区背景色、卡片底色变化不会污染距离。
  4. 查询额外取中心 90%、80% 两个裁切变体，取三者的最小距离（容忍裁块带边）。
  5. 防「空/地形」：查询 32x32 灰度标准差 < 4（几乎纯色）直接判 null；
     否则最小距离 > 阈值也判 null。

阈值可用环境变量 PORTRAIT_THRESHOLD 覆盖，或命令行追加 --threshold 0.18。
"""
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
WORLD = os.path.dirname(HERE)
DATA = os.path.join(WORLD, "data", "portraits.json")

GRID = 32
GRAY = (128, 128, 128)
DEFAULT_THRESHOLD = 0.15
FLAT_STD = 4.0


def _descriptor(img, alpha=None):
    """RGBA 图 -> (32x32 RGB bytes, 32x32 alpha weights)。"""
    rgba = img.convert("RGBA")
    base = Image.new("RGB", rgba.size, GRAY)
    base.paste(rgba, (0, 0), rgba)
    rgb = base.resize((GRID, GRID), Image.LANCZOS).tobytes()
    if alpha is None:
        alpha = rgba.getchannel("A")
    weights = list(alpha.resize((GRID, GRID), Image.LANCZOS).tobytes())
    return rgb, weights


def _distance(query, template, weights, min_weight=40):
    total = 0.0
    wsum = 0.0
    for i in range(GRID * GRID):
        w = weights[i]
        if w <= min_weight:          # 模板这里是透明背景，不参与比较
            continue
        j = i * 3
        total += w * (abs(query[j] - template[j])
                      + abs(query[j + 1] - template[j + 1])
                      + abs(query[j + 2] - template[j + 2]))
        wsum += w * 3
    if not wsum:
        return 1.0
    return total / wsum / 255.0


def _flat_std(rgb32):
    """32x32 灰度标准差，用来看这块是不是几乎纯色（空/地形）。"""
    n = GRID * GRID
    vals = [0.299 * rgb32[i * 3] + 0.587 * rgb32[i * 3 + 1] + 0.114 * rgb32[i * 3 + 2]
            for i in range(n)]
    mean = sum(vals) / n
    var = sum((v - mean) ** 2 for v in vals) / n
    return var ** 0.5


def load_templates():
    with open(DATA, encoding="utf-8") as fh:
        meta = json.load(fh)
    items = []
    for name, rec in meta.items():
        path = os.path.join(WORLD, rec["file"].replace("/", os.sep))
        try:
            img = Image.open(path)
            rgb, weights = _descriptor(img)
        except Exception as exc:      # 缺图/坏图不拖垮整批
            print("skip %s: %s" % (name, exc), file=sys.stderr)
            continue
        items.append((name, rgb, weights))
    return items


def _variants(img):
    w, h = img.size
    out = [img]
    for k in (0.9, 0.8):
        cw, ch = max(1, int(w * k)), max(1, int(h * k))
        out.append(img.crop(((w - cw) // 2, (h - ch) // 2,
                             (w - cw) // 2 + cw, (h - ch) // 2 + ch)))
    return out


def match_one(tpls, img, threshold, topn=3):
    crop = img.convert("RGB")
    variants = _variants(crop)
    scored = []
    for name, trgb, tweights in tpls:
        best = 1.0
        for v in variants:
            qrgb = v.resize((GRID, GRID), Image.LANCZOS).tobytes()
            d = _distance(qrgb, trgb, tweights)
            if d < best:
                best = d
        scored.append((best, name))
    scored.sort()
    top = [{"name": n, "dist": round(d, 4)} for d, n in scored[:topn]]

    q0 = crop.resize((GRID, GRID), Image.LANCZOS).tobytes()
    if _flat_std(q0) < FLAT_STD or scored[0][0] > threshold:
        return [{"name": None, "dist": round(scored[0][0], 4)}]
    return top


def parse_rect(text, w, h):
    parts = text.split(",")
    if len(parts) != 4:
        raise ValueError("矩形要写成 x,y,w,h：%r" % text)
    x, y, rw, rh = (int(round(float(p))) for p in parts)
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(w, x + rw), min(h, y + rh)
    return x0, y0, max(0, x1 - x0), max(0, y1 - y0)


def main(argv):
    args = list(argv[1:])
    threshold = float(os.environ.get("PORTRAIT_THRESHOLD", DEFAULT_THRESHOLD))
    if "--threshold" in args:
        i = args.index("--threshold")
        threshold = float(args[i + 1])
        del args[i:i + 2]
    if len(args) < 3:
        print(__doc__, file=sys.stderr)
        return 2

    out_path, shot_path, rects = args[0], args[1], args[2:]
    shot = Image.open(shot_path)
    tpls = load_templates()
    if not tpls:
        print("模板库为空：%s" % DATA, file=sys.stderr)
        return 1

    result = {}
    for r in rects:
        box = parse_rect(r, shot.width, shot.height)
        if box[2] == 0 or box[3] == 0:
            result[r] = [{"name": None, "dist": 1.0}]
            continue
        result[r] = match_one(tpls, shot.crop((box[0], box[1],
                                               box[0] + box[2], box[1] + box[3])),
                              threshold)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=1)
    print("ok", len(result))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
