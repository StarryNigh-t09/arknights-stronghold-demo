#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Arknights "Stronghold Protocol" (卫戍协议) in-game OCR sidecar.

Usage:
    python ocr.py <png> --json
    python ocr.py <png> --json --out result.json

Prints a single JSON object:
    {"ok": true, "screen": "rest|battle|prep|unknown", "round": 1, "money": 2,
     "hp": 26, "countdown": null, "shop": [...], "centerLevel": 1,
     "upgradeCost": 5, "slotsLeft": 8, "raw": {...}}

Any field that cannot be read is null (never guessed).

The OCR engine is PaddleOCR (PP-OCR) models shipped inside a MAA install,
driven through MaaFramework's Python binding (pip install maafw).  The models
are staged into a flat cache directory once, because MaaFramework only accepts
det.onnx / rec.onnx / keys.txt in a directory named after the model.
"""

import argparse
import json
import os
import re
import time
import shutil
import sys
import tempfile

BASE_W, BASE_H = 1920, 1080

# ---------------------------------------------------------------- model setup


def _candidate_maa_roots():
    env = os.environ.get("MAA_ROOT")
    if env:
        yield env
    yield r"C:\Maa"
    for drive in ("C:", "D:", "E:"):
        yield os.path.join(drive, "Maa")


def _stage_models():
    """Return a directory that MaaFramework can load OCR models from.

    Layout required: <dir>/<ModelName>/{det.onnx,rec.onnx,keys.txt}
    """
    explicit = os.environ.get("COOP_OCR_MODEL_DIR")
    if explicit and os.path.isdir(explicit):
        return explicit

    cache_root = os.environ.get("LOCALAPPDATA") or tempfile.gettempdir()
    cache = os.path.join(cache_root, "coopanion-ocr", "models")

    wanted = ("PaddleOCR", "PaddleCharOCR")
    # 2026-11-13 15:3x：缓存一旦生成就永远被复用，而 C:\Maa 里的模型换过版本（PaddleOCR rec
    # 21.2MB vs 缓存里 10.7MB）→ 一直加载旧的、Maa 报 "Failed to load rec [name=PaddleCharOCR]"。
    # 现在复用前先核对 rec.onnx 大小与源一致，不一致就重新拷贝。
    def _src_rec_size(model):
        for root in _candidate_maa_roots():
            p = os.path.join(root, "resource", model, "rec", "inference.onnx")
            if os.path.exists(p):
                return os.path.getsize(p)
        return None

    if all(
        os.path.exists(os.path.join(cache, m, f))
        for m in wanted
        for f in ("det.onnx", "rec.onnx", "keys.txt")
    ):
        fresh = True
        for m in wanted:
            want = _src_rec_size(m)
            got = os.path.getsize(os.path.join(cache, m, "rec.onnx"))
            if want is not None and want != got:
                fresh = False
                break
        if fresh:
            return cache

    found_any = False
    for root in _candidate_maa_roots():
        res_dir = os.path.join(root, "resource")
        if not os.path.isdir(res_dir):
            continue
        for model in wanted:
            src = os.path.join(res_dir, model)
            if not os.path.isdir(src):
                continue
            dst = os.path.join(cache, model)
            os.makedirs(dst, exist_ok=True)
            ok = True
            for kind in ("det", "rec"):
                cand = [
                    os.path.join(src, kind, "inference.onnx"),
                    os.path.join(src, kind + ".onnx"),
                ]
                hit = next((c for c in cand if os.path.exists(c)), None)
                if hit is None and kind == "det":
                    # 2026-11-13 15:3x：C:\Maa 里的 PaddleCharOCR 是**只有 rec** 的模型
                    # （det/ 是空目录），旧逻辑会因此判失败、把整个目录删掉 → Maa 报
                    # "Failed to load rec [name=PaddleCharOCR]"，等级/名额/钱全靠它认数字。
                    # 借 PaddleOCR 的 det 占位（只用 only_rec 时不参与识别）。
                    other = "PaddleOCR" if model != "PaddleOCR" else "PaddleCharOCR"
                    alt = os.path.join(res_dir, other, "det", "inference.onnx")
                    if os.path.exists(alt):
                        hit = alt
                if hit is None:
                    ok = False
                    break
                shutil.copyfile(hit, os.path.join(dst, kind + ".onnx"))
            keys = os.path.join(src, "rec", "keys.txt")
            if not os.path.exists(keys):
                keys = os.path.join(src, "keys.txt")
            if not os.path.exists(keys):
                ok = False
            else:
                shutil.copyfile(keys, os.path.join(dst, "keys.txt"))
            if ok:
                found_any = True
            else:
                shutil.rmtree(dst, ignore_errors=True)
        if found_any:
            return cache
    raise RuntimeError(
        "OCR models not found: no PaddleOCR/PaddleCharOCR under any MAA resource dir"
    )


class Engine:
    """Thin wrapper over MaaFramework's OCR recognition."""

    def __init__(self):
        from maa.resource import Resource
        from maa.tasker import Tasker
        from maa.library import Library

        self._np = __import__("numpy")
        from PIL import Image  # noqa: F401  (checked early for a clear error)

        models = _stage_models()
        self._res = Resource()
        self._res.post_ocr_model(models).wait()
        self._tasker = Tasker()
        Library.framework().MaaTaskerBindResource(
            self._tasker._handle, self._res._handle
        )
        self._jocr = None

    # -- low level ---------------------------------------------------------
    def run(self, img, rect, model="PaddleOCR", scale=3, only_rec=False):
        from maa.pipeline import JOCR, JRecognitionType

        x0, y0, x1, y1 = [int(round(v)) for v in rect]
        x0 = max(0, x0); y0 = max(0, y0)
        x1 = min(img.width, x1); y1 = min(img.height, y1)
        if x1 - x0 < 4 or y1 - y0 < 4:
            return []
        crop = img.crop((x0, y0, x1, y1))
        if scale != 1:
            from PIL import Image

            crop = crop.resize(
                (crop.width * scale, crop.height * scale), Image.LANCZOS
            )
        arr = self._np.asarray(crop.convert("RGB"))[:, :, ::-1].copy()
        job = self._tasker.post_recognition(
            JRecognitionType.OCR,
            JOCR(roi=(0, 0, 0, 0), expected=[], only_rec=only_rec, model=model),
            arr,
        )
        detail = job.wait().get()
        out = []
        for node in detail.nodes:
            rec = node.recognition
            if rec is None:
                continue
            for r in rec.all_results:
                box = list(r.box)
                out.append(
                    {
                        "text": (r.text or "").strip(),
                        "score": round(float(r.score), 3),
                        # scale back to full-image coordinates
                        "box": [
                            x0 + box[0] / scale,
                            y0 + box[1] / scale,
                            box[2] / scale,
                            box[3] / scale,
                        ],
                    }
                )
        return out

    def texts(self, img, rect, **kw):
        return [r["text"] for r in self.run(img, rect, **kw) if r["text"]]


# --------------------------------------------------------------- field readers

