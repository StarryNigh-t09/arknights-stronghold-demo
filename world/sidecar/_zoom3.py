
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
c = im.crop((420, 540, 1720, 830))
c = c.resize((int(c.width * 1.45), int(c.height * 1.45)), Image.LANCZOS)
c.save('../_zoom3.png')
print(c.size)
