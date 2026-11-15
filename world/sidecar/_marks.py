
import sys, json
from PIL import Image, ImageDraw, ImageFont
src, mapjson, out = sys.argv[1], sys.argv[2], sys.argv[3]
m = json.load(open(mapjson))
im = Image.open(src).convert('RGB'); d = ImageDraw.Draw(im)
font = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 20)
n = 0
for c in m['cells']:
    if not c['deploy']:
        continue
    n += 1
    cx, cy = c['px']
    d.line([(cx - 14, cy), (cx + 14, cy)], fill=(255, 255, 255), width=3)
    d.line([(cx, cy - 14), (cx, cy + 14)], fill=(255, 255, 255), width=3)
    d.text((cx + 16, cy - 12), 'C' + str(n), fill=(255, 255, 255), font=font)
im.save(out)
print('marks', n)