_DIGITS = re.compile(r"\d+")


def _first_int(items):
    for t in items:
        m = _DIGITS.search(t.replace("O", "0").replace("o", "0"))
        if m:
            try:
                return int(m.group())
            except ValueError:
                pass
    return None


def _last_int(items):
    for t in items:
        nums = _DIGITS.findall(t.replace("O", "0"))
        if nums:
            try:
                return int(nums[-1])
            except ValueError:
                pass
    return None


def read_center_level(eng, img):
    vals = eng.texts(img, (188, 18, 372, 62), scale=3)
    for t in vals:
        m = re.search(r"等级\W{0,2}(\d{1,2})", t)
        if m:
            return int(m.group(1))
    n = _last_int(vals)
    if n is not None:
        return n
    # last-resort: the single trailing digit, read by the char model
    for t in eng.texts(img, (326, 20, 372, 62), model="PaddleCharOCR", scale=8,
                       only_rec=True):
        n = _first_int([t])
        if n is not None:
            return n
    return None


def read_white_digits(eng, img, box, thresh=175, scale=8, neutral=False):
    """白色粗体数字（目标生命、升级费这类）：先按亮度找字形外框，再紧裁剪放大给字符模型。

    PP-OCR 的检测在这种「暗底白字、周围还有图标」的小区域上会把 21 读成 27、
    把 7 读成 1，所以这里绕开检测，只借 PaddleCharOCR 的识别。
    """
    np = eng._np
    x0, y0, x1, y1 = box
    arr = np.asarray(img.convert("L").crop(box)).astype(int)
    bright = arr > thresh
    if neutral:
        # 只要「白/灰」的像素，别把金色徽章边框一起算进去
        rgb = np.asarray(img.convert("RGB").crop(box)).astype(int)
        bright = bright & ((rgb.max(axis=2) - rgb.min(axis=2)) < 45)
    ys, xs = np.where(bright)
    if len(xs) < 15:
        return None
    rect = (
        x0 + int(xs.min()) - 3,
        y0 + int(ys.min()) - 3,
        x0 + int(xs.max()) + 4,
        y0 + int(ys.max()) + 4,
    )
    return _first_int(eng.texts(img, rect, model="PaddleCharOCR", scale=scale))


def read_hp(eng, img):
    # 城堡图标是青色，右边的数字偏灰白（实测最亮 168），阈值要压到 120 才抓得住
    n = read_white_digits(eng, img, (1185, 24, 1250, 80), thresh=120)
    if n is not None and 0 <= n <= 99:
        return n
    vals = eng.texts(img, (1150, 24, 1240, 72), scale=3)
    n = _first_int(vals)
    if n is not None and 0 <= n <= 99:
        return n
    return None


def read_round(eng, img):
    """Round number sits in a small light rounded box.  The glyph is a thin
    dark stroke, which PP-OCR-det fails on; PaddleCharOCR on a tight crop works."""
    from PIL import Image  # noqa: F401

    np = eng._np
    arr = np.asarray(img.convert("L").crop((716, 30, 778, 70))).astype(int)
    dark = arr < 110
    # ignore the first/last 3px which hold the box edge
    dark[:3, :] = False; dark[-3:, :] = False
    dark[:, :3] = False; dark[:, -3:] = False
    ys, xs = np.where(dark)
    if len(xs) < 20:
        return None
    bx0, bx1 = int(xs.min()), int(xs.max())
    by0, by1 = int(ys.min()), int(ys.max())
    rect = (716 + bx0 - 3, 30 + by0 - 3, 716 + bx1 + 4, 30 + by1 + 4)
    vals = eng.texts(img, rect, model="PaddleCharOCR", scale=8)
    return _first_int(vals)


def _norm_digits(t):
    """把 OCR 常见误读拉回数字：金币字体里「1」常被认成 | / l / I，0 被认成 O / Q。

    2026-11-11 实测：折叠态钱 14 读成 \u007c4 -> 4；展开态钱 1 读成 \u007c（没有数字）-> None。
    """
    t = t or ''
    for a, b in (("|", "1"), ("l", "1"), ("I", "1"), ("!", "1"), ("O", "0"), ("o", "0"), ("Q", "0")):
        t = t.replace(a, b)
    return t


def read_money(eng, img, screen):
    """金币数。休整期那枚金币徽章在商店面板右上角，位置跟等级无关（四张基准图实测都在
    (1786,780)-(1820,808)），但面板展开/折叠、卡面立绘会带来别的白色数字，所以整条右侧
    竖带都扫一遍，只收「纯 1~2 位数字」的候选，取最靠下的那个（徽章永远在按钮下面）。
    """
    if screen in ("battle", "prep"):
        vals = eng.texts(img, (1745, 885, 1918, 970), scale=3)
        n = _first_int(vals)
        return n
    # 提速：徽章位置实测固定（四张基准图 + 真机都在 (1786,780)-(1820,808)），先扫窄框；
    # 扫不到（面板刚切换/徽章被挡）再退回整条竖带。窄框 0.3s，整条 1.4s。
    narrow = []
    try:
        for r in eng.run(img, (1740, 762, 1872, 826), scale=3):
            t = _norm_digits(r.get("text"))
            if re.fullmatch(r"\d{1,2}", (t or "").strip()):
                box = r.get("box") or [0, 0, 0, 0]
                narrow.append((box[1], int(t.strip())))
    except Exception:
        narrow = []
    if narrow:
        narrow.sort()
        return narrow[-1][1]
    cands = []
    for kw in ({"scale": 3}, {"model": "PaddleCharOCR", "scale": 5}):
        try:
            for r in eng.run(img, (1700, 690, 1920, 960), **kw):
                t = _norm_digits(r.get("text"))
                if re.fullmatch(r"\d{1,2}", (t or "").strip()):
                    box = r.get("box") or [0, 0, 0, 0]
                    cands.append((box[1], int(t.strip())))
        except Exception:
            continue
    if not cands:
        return None
    cands.sort()
    return cands[-1][1]


# 2026-11-12 真机实测补 '_'：界面 Ⅰ 的那根竖线会被 PP-OCR 读成下划线（'_'、'_._'）
_ROMAN_MAP = str.maketrans({"_": "I", "|": "I", "l": "I", "1": "I"})
# 罗马数字读数里允许出现的字符；别的一律当噪声否掉（'__w__' 这种会被硬滤成 4）
_ROMAN_CHARS = set("IVXivx|1_l")


