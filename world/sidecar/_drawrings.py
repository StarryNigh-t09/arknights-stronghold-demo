
import sys, json
from PIL import Image, ImageDraw, ImageFont
src, ringjson, out = sys.argv[1], sys.argv[2], sys.argv[3]
rings = json.load(open(ringjson))
img = Image.open(src).convert('RGB'); d = ImageDraw.Draw(img)
f = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 20)
f2 = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 26)
d.rectangle([8, 8, 900, 52], fill=(0, 0, 0))
d.text((18, 14), u'红叉 = 程序在图上找到的色环（共 14 个，还没认全）', fill=(255, 255, 255), font=f2)
for i, c in enumerate(sorted(rings, key=lambda q: (q['y'], q['x']))):
    x, y = c['x'], c['y']
    d.line([(x-14, y), (x+14, y)], fill=(255, 0, 0), width=3)
    d.line([(x, y-14), (x, y+14)], fill=(255, 0, 0), width=3)
    d.text((x+16, y-24), '%d:%d,%d' % (i+1, x, y), fill=(255, 0, 0), font=f)
img.save(out)
print('saved', out)
