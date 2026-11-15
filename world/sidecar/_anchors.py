
import sys, json
from PIL import Image, ImageDraw, ImageFont
src, mapjson, out = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(src).convert('RGB')
d = ImageDraw.Draw(im)
m = json.load(open(mapjson))
cols = m['grid']['cols']; rows = m['grid']['rows']
GREEN = (60, 220, 120); RED = (255, 60, 60); CYAN = (0, 200, 200)
GOLD = (255, 190, 40); PINK = (255, 150, 200)
try:
    font = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 18)
except Exception:
    font = ImageFont.load_default()
for x in cols:
    d.line([(x - 59, rows[0] - 55), (x - 59, rows[-1] + 55)], fill=CYAN, width=1)
for y in rows:
    d.line([(cols[0] - 59, y - 55), (cols[-1] + 59, y - 55)], fill=CYAN, width=1)
for c in m['cells']:
    cx, cy = c['px']
    gate = c.get('gate')
    if c['deploy']:
        d.ellipse([cx - 46, cy - 46, cx + 46, cy + 46], outline=GREEN, width=4)
        fx, fy = cx + 33, cy + 120
        d.line([(fx - 12, fy), (fx + 12, fy)], fill=RED, width=4)
        d.line([(fx, fy - 12), (fx, fy + 12)], fill=RED, width=4)
        d.text((cx - 40, cy - 76), str(cx) + ',' + str(cy), fill=GREEN, font=font)
    elif gate:
        d.ellipse([cx - 46, cy - 46, cx + 46, cy + 46], outline=(80, 160, 255) if gate == 'blue' else RED, width=4)
        d.text((cx - 40, cy - 76), 'GATE ' + str(cx) + ',' + str(cy), fill=(255, 255, 255), font=font)
    elif c['kind'] == 'path':
        d.ellipse([cx - 46, cy - 46, cx + 46, cy + 46], outline=(180, 120, 255), width=3)
for p in m['unitDeck']:
    d.ellipse([p[0] - 46, p[1] - 46, p[0] + 46, p[1] + 46], outline=PINK, width=3)
for p in m['equipDeck']:
    d.ellipse([p[0] - 42, p[1] - 42, p[0] + 42, p[1] + 42], outline=GOLD, width=3)
im.save(out)
print('ok')
