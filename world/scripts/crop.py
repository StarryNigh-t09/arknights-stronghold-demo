import sys
from PIL import Image
src, dst, l, t, r, b, w, h = sys.argv[1:9]
im = Image.open(src)
im.crop((int(l), int(t), int(r), int(b))).resize((int(w), int(h))).save(dst)
print("src", im.size, "->", (int(w), int(h)))
