
import sys, json
from PIL import Image, ImageDraw, ImageFont
src, out, y0 = sys.argv[1], sys.argv[2], int(sys.argv[3])
base = json.load(open('./world/data/maps/wz-01.json'))
im = Image.open(src).convert('RGB'); d = ImageDraw.Draw(im)
font = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 18)
shift = y0 - base['grid']['rowsBoard'][0]
cols = base['grid']['cols']
for c in base['cells']:
    if not c['deploy']:
        continue
    cx, cy = c['px'][0], c['px'][1] + shift
    d.ellipse([cx - 46, cy - 46, cx + 46, cy + 46], outline=(60, 230, 120), width=4)
    d.text((cx - 40, cy - 28), str(cx) + ',' + str(cy), fill=(255, 255, 0), font=font)
for y in base['grid']['rowsBoard']:
    yy = y + shift
    d.line([(cols[0] - 59, yy - 55), (cols[-1] + 59, yy - 55)], fill=(0, 210, 210), width=1)
for x in cols:
    d.line([(x - 59, base['grid']['rowsBoard'][0] + shift - 55), (x - 59, base['grid']['rowsBoard'][-1] + shift + 55)], fill=(0, 210, 210), width=1)
im.save(out)
print('shift', shift)
