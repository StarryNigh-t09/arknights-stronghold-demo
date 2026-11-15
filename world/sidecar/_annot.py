import sys, json
from PIL import Image, ImageDraw, ImageFont
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
d = ImageDraw.Draw(im)
try:
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 20)
except Exception:
    font = ImageFont.load_default()
ax, ay, step = 660, 300, 110
gx0, gx1, gy0, gy1 = -2, 10, -2, 5
for gx in range(gx0, gx1 + 1):
    x = ax + gx * step
    d.line([(x, 60), (x, 1000)], fill=(0, 255, 255), width=2)
for gy in range(gy0, gy1 + 1):
    y = ay + gy * step
    d.line([(300, y), (1700, y)], fill=(0, 255, 255), width=2)
for gx in range(gx0, gx1):
    for gy in range(gy0, gy1):
        cx, cy = ax + gx * step + 8, ay + gy * step + 4
        label = str(gx) + ',' + str(gy)
        d.rectangle([cx - 3, cy - 2, cx + 46, cy + 22], fill=(0, 0, 0))
        d.text((cx, cy), label, fill=(255, 255, 0), font=font)
d.text((320, 930), 'grid: x=660+110*gx, y=300+110*gy', fill=(0, 255, 255), font=font)
im.save(dst)
print('ok', dst)