def _roman_to_int(text):
    """把 OCR 读到的罗马数字归一成 1..6，认不出返回 None。

    PP-OCR 实测：Ⅳ→'|V'、Ⅴ→'V'、Ⅲ→三根竖线；char 模型给 'Fiv'、'EV' 这种脏串。
    只留 I/V/X 再按标准减法规则解析，噪声字母（F、E）自然被丢掉。
    """
    # 点、间隔号、逗号是压在竖线上的噪声：先扔掉
    s = str(text or "").replace(".", "").replace("·", "").replace(",", "")
    s = s.replace("LEVEL", "").replace("level", "").replace(" ", "").replace("\t", "")
    if not s:
        return None
    # 严格字符集：带 W/T/F/L 这类字母的是别的字（真机帧里的 '__w__'、char 模型的 'Fiv'），
    # 硬滤成 IVX 会把 '__w__' 读成 4 —— 宁可不认。
    if any(ch not in _ROMAN_CHARS for ch in s):
        return None
    # 连续的下划线是同一根竖线被切碎（'_'、'__'、'_._'），折成一根 I；
    # '|' 不折（'|||' 确实是三根，对应 Ⅲ）
    s = re.sub(r"_+", "I", s)
    # 先 translate 再 upper：'lV'（小写 L 其实是竖线）要先变成 '|V'，一 upper 就成 'LV' 认错了
    s = s.translate(_ROMAN_MAP).upper()
    # 「LEVEL」被切掉一半时只剩 'EVEL'：E/V/E/L 里滤出一个 V 会读成 5，这类残字直接否掉
    if "EVEL" in s or "LEV" in s:
        return None
    s = "".join(ch for ch in s if ch in "IVX")
    if not s:
        return None
    vals = {"I": 1, "V": 5, "X": 10}
    total = 0
    for i, ch in enumerate(s):
        v = vals[ch]
        nxt = vals[s[i + 1]] if i + 1 < len(s) else 0
        total += -v if v < nxt else v
    return total if 1 <= total <= 6 else None


def _find_level_word(eng, img):
    """找「LEVEL」那块字的位置（展开态在左、折叠态在右）。

    2026-11-12（用户 m01703 批准）：以前只扫 (0, 690, BASE_W, 945) 这条 1920×255 的宽扁带，
    PP-OCR 的 det 在这种长宽比上只回垃圾框（真机实测 `万-日`、`I-HN`），永远拿不到 LEVEL，
    于是每帧都掉到位置反猜兜底、读数 ±1。改成三条 rect 依次试：全屏 + 左窄框 + 右窄框，
    谁先命中就用谁。注意 eng.run 的 rect 语义是 (x0, y0, x1, y1)，不是宽高。
    """
    for rect in ((0, 730, 420, 920), (200, 730, 760, 920), (1500, 730, 1920, 920), (0, 0, BASE_W, BASE_H)):
        best = None
        for scale in (3, 2, 4):
            try:
                rows = eng.run(img, rect, scale=scale)
            except Exception:
                continue
            for r in rows:
                t = (r.get("text") or "").upper().replace(" ", "")
                if "LEVEL" not in t:
                    continue
                box = r.get("box") or (0, 0, 0, 0)
                if best is None or box[1] > best[1]:
                    best = tuple(int(v) for v in box)
            if best:
                return best
    return None


def _read_numeral(eng, img, bx, by, bw, bh):
    """在「LEVEL」下面那根数字条上读罗马数字。

    2026-11-12 真机矩阵实测（七帧）定下的取材规则：
    - 数字框又高又窄（bh≈22~60）。压在数字上的那条 6~8px 扁框是关卡里的横条贴图，
      不是数字，必须跳过（不跳的话 Ⅰ 会被读成 1 但 Ⅱ 会先命中扁框读成 1）。
    - 同一处常出多个候选（`|I`、`||`、`|||`）。取**最窄**的那个：单根数字的框最窄，
      带箭头（折叠态左侧那个 ⇅）的框会被箭头撑宽，实测 `_|`（箭头+竖线）读成 2，
      而窄框 `_` 读成 1，取窄就对了。
    - 全都不成再对数字条整体做 char 识别（Ⅰ 那帧只有 char 模型稳定给 '1'）。
    """
    area = (max(0, bx - 40), max(0, by + bh - 8), min(BASE_W, bx + bw + 120), min(BASE_H, by + bh + 80))
    thin = None  # (宽度, 值)
    for scale in (6, 4, 3):
        try:
            rows = eng.run(img, area, scale=scale)
        except Exception:
            continue
        for r in rows:
            b = r.get("box") or (0, 0, 0, 0)
            if (b[3] or 0) < 20 or (b[2] or 0) < 5:
                continue
            lv = _roman_to_int(r.get("text") or "")
            if not lv:
                continue
            if thin is None or b[2] < thin[0]:
                thin = (b[2], lv)
        if thin:
            return thin[1]
    # char 兜底的框要从「LEVEL」字框下沿才开始，否则会把 'EVEL' 的尾巴读成 'L'
    rect = (max(0, bx - 6), min(BASE_H, by + bh + 2), min(BASE_W, bx + bw + 80), min(BASE_H, by + bh + 100))
    for scale in (6, 4, 8):
        try:
            vals = eng.texts(img, rect, model="PaddleCharOCR", scale=scale, only_rec=True)
        except Exception:
            continue
        for v in vals:
            lv = _roman_to_int(v)
            if lv:
                return lv
    return None


def read_shop_level(eng, img):
    """商店等级：界面上「LEVEL」下面那个罗马数字，返回 1..6（界面口径）。

    2026-11-12 改：以前只靠「哪个 panel_geometry 矩形里有 LEVEL 字样」反猜，那条路
    实测永远返回界面等级 − 1（panel_geometry(L) 画的是界面 L+1 的布局），商店折叠时
    更是直接 None —— 于是日志里的等级名一直比界面小 1、跟攻略的 targetLevel 差一级。
    现在只认数字，认不出就返回 None（不再拿位置反猜：真机 Ⅰ 那帧就是这么被猜成 2 的，
    drive.js 的 :265/:1010/:1508/:1555 都判了 null，少一个读数比给错一个数强）。
    """
    box = _find_level_word(eng, img)
    if not box:
        return None
    bx, by, bw, bh = box
    return _read_numeral(eng, img, bx, by, bw, bh)


def _idx(display_level):
    """界面等级 → panel_geometry 的下标（实测 panel_geometry(L) 画的是界面 L+1 的布局）。"""
    try:
        return max(1, int(display_level) - 1)
    except (TypeError, ValueError):
        return 2


def panel_geometry(idx):
    """升级面板（商店最左边那条窄竖条）的几何。

    参数 idx 是**下标**不是界面等级：idx = 界面 LEVEL − 1（转换见 _idx）。
    整排商店是右对齐的：最右一张卡的中心恒在 SHOP_RIGHT_CENTER，格子数 = 3 + idx，
    所以 idx 越大最左卡越往左挪，紧贴在它左边的升级面板也跟着挪 —— 每升一级、每回合刷新
    之后都必须重新算，不能写死（2026-11-09 实测踩过：写死 (568,854) 一次都没点中）。

    返回 (最左卡左边缘, 面板左边缘, 面板右边缘, 面板中心 x)。
    实测校验：idx=2（界面 Ⅲ，5 格）→ first=447、panel=252..425、中心 337，
    与截图量出来的「升级」二字中心（336）一致。
    """
    try:
        lv = max(1, int(idx))
    except (TypeError, ValueError):
        lv = 2
    n = 3 + lv
    first = SHOP_RIGHT_CENTER - SHOP_CARD_W // 2 - (n - 1) * SHOP_PITCH
    panel_left = first - 195     # 面板宽约 173px
    panel_right = first - 22
    return first, panel_left, panel_right, (panel_left + panel_right) // 2


