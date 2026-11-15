import sys
from PIL import Image, ImageDraw, ImageFont
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
d = ImageDraw.Draw(im)
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 17)
xs = [72 + 118 * k for k in range(0, 17)]
ys = [71 + 110 * k for k in range(0, 10)]
for x in xs:
    d.line([(x, 150), (x, 1000)], fill=(0, 255, 255), width=1)
for y in ys:
    d.line([(300, y), (1700, y)], fill=(0, 255, 255), width=1)
for i in range(len(xs) - 1):
    for j in range(len(ys) - 1):
        cx = (xs[i] + xs[i + 1]) // 2
        cy = (ys[j] + ys[j + 1]) // 2
        if not (420 <= cx <= 1660 and 220 <= cy <= 930):
            continue
        t = str(cx) + ',' + str(cy)
        tw = d.textlength(t, font=font)
        d.rectangle([cx - tw / 2 - 2, cy - 10, cx + tw / 2 + 2, cy + 12], fill=(0, 0, 0))
        d.text((cx - tw / 2, cy - 9), t, fill=(255, 255, 0), font=font)
im.save(dst)
print('cells', (len(xs) - 1) * (len(ys) - 1))