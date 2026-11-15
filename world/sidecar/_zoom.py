
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
boxes = [(380, 180, 1080, 960), (1000, 180, 1720, 960)]
for i, bx in enumerate(boxes):
    c = im.crop(bx)
    c = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
    c.save('../_zoom%d.png' % (i + 1))
print('ok')
