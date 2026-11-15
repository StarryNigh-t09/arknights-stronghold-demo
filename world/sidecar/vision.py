#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""vision.py — 界面状态识别（不依赖 OCR / numpy，只用 Pillow）

思路（本质是模板匹配的轻量版）：
  界面布局是固定的，所以不需要全图滑窗搜索。给每个已知界面挑 1~3 个
  **稳定且唯一** 的小区域（ROI），把 ROI 灰度缩到 8x8 存成签名；
  运行时算同一个 ROI 的签名，取所有界面里平均 L1 距离最小的那个。

  距离定义：mean(|a-b|)/255，0 = 完全一样，1 = 完全相反。
  经验阈值：< 0.12 基本确定；0.12~0.22 存疑；> 0.22 判 unknown。

为什么不用 numpy：这台机器系统 Python 没装 numpy，Pillow 有。
8x8=64 个像素自己算，比装依赖快。
"""
import json
import os
import sys
import time

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from PIL import Image

N = 8  # 签名边长

# 每个界面挑的 ROI（1920x1080 逻辑坐标）：(x, y, w, h)
SCREENS = {
    "title": [  # 标题页：底部 START 菱形
        (900, 990, 120, 80),
    ],
    "login": [  # 开始唤醒按钮
        (740, 700, 440, 110),
    ],
    "hall": [  # 大厅：右下卫戍协议竖 banner
        (1700, 140, 190, 170),
    ],
    "wz_hall": [  # 卫戍大厅：中央 РЕГЛАМЕНТ 大字
        (760, 290, 400, 80),
    ],
    "wz_admin": [  # 物资调配处：顶部两个 tab
        (270, 10, 470, 90),
    ],
    "wz_squad": [  # 自选编队弹窗：标题
        (740, 110, 440, 70),
    ],
    "wz_db": [  # 协议数据库：左栏第一章
        (180, 230, 300, 130),
    ],
    "wz_joint": [  # 选择同盟方式：右侧绿色「创建同盟」条
        (1080, 440, 730, 100),
    ],
    "wz_diff": [  # 独立模拟难度页：右下「开始模拟」青绿按钮
        (1360, 950, 560, 110),
    ],
    "wz_rest": [  # 休整期：顶部青绿「休息一下」徽章；第二块在 rest 时是地形，用来和 buydetail 的生命条拉开
        (855, 18, 260, 64),
        (0, 492, 830, 26),
    ],
    "wz_prep": [  # 作战准备：顶部橙色「开始作战」胶囊
        (840, 5, 300, 85),
    ],
    "wz_battle": [  # 作战中：顶部击杀进度 0/N 胶囊 + 右上倒计时（含 COUNTDOWN 竖排字）
        (840, 10, 260, 80),
        (1680, 10, 210, 140),
    ],
    "wz_buydetail": [  # 商店卡详情：特质/技能/特性/天赋 tab 条（rest 时这块是地形）
        (0, 530, 830, 60),
    ],
    "wz_settle": [  # 结算页：右下青绿「返回主页」按钮（胜败都在，比中间的字稳）
        (1470, 968, 380, 62),
    ],
    "wz_hall_joint": [  # 卫戍大厅·联合模式：右下「搜寻队友」青绿按钮（个人模式下这里是「独立模拟」，一眼能分）
        (1570, 925, 310, 95),
    ],
    "wz_runinfo": [  # 开局 1/3 确认本局信息（选核心盟约）：左上步骤标题
        (575, 20, 250, 60),
    ],
    "wz_strategy": [  # 开局 2/3 选择策略：步骤标题
        (855, 20, 215, 60),
    ],
    "wz_squadsel": [  # 开局 3/3 确定自选编队：步骤标题
        (855, 20, 240, 60),
    ],
    "wz_tactic": [  # 战术决策（3 选 1）：左上「战术决策」标题 + 右侧「收起」按钮
        (185, 25, 300, 75),
        (1625, 380, 145, 120),
    ],
    "wz_warbanner": [  # 「作战结束 / 生命值减少 N」黑底横条：回合打完到下一个休整期之间的过场
        (880, 420, 1120, 500),
    ],
}


def _sig(img, box):
    x, y, w, h = box
    crop = img.crop((x, y, x + w, y + h)).convert("L").resize((N, N), Image.BILINEAR)
    px = list(crop.getdata())
    # 亮度归一化：教学弹窗那层黑色半透明遮罩是「乘法」压暗，同一块 ROI 会整体变暗。
    # 按均值拉到 128 以后，压暗前后的签名一致，不会把被遮罩的难度页判成别的界面。
    mean = sum(px) / float(len(px))
    if mean > 2:
        px = [min(255, int(round(v * 128.0 / mean))) for v in px]
    return px


def _dist(a, b):
    if not a or not b:
        return 1.0
    return sum(abs(p - q) for p, q in zip(a, b)) / (255.0 * len(a))


def signature(path_or_img):
    """算一张图的全部 ROI 签名"""
    img = path_or_img if isinstance(path_or_img, Image.Image) else Image.open(path_or_img)
    img = img.convert("RGB")
    return {name: [_sig(img, box) for box in boxes] for name, boxes in SCREENS.items()}


# 每屏的样本（相对样本目录）：build 用它们取中位数，test 用它们当预期
SAMPLES = {
    "title": ["s_title.png"],
    "login": ["s_login.png"],
    "hall": ["s_hall.png"],
    "wz_hall": ["wz_after.png", "wz-1794219719833.png"],
    "wz_admin": ["wz_admin.png", "wz_hall3.png"],
    "wz_squad": ["wz_squad.png"],
    "wz_db": ["wz_db.png"],
    "wz_joint": ["joint_panel.png"],
    "wz_diff": ["wz-1794219740282.png", "wz-1794219759922.png", "wz-1794219777336.png"],
    "wz_rest": [
        "wz_rest_r1.png", "wz_r3.png", "wz_r3_b.png", "wz_r3_c.png", "wz_r3_e.png",
        "wz_r3_ready.png", "wz_r3_view.png", "wz_r2_a.png", "wz_r2_b.png",
        "wz_battle2.png", "wz_buy2.png", "wz_m1.png", "wz_view2.png", "wz_view3.png",
    ],
    "wz_prep": ["wz_ready1.png", "wz_prep3.png"],
    "wz_battle": ["wz_battle1.png", "wz_battle3.png", "wz_b4.png", "wz_p5.png", "wz_stage4.png"],
    "wz_buydetail": ["wz_buy1.png", "wz_m2.png", "wz_r3_d.png", "wz_r3_ready2.png", "wz_unit_tap.png"],
    "wz_settle": ["wz_r5.png"],
    "wz_hall_joint": ["wz_hall_joint.png", "wz_hall2.png", "wz2.png"],
    "wz_runinfo": ["live10.png", "live11.png"],
    "wz_strategy": ["live12.png", "live13.png", "live6.png"],
    "wz_squadsel": ["live15.png"],
    "wz_tactic": ["wz_tactic1.png", "wz_tactic2.png"],
    "wz_warbanner": ["wz_warbanner1.png"],
}


def _resolve(name, dirs):
    """在多个样本目录里找同名样本：先找到先用；都没有就报第一个目录的路径，缺样本时看得清楚"""
    for d in dirs:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    return os.path.join(dirs[0], name)


def _resolve_all(names, dirs):
    return [_resolve(n, dirs) for n in names]


def build(shots, out_path):
    """shots: {label: [图片路径, ...]} → 每屏多条样本取逐像素中位数"""
    bank = {}
    for label, paths in shots.items():
        sigs = [signature(p)[label] for p in paths if os.path.exists(p)]
        if not sigs:
            continue
        merged = []
        for i in range(len(sigs[0])):
            merged.append([int(sorted(s[i][k] for s in sigs)[len(sigs) // 2]) for k in range(N * N)])
        bank[label] = merged
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"n": N, "screens": {k: v for k, v in SCREENS.items()}, "bank": bank}, f, ensure_ascii=False)
    return bank


def load_bank(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)["bank"]


def classify(img, bank):
    """返回 (state, score, 排行)"""
    cur = signature(img)
    ranking = []
    for label, sigs in bank.items():
        if label not in cur:
            continue
        ds = [_dist(a, b) for a, b in zip(cur[label], sigs)]
        ranking.append((label, sum(ds) / len(ds)))
    ranking.sort(key=lambda t: t[1])
    if not ranking:
        return "unknown", 1.0, []
    return ranking[0][0], ranking[0][1], ranking


UNSURE = 0.12  # 与 vision.js 的警告阈值一致：超过这个距离就当「没认出」
_UNK_SEQ = [0]


def save_unknown(path_or_img, shots_dir):
    """没认清的界面存一份，方便以后补模板（局内界面现在就没有模板）。
    返回存下的路径；目录不可写时返回 None，绝不抛异常。"""
    try:
        img = path_or_img if isinstance(path_or_img, Image.Image) else Image.open(path_or_img)
        out_dir = os.path.join(shots_dir, "unknown")
        os.makedirs(out_dir, exist_ok=True)
        _UNK_SEQ[0] += 1
        out = os.path.join(out_dir, "unk-%s-%02d.png" % (time.strftime("%Y%m%d-%H%M%S"), _UNK_SEQ[0] % 100))
        img.convert("RGB").save(out)
        return out
    except Exception:
        return None


def _emit(state, score, ranking, img_path, shots_dir):
    payload = {"state": state, "dist": round(score, 4),
               "ranking": [[k, round(v, 4)] for k, v in ranking]}
    if state == "unknown" or score > UNSURE:
        saved = save_unknown(img_path, shots_dir)
        if saved:
            payload["savedUnknown"] = saved
    print(json.dumps(payload, ensure_ascii=False))


def _first_existing(paths):
    for p in paths:
        if os.path.exists(p):
            return p
    return paths[0]


def main(argv):
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)
    # 两种布局都要能跑：开发时在 <repo>/sidecar/，发布后在 <pkg>/sidecar/
    bank_path = _first_existing([
        os.path.join(here, "..", "assets", "screens.json"),          # 发布后：plugin/sidecar/../assets
        os.path.join(root, "plugin", "assets", "screens.json"),       # 开发时：<repo>/sidecar -> <repo>/plugin/assets
    ])
    # shots 只给 build/test/shot 这些开发子命令用，发布包里没有。
    # 样本分散在三处：新样本在 <pkg>/shots，老样本在 <repo>/shots，同盟页在 <repo>/plugin/shots
    shots_dirs = []
    for p in [
        os.path.join(root, "shots"),                                  # 开发时：<repo>/world/shots（新样本）
        os.path.join(here, "..", "..", "shots"),                      # 开发时：plugin/sidecar -> <repo>/shots（老样本）
        os.path.join(root, "..", "plugin", "shots"),                  # <repo>/plugin/shots（joint_panel.png）
    ]:
        p = os.path.normpath(p)
        if os.path.isdir(p) and p not in shots_dirs:
            shots_dirs.append(p)
    if not shots_dirs:
        shots_dirs = [os.path.normpath(os.path.join(root, "shots"))]
    shots_dir = shots_dirs[0]

    if len(argv) > 1 and argv[1] == "build":
        mapping = {label: _resolve_all(names, shots_dirs) for label, names in SAMPLES.items()}
        missing = [p for v in mapping.values() for p in v if not os.path.exists(p)]
        if missing:
            print("缺样本：", missing)
        bank = build(mapping, bank_path)
        print("built:", list(bank.keys()), "->", bank_path)
        return 0

    if len(argv) > 1 and argv[1] == "test":
        bank = load_bank(bank_path)
        ok = 0
        bad = 0
        missing = 0
        for label, names in SAMPLES.items():
            for name in names:
                p = _resolve(name, shots_dirs)
                if not os.path.exists(p):
                    missing += 1
                    print("SKIP %-22s 找不到样本" % name)
                    continue
                st, sc, rk = classify(p, bank)
                good = st == label and sc < UNSURE
                if good:
                    ok += 1
                else:
                    bad += 1
                runner = ", ".join("%s=%.3f" % (k, v) for k, v in rk[:3])
                print("%s %-22s 实测 %-12s dist=%.3f  [%s]" % ("OK " if good else "XX ", name, st, sc, runner))
        total = ok + bad
        print("准确率 %d/%d（缺样本 %d）" % (ok, total, missing))
        return 0 if total and not bad else 1

    if len(argv) > 1 and argv[1] == "classify-file":
        bank = load_bank(bank_path)
        st, sc, rk = classify(argv[2], bank)
        _emit(st, sc, rk, argv[2], shots_dir)
        return 0

    if len(argv) > 1 and argv[1] == "shot":
        # 现场截一张
        import subprocess
        import tempfile
        out = os.path.join(shots_dir, "live.png")
        subprocess.run([sys.executable, os.path.join(here, "arkd.py"), "shot", "live"],
                       cwd=here, stdout=subprocess.DEVNULL)
        bank = load_bank(bank_path)
        st, sc, rk = classify(out, bank)
        _emit(st, sc, rk, out, shots_dir)
        return 0

    print("用法: vision.py build | test | shot")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