def read_upgrade_cost(eng, img, level=None):
    """升级费：升级面板顶上那颗金色菱形徽章里的数字。

    徽章位置跟着面板走（面板跟着商店格数走），所以要先按 level 算出面板在哪。
    先找「亮且不饱和」的白字块（正常态：白字压在深底上），找不到再退回 PP-OCR 检测
    （面板处于「确认升级」高亮态时字是深色的，白字块这条路会空）。
    """
    if level is None:
        badge = (150, 755, 700, 835)
        fallback = (300, 760, 640, 835)
    else:
        _, pl, pr, cx = panel_geometry(_idx(level))
        badge = (max(0, pl), 755, max(0, pr), 838)
        fallback = (max(0, cx - 90), 760, max(0, cx + 90), 838)
    n = read_white_digits(eng, img, badge, thresh=135, neutral=True)
    if n is not None and 0 < n <= 20:
        return n
    n = _first_int(eng.texts(img, fallback, scale=4))
    if n is not None and 0 < n <= 20:
        return n
    n = _first_int(eng.texts(img, fallback, model="PaddleCharOCR", scale=6))
    if n is not None and 0 < n <= 20:
        return n
    return None


def find_text_point(eng, img, text, rect=None, model="PaddleOCR", scale=3):
    """在 rect 里找含 text 的文本块，返回其中心（整图坐标）{x, y, score, text}；找不到返回 None。

    Engine.run 的 box 语义是 [left, top, width, height]，且已经换算回整图坐标
    （见 ocr.py Engine.run 里的注释），所以中心 = (left + w/2, top + h/2)。

    2026-11-12 09:3x 加：升级按钮不能再按「商店格数右对齐」算坐标 —— 等级 ≥4 时算出来
    会跑到屏幕外（Lv4 = -228），必须直接在截图上认「升级」两个字。
    """
    if rect is None:
        rect = (0, 0, BASE_W, BASE_H)
    try:
        res = eng.run(img, rect, model=model, scale=scale)
    except Exception:
        return None
    want = (text or "").replace(" ", "")
    best = None
    for r in res or []:
        t = (r.get("text") or "").replace(" ", "")
        if not want or want not in t:
            continue
        box = r.get("box") or []
        if len(box) != 4:
            continue
        try:
            l, tp, w, h = [float(v) for v in box]
        except (TypeError, ValueError):
            continue
        if w < 4 or h < 4:
            continue
        cand = {
            "x": int(round(l + w / 2.0)),
            "y": int(round(tp + h / 2.0)),
            "score": r.get("score"),
            "text": t,
        }
        if best is None or (cand["score"] or 0) > (best["score"] or 0):
            best = cand
    return best


# 「升级」两字在面板底部：实测中心 y≈992（旧代码写死 972，偏上 20px），扫整条底边足够。
UPGRADE_TEXT_RECT = (0, 900, 1920, 1080)


def read_upgrade_point(eng, img, rect=UPGRADE_TEXT_RECT, expanded=None):
    """升级按钮的真实中心：OCR 认「升级」两个字。

    先扫底边整条；认不到再按 panel_geometry(1..6) 给出的面板横向范围逐块细认（面板可能
    被高亮或半透明压住，整条扫容易漏）。返回 {x, y, text, score, level}；都没有返回 None。

    expanded：商店是否展开。analyze 里这个值在调本函数之前就已经算好了（右下角那个
    「展开 / 收起」按钮的文字），直接传进来就别再花一次扫描；明确 False 时直接返回 None ——
    折叠态的底边是背包/地图，认出来的「升级」必然是误读，点位全错（用户 m00601 要求加的闸门）。
    传 None 表示调用方不知道，行为跟以前一样。
    """
    if expanded is False:
        return None
    hit = find_text_point(eng, img, "升级", rect)
    if hit:
        return hit
    for lv in range(1, 7):
        try:
            _, pl, pr, _cx = panel_geometry(lv)
        except Exception:
            continue
        if pr <= 46:
            continue
        band = (max(0, pl - 6), 900, min(BASE_W, pr + 6), 1080)
        hit = find_text_point(eng, img, "升级", band, scale=4)
        if hit:
            hit["level"] = lv
            return hit
    return None


def read_slots_left(eng, img, rect=(1520, 450, 1918, 830)):
    """「剩余可放置角色：N」的 N；读不准就返回 None（调用方当建议值，不当硬闸门）。

    这行字的 y 会随商店展开/折叠上下跑（展开态约 566、折叠态约 697），所以扫一整条
    右边缘再按「剩余」两个字定位，不能用固定 ROI（2026-11-10 踩到，读成 None 直接
    让上场的成败判断全废）。

    2026-11-12 09:0x 修（真机实证）：以前标签行被 OCR 断句时，兜底会把**别的文本**的
    数字当成名额 —— traces/decision-2026-11-12T00-13-36-763Z/step-021.png 读成 10
    （真值 1，10 是金币徽章），比读成 None 更坏：布阵会以为还有 10 个位置。
    现在只认「说过剩余/放置」的那一块，以及它右侧同一横带里的数字；都没有就返回 None。
    """
    fix = str.maketrans({"O": "0", "o": "0", "D": "0", "Q": "0", "I": "1", "l": "1",
                         "|": "1", "!": "1", "Z": "2", "S": "5", "B": "8"})

    def num(t):
        m = re.findall(r"\d+", (t or "").translate(fix))
        return int(m[-1]) if m else None

    try:
        res = eng.run(img, rect, scale=3)
    except Exception:
        return None
    label = None
    for r in res:
        t = r.get("text") or ""
        if "剩余" in t or "放置" in t:
            n = num(t)
            if n is not None:
                return n
            label = r
            break
    if label is None:
        return None
    bx = label.get("box") or [0, 0, 0, 0]
    lx, ly, lw, lh = float(bx[0]), float(bx[1]), float(bx[2] or 0), float(bx[3] or 0)
    ry0 = max(rect[1], ly - max(6.0, lh * 0.6))
    ry1 = min(rect[3], ly + max(14.0, lh * 1.6))
    # 1) 同一个横带里被切成独立文本块的数字（标签行断句时最常见）
    for r in res:
        if r is label:
            continue
        b = r.get("box") or [0, 0, 0, 0]
        top, left = float(b[1]), float(b[0])
        bot = top + float(b[3] or 0)
        right = left + float(b[2] or 0)
        if bot < ry0 or top > ry1:
            continue
        if right < lx - 6:
            continue
        n = num(r.get("text"))
        if n is not None and 0 <= n <= 20:
            return n
    # 2) 连冒号一起裁的宽条，低倍数优先。
    #    2026-11-12 实测（test/fixtures/slots-1-split.png）：真值是「剩余可放置角色：1」，
    #    只裁数字那半截（lx+lw-8 起）、放大到 6 倍会被默认模型读成「4」—— 而且老代码第一次
    #    尝试就 return，轮到 char 模型也没用。宽条 (lx-30 .. lx+lw+120) 在 scale 4 读成
    #    「：1」，char 模型 scale 10 读成「1」。
    wy0, wy1 = int(ry0), int(ry1)
    wx0 = int(max(rect[0], lx - 30))
    wx1 = int(min(rect[2], lx + max(4.0, lw) + 120))
    if wx1 - wx0 >= 12 and wy1 - wy0 >= 8:
        seen = []
        for kw in ({"scale": 4}, {"scale": 3},
                   {"model": "PaddleCharOCR", "scale": 4},
                   {"model": "PaddleCharOCR", "scale": 6},
                   {"model": "PaddleCharOCR", "scale": 10}):
            try:
                for r in eng.run(img, (wx0, wy0, wx1, wy1), **kw):
                    t = r.get("text") or ""
                    n = num(t)
                    if n is None or not 0 <= n <= 20:
                        continue
                    # 带冒号的读法才算「标签行上的数字」，优先采用
                    seen.append((bool(re.search(r"[：:]", t)), n))
            except Exception:
                continue
            colon = [n for has_colon, n in seen if has_colon]
            if colon:
                return colon[-1]
        if seen:
            return seen[-1][1]
        # 3) 老路兜底：只裁数字那半截。默认模型在这个尺寸上会把「：1」读成「4」，
        #    所以这里只信 char 模型、且放到 8~10 倍。
        x0 = int(max(rect[0], lx + max(4.0, lw) - 8))
        x1 = int(min(rect[2], lx + max(4.0, lw) + 260))
        if x1 - x0 >= 12 and wy1 - wy0 >= 8:
            for kw in ({"model": "PaddleCharOCR", "scale": 10},
                       {"model": "PaddleCharOCR", "scale": 8}):
                try:
                    for r in eng.run(img, (x0, wy0, x1, wy1), **kw):
                        n = num(r.get("text"))
                        if n is not None and 0 <= n <= 20:
                            return n
                except Exception:
                    continue
    return None


