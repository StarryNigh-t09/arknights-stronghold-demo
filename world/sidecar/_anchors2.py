
import sys, json
from PIL import Image, ImageDraw, ImageFont
src, mapjson, outA, outB = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
m = json.load(open(mapjson))
cols = m['grid']['cols']; rows = m['grid']['rows']
deploy = [c for c in m['cells'] if c['deploy']]
try:
    font = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 20)
    font2 = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 16)
except Exception:
    font = ImageFont.load_default(); font2 = font
CYAN = (0, 210, 210)
def grid(d):
    for x in cols:
        d.line([(x - 59, rows[0] - 55), (x - 59, rows[-1] + 55)], fill=CYAN, width=1)
    for y in rows:
        d.line([(cols[0] - 59, y - 55), (cols[-1] + 59, y - 55)], fill=CYAN, width=1)
tbl = []
imA = Image.open(src).convert('RGB'); dA = ImageDraw.Draw(imA); grid(dA)
imB = Image.open(src).convert('RGB'); dB = ImageDraw.Draw(imB); grid(dB)
for i, c in enumerate(deploy, 1):
    cx, cy = c['px']
    fx, fy = cx + 33, cy + 120
    tbl.append((i, cx, cy, fx, fy))
    dA.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=(255, 255, 255), outline=(0, 0, 0))
    dA.text((cx - 52, cy - 30), 'C' + str(i), fill=(255, 255, 255), font=font)
    dA.text((cx - 52, cy + 10), str(cx) + ',' + str(cy), fill=(255, 255, 0), font=font2)
    dB.ellipse([fx - 8, fy - 8, fx + 8, fy + 8], fill=(255, 50, 50), outline=(255, 255, 255))
    dB.text((fx - 52, fy - 32), 'C' + str(i), fill=(255, 80, 80), font=font)
    dB.text((fx - 52, fy + 8), str(fx) + ',' + str(fy), fill=(255, 255, 0), font=font2)
imA.save(outA); imB.save(outB)
for t in tbl:
    print(('C%d' % t[0]) + ' 格心 ' + str(t[1]) + ',' + str(t[2]) + '  手指 ' + str(t[3]) + ',' + str(t[4]))
