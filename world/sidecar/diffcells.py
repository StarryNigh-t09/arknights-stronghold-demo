import sys, json
from PIL import Image, ImageChops, ImageStat
b, a, points, half, out = sys.argv[1], sys.argv[2], json.loads(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
im1 = Image.open(b).convert('L'); im2 = Image.open(a).convert('L')
res = []
for p in points:
    cx, cy = int(p[0]), int(p[1])
    box = (max(0, cx-half), max(0, cy-half), min(im1.width, cx+half), min(im1.height, cy+half))
    d = ImageStat.Stat(ImageChops.difference(im1.crop(box), im2.crop(box))).mean[0]
    res.append(float(d))
json.dump({'diffs': res}, open(out, 'w'))