# -- countdown: 7-segment display -------------------------------------------

SEG_ORDER = ("a", "b", "c", "d", "e", "f", "g")
SEG_TABLE = {
    "0": "abcdef",
    "1": "bc",
    "2": "abged",
    "3": "abgcd",
    "4": "fgbc",
    "5": "afgcd",
    "6": "afgecd",
    "7": "abc",
    "8": "abcdefg",
    "9": "abcdfg",
}
_BITSETS = [("".join("1" if s in v else "0" for s in SEG_ORDER), d)
            for d, v in SEG_TABLE.items()]


def _decode_segments(zone):
    bits = "".join("1" if zone.get(s, 0) > 0.30 else "0" for s in SEG_ORDER)
    best, bestd = None, 99
    for pat, digit in _BITSETS:
        d = sum(1 for i in range(7) if bits[i] != pat[i])
        if d < bestd:
            best, bestd = digit, d
    return best if bestd <= 1 else None


def read_countdown(eng, img):
    np = eng._np
    arr = np.asarray(img.crop((1650, 20, 1795, 140)).convert("RGB")).astype(int)
    g = arr[:, :, 1]
    mask = (g > 150) & (g - arr[:, :, 0] > 30)
    if int(mask.sum()) < 200:
        return None
    rows = mask.sum(axis=1)
    nz = [i for i, v in enumerate(rows) if v > 0]
    if not nz:
        return None
    ty, by = nz[0], nz[-1]
    if by - ty < 40:  # too flat to be a digit
        return None
    band = mask[ty:by + 1, :]
    cols = band.sum(axis=0)
    groups = []
    cur = None
    for i, v in enumerate(cols):
        if v > 0:
            cur = [i, i] if cur is None else [cur[0], i]
        elif cur is not None:
            groups.append(tuple(cur))
            cur = None
    if cur is not None:
        groups.append(tuple(cur))
    # merge groups separated by a hairline gap, drop slivers
    merged = []
    for gp in groups:
        if merged and gp[0] - merged[-1][1] <= 3:
            merged[-1] = (merged[-1][0], gp[1])
        else:
            merged.append(gp)
    digits = []
    for (gx0, gx1) in merged:
        if gx1 - gx0 < 4:
            continue
        cell = band[:, gx0:gx1 + 1]
        h, w = cell.shape
        if w < 0.35 * h:
            digits.append("1")
            continue

        def occ(y0, y1, x0, x1):
            return float(cell[int(y0 * h):max(int(y1 * h), int(y0 * h) + 1),
                              int(x0 * w):max(int(x1 * w), int(x0 * w) + 1)].mean())

        zone = {
            "a": occ(0.00, 0.22, 0.20, 0.80),
            "g": occ(0.40, 0.60, 0.20, 0.80),
            "d": occ(0.78, 1.00, 0.20, 0.80),
            "f": occ(0.12, 0.44, 0.00, 0.32),
            "b": occ(0.12, 0.44, 0.68, 1.00),
            "e": occ(0.56, 0.88, 0.00, 0.32),
            "c": occ(0.56, 0.88, 0.68, 1.00),
        }
        d = _decode_segments(zone)
        if d is None:
            return None
        digits.append(d)
    if not digits:
        return None
    try:
        return int("".join(digits))
    except ValueError:
        return None


# -- shop -------------------------------------------------------------------

SHOP_SLOT_X0 = (676, 919, 1162, 1405)
UI_WORDS = {"确认购买", "收起", "冻结", "刷新", "升级", "准备就绪", "开始作战"}
SHOP_CARD_W = 240


# 2026-11-09 真机重测（1920x1080，Lv2 五格）：整排是右对齐的，最右一张卡的中心恒在 x=1527，
# 卡片宽 240、间距 240（几乎紧贴，缝只有几 px）。旧常数是 231/243/最右左边缘 1408，
# 升级之后整排就错位了，买卡直接点空。
SHOP_RIGHT_CENTER = 1527
SHOP_PITCH = 240


