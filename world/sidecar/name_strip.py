# -*- coding: utf-8 -*-
"""把多张「干员详情」截图里的名字小条裁出来竖着拼成一张，一次 OCR 认完。

用法：python sidecar/name_strip.py <out.png> <out.json> <shot1.png> [shot2.png ...]
输出 json：{"rows":[{"i":0,"src":"...png","y":0,"h":90}], "stack":"out.png"}

名字在详情面板里的位置是固定的（1920x1080 基准）：x 0~220、y 235~320。
之前每张整屏跑一次 OCR，6 张要 20s+；裁成 220x90 的小条拼一起，一次 OCR 约 1~2s。
"""
import sys, json, os

def main():
    from PIL import Image
    if len(sys.argv) < 4:
        print(json.dumps({"ok": False, "error": "need out.png out.json shots..."}, ensure_ascii=False)); return
    out_png, out_json = sys.argv[1], sys.argv[2]
    shots = sys.argv[3:]
    rows = []
    strips = []
    for i, s in enumerate(shots):
        im = Image.open(s).convert('RGB')
        sx = im.width / 1920.0
        box = (0, int(233 * sx), int(230 * sx), int(322 * sx))
        st = im.crop(box)
        strips.append(st)
        rows.append({"i": i, "src": s, "w": st.width, "h": st.height})
    gap = 6
    W = max(s.width for s in strips)
    H = sum(s.height for s in strips) + gap * (len(strips) - 1)
    canvas = Image.new('RGB', (W, H), (255, 255, 255))
    y = 0
    for i, st in enumerate(strips):
        canvas.paste(st, (0, y))
        rows[i]['y'] = y
        rows[i]['y0'] = y
        y += st.height + gap
    canvas.save(out_png)
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump({"ok": True, "rows": rows, "stack": out_png, "gap": gap}, f, ensure_ascii=False, indent=1)
    print(json.dumps({"ok": True, "n": len(rows), "size": [W, H]}, ensure_ascii=False))

if __name__ == '__main__':
    main()
