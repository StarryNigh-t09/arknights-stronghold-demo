import sys
from PIL import Image, ImageDraw
src, out = sys.argv[1], sys.argv[2]
ax, ay, step = float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
im = Image.open(src).convert('RGB')
d = ImageDraw.Draw(im)
for i in range(-1, 14):
    x = ax + i * step
    d.line([(x, 0), (x, im.height)], fill=(0, 255, 255), width=1)
for j in range(-1, 12):
    y = ay + j * step
    d.line([(0, y), (im.width, y)], fill=(255, 0, 255), width=1)
im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
im.save(out)
print('ok')