def _card_starts_by_pixels(eng, img):
    """用像素数商店格子，返回每张卡的左边缘；数不出来返回 None。

    为什么不靠 OCR 数：最左那张特殊卡（问号剪影、没有阵营 tag）的名字时有时无，OCR 漏它
    一次整排坐标就右移一格、最左那格彻底买不到（2026-11-12 实测 wz_battle2 读成 3 张，
    真值 4 张；同一段聚类循环我自己跑得 4 簇、函数自己跑出 3 簇）。

    判据：卡片底部那条青绿卡名条（y 1000..1062）G 明显大于 R；对每一列取「条带内任意一行
    是青绿」，得到列布尔序列，宽度 200..250 的连续段就是一张卡。卡片左上角「升级」按钮那块
    也会命中，但它只有约 168 宽，按宽度滤掉。
    """
    try:
        np = eng._np
        arr = np.asarray(img.convert("RGB"))
    except Exception:
        return None
    if arr.shape[0] < 1062 or arr.shape[1] < 1700:
        return None
    band = arr[1000:1062].astype(int)
    teal = (band[:, :, 1] > 55) & ((band[:, :, 1] - band[:, :, 0]) > 25)
    col = teal.any(axis=0)
    starts = []
    s = None
    for x, v in enumerate(col):
        if v and s is None:
            s = x
        elif not v and s is not None:
            if 200 <= x - s <= 250:
                starts.append(s)
            s = None
    if s is not None and 200 <= len(col) - s <= 250:
        starts.append(s)
    if not 3 <= len(starts) <= 6:
        return None
    # 最右那格可能是空位（只有「NO INFO」，没有青绿卡名条），而整排是右对齐的：
    # 往右补到最右固定格，否则空位被吞掉、格子数少一格（2026-11-12 wz_rest_r1 就是这样）。
    pitch = (starts[1] - starts[0]) if len(starts) >= 2 else 243
    while len(starts) < 6 and SHOP_SLOT_X0[-1] - starts[-1] >= pitch * 0.6:
        starts.append(int(starts[-1] + pitch))
    return starts


