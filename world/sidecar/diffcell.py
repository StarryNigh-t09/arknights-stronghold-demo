import sys, json
from PIL import Image, ImageChops, ImageStat
b, a, cx, cy, half, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
im1 = Image.open(b).convert('L')
im2 = Image.open(a).convert('L')
box = (max(0, cx - half), max(0, cy - half), min(im1.width, cx + half), min(im1.height, cy + half))
c1 = im1.crop(box); c2 = im2.crop(box)
stat = ImageStat.Stat(ImageChops.difference(c1, c2))
json.dump({'diff': float(stat.mean[0]), 'box': box}, open(out, 'w'))
