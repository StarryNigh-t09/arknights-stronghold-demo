# -*- coding: utf-8 -*-
"""_um.py — 纯图像认人实验：用 Ark-Models 渲染的 Q 版小人图库匹配甲板/场上干员。"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
W = os.path.dirname(HERE)

def badges(png):
    out = os.path.join(W, '.tmp', '_um_badges.json')
    subprocess.run([sys.executable, os.path.join(W, 'sidecar', 'deck.py'), png, out], check=True,
                   stdout=subprocess.DEVNULL)
    d = json.load(open(out, encoding='utf-8'))
    if isinstance(d, dict):
        d = d.get('best') or []
    return d

def load_icons():
    meta = json.load(open(os.path.join(W, 'data', 'unit-icons.json'), encoding='utf-8'))
    ops = meta.get('operators') or {}
    items = []
    for name, rec in ops.items():
        p = os.path.join(W, 'assets', 'unit-icons', name, 'default.png')
        if os.path.exists(p):
            items.append((name, p))
    return items

def prep(img, h):
    im = Image.open(img).convert('RGBA')
    w = max(1, int(round(im.width * h / im.height)))
    im = im.resize((w, h), Image.LANCZOS)
    a = np.asarray(im, dtype=np.float32)
    alpha = a[..., 3] / 255.0
    comp = a[..., :3] * alpha[..., None] + np.float32(150.0) * (1 - alpha[..., None])
    return comp.mean(axis=2).astype(np.float32), alpha

def score(patch, tmpl, mask):
    h, w = tmpl.shape
    ph, pw = patch.shape
    if ph < h or pw < w:
        return -1.0
    sel = mask > 0.35
    if sel.sum() < 200:
        return -1.0
    t = tmpl[sel]
    t = t - t.mean()
    tn = np.linalg.norm(t)
    best = -1.0
    for y in range(0, ph - h + 1, 3):
        for x in range(0, pw - w + 1, 3):
            sub = patch[y:y + h, x:x + w][sel]
            s = sub - sub.mean()
            den = np.linalg.norm(s) * tn
            if den < 1e-6:
                continue
            v = float((s * t).sum() / den)
            if v > best:
                best = v
    return best

def main():
    png = sys.argv[1]
    bs = badges(png)
    img = Image.open(png).convert('RGB')
    icons = load_icons()
    print('icons', len(icons), 'badges', len(bs))
    results = []
    for b in bs[:5]:
        bx, by = b['x'], b['y']
        crop = img.crop((max(0, bx - 30), max(0, by + 10), min(img.width, bx + 120), min(img.height, by + 170)))
        crop.save(os.path.join(W, '.tmp', '_um_' + str(bx) + '.png'))
        arr = np.asarray(crop.convert('L'), dtype=np.float32)
        best = []
        for name, p in icons:
            for h in (86, 100, 114):
                t, m = prep(p, h)
                s = score(arr, t, m)
                best.append((s, name, h))
        best.sort(reverse=True)
        results.append({'badge': [bx, by], 'top': [{'name': n, 'score': round(float(s), 4), 'h': h} for s, n, h in best[:6]]})
    json.dump({'results': results}, open(os.path.join(W, '.tmp', '_um.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=2)
    print('done', len(results))

main()
