
import sys, json
from PIL import Image, ImageDraw, ImageFont
src, mapjson, out = sys.argv[1], sys.argv[2], sys.argv[3]
m = json.load(open(mapjson))
img = Image.open(src).convert('RGB'); d = ImageDraw.Draw(img)
font = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 19)
font2 = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 22)
d.text((380, 210), '商店已折叠 · 19 个点击点(白十字) = 你画的圈心', fill=(255, 255, 255), font=font2)
i = 0
for c in m['cells']:
    if not c['deploy']:
        continue
    i += 1
    cx, cy = c['px']
    d.line([(cx - 16, cy), (cx + 16, cy)], fill=(255, 255, 255), width=3)
    d.line([(cx, cy - 16), (cx, cy + 16)], fill=(255, 255, 255), width=3)
    d.text((cx + 18, cy - 22), 'C' + str(i), fill=(255, 60, 60), font=font)
    d.text((cx + 18, cy + 2), str(cx) + ',' + str(cy), fill=(255, 235, 0), font=font)
for p in m['unitDeck']:
    d.ellipse([p[0] - 30, p[1] - 30, p[0] + 30, p[1] + 30], outline=(255, 150, 200), width=2)
for p in m['equipDeck']:
    d.ellipse([p[0] - 28, p[1] - 28, p[0] + 28, p[1] + 28], outline=(255, 190, 40), width=2)
img.save(out)
print('ok', i)
