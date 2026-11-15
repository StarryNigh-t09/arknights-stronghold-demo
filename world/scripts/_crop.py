import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src)
# 干员详情面板在左侧：名字、职业、范围、生命，一块 0..430 x 60..340
im.crop((0, 60, 440, 340)).resize((880, 560), Image.LANCZOS).save(dst)
print('ok')