def detect_shop_slots(eng, img, center_level=None):
    """数一数这回合商店有几格，再按「右对齐、间距 240」反推每格左边缘。

    格子数 = 3 + center_level（下标 = 界面等级 − 1；界面 Ⅲ 五格、Ⅳ 六格 …），整排往左长。
    等级由调用方自己数（进局 1，每成功升一次 +1），不靠 OCR 猜 —— 认 LEVEL 面板那个
    罗马数字太不靠谱（截图里 "II" 就是两根竖线），而它一错，整排坐标就全错。
    """
    try:
        n = int(center_level)
    except (TypeError, ValueError):
        n = None
    # 2026-11-12 修：以前 int(None) 失败后 n=0，`2 <= n+3 <= 6` 仍成立，于是「没给等级」
    # 被当成 3 格直接返回 —— 进局至少 4 格（3+1），这条老路把最左那张卡永久切掉。
    if n is not None and 2 <= n + 3 <= 6:
        n = n + 3
        return [SHOP_RIGHT_CENTER - SHOP_CARD_W // 2 - (n - 1 - i) * SHOP_PITCH for i in range(n)]
    # 先按像素数格子（快、稳，不看名字）；数不出来才退回 OCR 聚类。
    starts = _card_starts_by_pixels(eng, img)
    if starts:
        return starts
    rows = eng.run(img, (180, 940, 1740, 1050), scale=3)
    xs = []
    for r in rows:
        t = (r["text"] or "").strip()
        if not t or t in UI_WORDS or "升级" in t:
            continue
        if re.fullmatch(r"[A-Za-z0-9\W_]+", t):
            continue
        cx = r["box"][0] + r["box"][2] / 2
        if xs and cx - xs[-1][1] < 90:
            xs[-1] = [min(xs[-1][0], cx), max(xs[-1][1], cx)]
        else:
            xs.append([cx, cx])
    n = len(xs)
    if n < 1 or n > 6:
        return list(SHOP_SLOT_X0)
    return [SHOP_RIGHT_CENTER - SHOP_CARD_W // 2 - (n - 1 - i) * SHOP_PITCH for i in range(n)]


def read_shop(eng, img, center_level=None):
    shop = []
    for x0 in detect_shop_slots(eng, img, center_level):
        # one pass covers both the covenant tags (y 918..1000) and the name
        # strip (y 1002..1046); splitting by box position saves a round trip
        body = eng.run(img, (x0 + 10, 912, x0 + SHOP_CARD_W - 8, 1064), scale=3)
        names = [r["text"] for r in body if r["text"] and r["box"][1] >= 1000]
        name = None
        for t in sorted(names, key=lambda s: -len(s)):
            tt = t.strip(" 　")
            if not tt or tt.upper().startswith("[") or "NO INFO" in tt.upper():
                continue
            if tt in UI_WORDS:
                continue
            # 名字常被读成「入陨星」「)拜松」「丽波登可」—— 左侧那个符号是卡片上的图标，
            # 只留汉字，长度 2~6 才算名字。
            tt = re.sub(r"[^\u4e00-\u9fff]", "", tt)
            if 2 <= len(tt) <= 6:
                name = tt
                break
        empty = any("NO INFO" in t.upper() for t in names)

        tags = []
        for t in [r["text"] for r in body
                  if r["text"] and 930 <= r["box"][1] < 1000]:
            t = re.sub(r"[^\u4e00-\u9fff]", "", t.strip(" 　|丨"))
            if len(t) >= 2 and not re.search(r"\d", t):
                tags.append(t)

        # 阶徽章是罗马数字，截图里就是一根/两根竖线：char 模型对它几乎不肯出字，
        # 所以走检测模式，再把「‖ || ll U u l L | 1」这类误读统一归一。
        tier = None
        for t in [r["text"] for r in eng.run(img, (x0 - 40, 770, x0 + 40, 850), scale=4)]:
            tt = t.strip().replace(" ", "")
            if not tt:
                continue
            norm = (tt.replace("Ⅰ", "I").replace("Ⅱ", "II").replace("Ⅲ", "III")
                      .replace("Ⅳ", "IV").replace("Ⅴ", "V").replace("Ⅵ", "VI")
                      .replace("‖", "II").replace("||", "II").replace("ll", "II")
                      .replace("|", "I").replace("l", "I").replace("L", "I")
                      .replace("U", "I").replace("u", "I").replace("1", "I"))
            if re.fullmatch(r"[IVX]{1,3}", norm):
                tier = norm
                break

        # 提速：常用 scale 3 先试（便宜一半），char 模型的 6 倍图只在读不到时用。
        price = _first_int(
            eng.texts(img, (x0 + 76, 776, x0 + 126, 830), scale=3)
        )
        if price is None:
            price = _first_int(
                eng.texts(img, (x0 + 76, 776, x0 + 126, 830),
                          model="PaddleCharOCR", scale=6)
            )
        if price is None:
            # 有些卡（浅色卡面）窄窗口读不出来，放宽窗口再试一次
            price = _first_int(
                eng.texts(img, (x0 + 55, 752, x0 + 200, 832),
                          model="PaddleCharOCR", scale=5)
            )

        if name is None and empty:
            shop.append({"name": None, "tier": None, "price": None,
                         "tags": [], "empty": True, "raw": names})
            continue
        shop.append({
            "name": name,
            "tier": tier,
            "price": price,
            "tags": tags,
            "empty": empty or (name is None and price is None),
            # 点这张卡的坐标：卡片中心，y 固定在 930（卡面空白处，点它开详情）
            "x": x0 + SHOP_CARD_W // 2,
            "y": 930,
            "raw": names + tags,
        })
    return shop


# -- screen classification --------------------------------------------------

def detect_screen(eng, img):
    top = eng.texts(img, (0, 0, 1920, 120), scale=2)
    joined = "".join(top)
    if "开始作战" in joined:
        return "prep"
    if "准备就绪" in joined or "休息一下" in joined or "休息" in joined:
        return "rest"
    if re.search(r"\d\s*/\s*\d", joined):
        return "battle"
    # green 7-seg countdown is only present in battle
    np = eng._np
    arr = np.asarray(img.crop((1650, 20, 1795, 140)).convert("RGB")).astype(int)
    g = arr[:, :, 1]
    mask = (g > 150) & (g - arr[:, :, 0] > 30)
    if int(mask.sum()) > 400:
        return "battle"
    return "unknown"


# ------------------------------------------------------------------ entrypoint

def read_deck_units(img):
    """甲板（整备区）上站着的干员块。干员脚下那块木台面纹理比空台面复杂得多，
    所以「16x16 分块亮度标准差」能把它和空板分开 —— 与空基线做差、扫暗像素、
    扫中性色这三种都试过，全部被光照漂移和边框阴影带偏（见 scripts/deckblocks.py）。

    X 只扫 200..1560：右边 1576 之后是「解冻 / 刷新」按钮，会被当成单位。
    返回 [{left, right, mid}]，Node 侧按块宽反推里面站了几个。
    """
    # X 从 460 起：左边 200..450 是 LEVEL 面板和「升级」按钮，会被当成单位；
    # Y 到 900：折叠态干员的脚在 880 一带，只扫到 800 会整个漏掉（2026-11-10 踩到）。
    X1, X2, Y1, Y2, B = 460, 1560, 580, 900, 16
    px = img.load()
    cols = []
    for x in range(X1, X2, B):
        # 数「有几个 16x16 块纹理复杂」，不用平均值 —— 平均值会被大量空旷块稀释，
        # 甲板一带一旦把 y 范围放大就全体掉到阈值以下（2026-11-10 踩到）。
        hit = 0
        for yy in range(Y1, Y2, B):
            vals = []
            for dy in range(0, B, 4):
                for dx in range(0, B, 4):
                    r, g, b = px[x + dx, yy + dy]
                    vals.append(0.299 * r + 0.587 * g + 0.114 * b)
            if len(vals) < 4:
                continue
            m = sum(vals) / len(vals)
            var = sum((v - m) ** 2 for v in vals) / len(vals)
            if var ** 0.5 >= 38:
                hit += 1
        cols.append((x, hit))

    blocks = []
    run = None
    for x, sd in cols:
        if sd >= 3:
            if run is None:
                run = [x, x]
            else:
                run[1] = x
        else:
            if run is not None:
                blocks.append(run)
                run = None
    if run is not None:
        blocks.append(run)

    out = []
    for left, right in blocks:
        if right - left < 24:      # 太窄 —— 边框/栏杆
            continue
        out.append({"left": left, "right": right + B, "mid": (left + right + B) // 2})
    return out


def probe(path):
    """便宜探针：只判「商店是展开还是折叠」。约 0.5s，analyze 要 7s。

    2026-11-11 13:5x 实测：一局里最贵的是每次切面板都要跑整套 OCR（每回合 6~8 次、
    单次 7s 上下），而切面板只需要「展开没展开」这一个布尔值。判据还是原来那套：
    右下角按钮写「展开」（折叠态）/「收起 ✕」（展开态），亮度只作兜底。
    """
    from PIL import Image

    img = Image.open(path).convert("RGB")
    if img.width != BASE_W:
        img = img.resize((BASE_W, BASE_H), Image.LANCZOS)
    eng = Engine()
    out = {"ok": True, "probe": True, "shopExpanded": None,
           "shopBrightness": None, "shopToggleText": ""}
    try:
        from PIL import ImageStat

        out["shopBrightness"] = round(sum(ImageStat.Stat(img.crop((400, 860, 1600, 1060))).mean), 1)
    except Exception:
        pass
    try:
        tog = "".join(eng.texts(img, (1600, 880, 1920, 1055), scale=3))
        out["shopToggleText"] = tog
        if "展开" in tog:
            out["shopExpanded"] = False
        elif "收起" in tog or "X" in tog or "x" in tog or "✕" in tog or "×" in tog:
            out["shopExpanded"] = True
    except Exception:
        pass
    if out["shopExpanded"] is None and out["shopBrightness"] is not None:
        out["shopExpanded"] = out["shopBrightness"] < 300
    # 买卡要核对「钱少没少」，探针顺带把金币带上（窄框优先，0.3~1.4s）
    try:
        out["money"] = read_money(eng, img, "rest")
    except Exception:
        out["money"] = None
    return out


def analyze(path, level=None, expect=None, round_hint=None, lite=False):
    from PIL import Image

    img = Image.open(path).convert("RGB")
    if img.width != BASE_W:
        img = img.resize((BASE_W, BASE_H), Image.LANCZOS)

    eng = Engine()
    # 提速：调用方明确知道现在应该在哪个界面时（比如买卡循环里一定是休整期），
    # 先用便宜的顶栏文字确认，确认不了再跑完整的界面模板匹配（detect_screen 约 1.7s）。
    # 2026-11-11 13:2x 实测：整局慢的主因就是每张图都跑一遍 detect_screen + read_round。
    top_texts = None
    screen = None
    if lite and expect:
        screen = expect
    elif expect:
        try:
            top_texts = eng.texts(img, (0, 0, 1920, 120), scale=2)
            blob = "".join(top_texts)
            if expect == "rest" and ("休息一下" in blob or "准备就绪" in blob):
                screen = "rest"
        except Exception:
            top_texts = None
    if screen is None:
        screen = detect_screen(eng, img)

    result = {
        "ok": True,
        "screen": screen,
        "round": round_hint if round_hint is not None else read_round(eng, img),
        "money": read_money(eng, img, screen),
        "hp": read_hp(eng, img),
        "countdown": None,
        "shop": [],
        # 注意：不读 LEVEL 面板那个罗马数字。它就在「规程等级1」旁边，OCR 基本只能
        # 读成 "||"/"1"，而中心等级决定商店格数（3+等级），一错整排坐标全错。
        # 只信调用方自己数的值；没传就是 None，read_shop 会退回文字聚类。
        "centerLevel": level,
        "upgradeCost": None,
        "slotsLeft": None,
        # 升级按钮位置：{"x","y"} + 来源（ocr / geometry）。等级 ≥4 时几何坐标会跑出屏幕，
        # 所以真实位置一律优先 OCR 认字（read_upgrade_point）。
        "upgradePoint": None,
        "upgradePointSrc": None,
        "raw": {},
    }

    # 商店展开/折叠：右下角那个按钮展开时写「收起 ✕」、折叠时写「展开 «」。文字判据跟卡面内容
    # 无关，比亮度稳 —— 2026-11-11 10:30 实测：同一套几何，卡面有亮立绘时底排亮度从 134 涨到
    # 238，只差一点就越过阈值，所以亮度只留作日志和最后的兜底。
    try:
        from PIL import ImageStat

        band = ImageStat.Stat(img.crop((400, 860, 1600, 1060))).mean
        result["shopBrightness"] = round(sum(band), 1)
    except Exception:
        result["shopBrightness"] = None
    try:
        tog = "" if lite else "".join(eng.texts(img, (1560, 820, 1920, 1050), scale=3))
        result["shopToggleText"] = tog
        if lite:
            result["shopExpanded"] = None  # lite 不读开关文字，调用方并进旧状态
        elif "展开" in tog:
            result["shopExpanded"] = False
        elif "收起" in tog or "X" in tog or "x" in tog or "✕" in tog or "×" in tog:
            result["shopExpanded"] = True
        else:
            result["shopExpanded"] = None
    except Exception:
        result["shopExpanded"] = None

    # 免费刷新次数：刷新按钮上方那块徽章写「FREE x4」，OCR 直接读数字。
    # 2026-11-11 10:30 实测：有徽章读成 FREEX4 / FREEX2；没有徽章时这块只是按钮底色，读不出数字。
    # 这是刷新不花钱的唯一可靠来源 —— 之前用像素个数只能判「有没有徽章」，判不出「还剩几次」，
    # 结果把「徽章还在但次数用完」当成免费，连点 36 下一次没生效。
    try:
        badge = "".join(eng.texts(img, (1700, 600, 1920, 680), scale=3)).replace(" ", "")
        result["freeBadgeText"] = badge
        m = re.search(r"FREE[^0-9]{0,3}(\d+)", badge, re.I)
        result["freeRefresh"] = int(m.group(1)) if m else 0
    except Exception:
        result["freeBadgeText"] = ""
        result["freeRefresh"] = None

    # 刷新/冻结按钮是不是可点：可用时「刷新」是金黄色 (228,164,9)，不可用时变灰 (122,122,123)。
    # 2026-11-11 10:45 实测：一直点不动的原因不是坐标错，是按钮灰了（当时店里是 3 张 0 费的 V 阶卡 + 3 个空位，
    # 冻结/刷新都灰）。灰了就不要再点，直接收工。
    try:
        from PIL import ImageStat as _IS

        _mean = _IS.Stat(img.crop((1680, 660, 1900, 715))).mean
        result["refreshButtonRGB"] = [round(v) for v in _mean]
        result["refreshEnabled"] = (max(_mean) - min(_mean)) >= 30
    except Exception:
        result["refreshEnabled"] = None

    if screen == "rest":
        # 商店等级：调用方没给就自己认（用户 m04440：左边细条上的罗马数字就是商店等级）
        result["shopLevel"] = level if level is not None else read_shop_level(eng, img)
        # --lite（2026-11-11 16:0x）：刷新循环里只关心「店里有什么卡 / 还剩多少钱 / 还能不能刷」，
        # 升级费、剩余可放置、甲板块这三次识别每轮白花 1.5~2s（一回合刷十几次就是 20s+）。
        # lite 模式下这三项留空，调用方把新状态并进旧状态即可（那些值只在升级/放人时变）。
        if not lite:
            result["upgradeCost"] = read_upgrade_cost(eng, img, level if level is not None else result["shopLevel"])
            result["slotsLeft"] = read_slots_left(eng, img)
        # read_shop 的 center_level 要下标（格子数 = 3 + 下标），等级是界面口径，这里换一次。
        result["shop"] = read_shop(eng, img, None if level is None else _idx(level))
        if not lite:
            result["deckUnits"] = read_deck_units(img)
        if level is not None:
            first, pl, pr, pcx = panel_geometry(_idx(level))
            result["firstSlotLeft"] = first
        # 升级按钮位置（2026-11-12 09:3x 修，用户 m03312）：优先 OCR 认面板底部「升级」两个字。
        # 几何中心只在认不到字时兜底 —— 等级 ≥4 时格数 ≥7，算出来是 (-228, 972)，屏幕外，
        # 点了等于没点，这就是「打到第九回合商店还卡在低等级」的根因。
        up_pt = None
        if not lite:
            # 商店折叠时底边不是升级面板，认出来的「升级」是误读 → 直接跳过，省一次整条扫描。
            # 用时也记下来（upgradePointMs），drive.js 会把它写进 _perf.log 好对比闸门开/关。
            _t0 = time.perf_counter()
            try:
                up_pt = read_upgrade_point(eng, img, expanded=result.get("shopExpanded"))
            except Exception:
                up_pt = None
            result["upgradePointMs"] = round((time.perf_counter() - _t0) * 1000)
            result["upgradePointGated"] = result.get("shopExpanded") is False
        if up_pt:
            result["upgradePoint"] = {"x": up_pt["x"], "y": up_pt["y"]}
            result["upgradePointSrc"] = "ocr"
            result["upgradePointText"] = up_pt.get("text")
            result["upgradePointScore"] = up_pt.get("score")
        elif level is not None:
            result["upgradePoint"] = {"x": pcx, "y": 972}
            result["upgradePointSrc"] = "geometry"
    elif screen == "battle":
        result["countdown"] = read_countdown(eng, img)
        result["raw"]["killProgress"] = [
            t for t in eng.texts(img, (940, 20, 1030, 70), scale=3)
        ]
    elif screen == "prep":
        pass

    result["raw"]["top"] = top_texts if top_texts is not None else eng.texts(img, (0, 0, 1920, 120), scale=2)
    return result


def main(argv=None):
    ap = argparse.ArgumentParser(description="Stronghold Protocol OCR sidecar")
    ap.add_argument("image")
    ap.add_argument("--json", action="store_true", help="emit JSON (default)")
    ap.add_argument("--out", help="write JSON to this file instead of stdout")
    ap.add_argument("--level", type=int, default=None,
                    help="调度中心等级（调用方自己数，比 OCR 认罗马数字可靠）")
    ap.add_argument("--expect", choices=["rest", "battle", "prep"], default=None,
                    help="调用方已知的界面：先用顶栏文字快速确认，确认不了再跑完整识别（省 ~1.7s）")
    ap.add_argument("--lite", action="store_true",
                    help="刷新循环用：只读商店/金币/免费次数/按钮态（省 ~2s）")
    ap.add_argument("--probe", action="store_true",
                    help="只判商店展开/折叠（约 0.5s，不跑整套 OCR）")
    ap.add_argument("--round", type=int, default=None,
                    help="回合数提示：给了就不再 OCR 读回合号（省 ~1.1s）")
    args = ap.parse_args(argv)

    try:
        if args.probe:
            data = probe(args.image)
        else:
            data = analyze(args.image, level=args.level, expect=args.expect, round_hint=args.round, lite=args.lite)
    except Exception as exc:  # noqa: BLE001 - report, never crash the caller
        data = {"ok": False, "error": "%s: %s" % (type(exc).__name__, exc),
                "screen": "unknown"}
        if args.out:
            with open(args.out, "w", encoding="utf-8") as fh:
                json.dump(data, fh, ensure_ascii=False)
            return 0
        print(json.dumps(data, ensure_ascii=False))
        return 0

    payload = json.dumps(data, ensure_ascii=False)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(payload)
    else:
        sys.stdout.write(payload + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
