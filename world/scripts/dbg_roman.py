import sys
sys.path.insert(0, r"./world/sidecar")
import ocr
from PIL import Image
img = Image.open(r"./world/shots/l5.png").convert("RGB")
eng = ocr.Engine()
np = eng._np
xs = ocr.detect_shop_slots(eng, img, 2)
for i, x0 in enumerate(xs):
    for box in [(x0-20, 795, x0+30, 832), (x0-10, 800, x0+20, 828)]:
        arr = np.asarray(img.crop(box).convert("L")).astype(int)
        for th in (140, 170, 200):
            on = (arr > th).sum(axis=0) >= 3
            groups, prev = 0, False
            for v in on:
                if v and not prev: groups += 1
                prev = bool(v)
            print(i, box, th, "groups", groups, "on", "".join("1" if v else "0" for v in on))
    print("-")
