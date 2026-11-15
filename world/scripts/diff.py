import sys
from PIL import Image, ImageChops
a = Image.open(sys.argv[1]).convert("L")
b = Image.open(sys.argv[2]).convert("L")
d = ImageChops.difference(a, b)
bbox = d.getbbox()
px = list(d.getdata())
mean = sum(px) / len(px)
big = sum(1 for v in px if v > 30)
print("mean %.2f changed>30 %d bbox %s" % (mean, big, bbox))
