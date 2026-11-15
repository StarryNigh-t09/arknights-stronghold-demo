import sys
from PIL import Image, ImageDraw

src, dst = sys.argv[1], sys.argv[2]
l, t, r, b = map(int, sys.argv[3:7])
scale = float(sys.argv[7]) if len(sys.argv) > 7 else 1.0
step = int(sys.argv[8]) if len(sys.argv) > 8 else 50

im = Image.open(src).convert("RGB")
crop = im.crop((l, t, r, b))
crop = crop.resize((int(crop.width * scale), int(crop.height * scale)), Image.LANCZOS)
d = ImageDraw.Draw(crop)
for x in range(l - l % step, r + 1, step):
    px = (x - l) * scale
    if 0 <= px < crop.width:
        d.line([(px, 0), (px, crop.height)], fill=(0, 255, 0), width=1)
        d.text((px + 2, 2), str(x), fill=(0, 255, 0))
for y in range(t - t % step, b + 1, step):
    py = (y - t) * scale
    if 0 <= py < crop.height:
        d.line([(0, py), (crop.width, py)], fill=(0, 255, 0), width=1)
        d.text((2, py + 1), str(y), fill=(0, 255, 0))
crop.save(dst)
print("saved", crop.size)
