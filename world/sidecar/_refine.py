
import sys, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

REF = {
 'high': (255, 222, 40),
 'ground': (70, 215, 120),
 'path': (170, 120, 230),
 'gate_red': (230, 60, 60),
 'gate_blue': (60, 150, 235),
}
src, mapjson, outjson, outpng = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
m = json.load(open(mapjson))
img = Image.open(src).convert('RGB')
im = np.array(img, dtype=int)
res = []
for c in m['cells']:
    if not (c['deploy'] or c['kind'] == 'path' or c.get('gate')):
        continue
    key = c['kind']
    ref = np.array(REF.get(key, (255, 255, 255)))
    cx, cy = c['px']
    x0, x1 = max(0, cx - 60), min(im.shape[1], cx + 60)
    y0, y1 = max(0, cy - 60), min(im.shape[0], cy + 60)
    sub = im[y0:y1, x0:x1]
    d = np.abs(sub - ref).sum(axis=2)
    ys, xs = np.nonzero(d < 120)
    if len(xs) < 80:
        res.append(dict(px=c['px'], kind=key, refined=None, n=int(len(xs))))
        continue
    rx = float(xs.mean()) + x0
    ry = float(ys.mean()) + y0
    res.append(dict(px=c['px'], kind=key, refined=[round(rx, 1), round(ry, 1)], n=int(len(xs))))
json.dump(res, open(outjson, 'w'), indent=1)
d2 = ImageDraw.Draw(img)
font = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 19)
i = 0
for c in m['cells']:
    if not c['deploy']:
        continue
    i += 1
    cx, cy = c['px']
    d2.line([(cx - 15, cy), (cx + 15, cy)], fill=(255, 255, 255), width=3)
    d2.line([(cx, cy - 15), (cx, cy + 15)], fill=(255, 255, 255), width=3)
    d2.text((cx + 16, cy - 10), 'C' + str(i) + ' ' + str(cx) + ',' + str(cy), fill=(255, 255, 0), font=font)
img.save(outpng)
for r in res:
    print(r['kind'], r['px'], '->', r['refined'], 'n', r['n'])
