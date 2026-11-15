import sys, json
sys.path.insert(0, r"./world/sidecar")
import ocr
from PIL import Image
img = Image.open(r"./world/shots/l5.png").convert("RGB")
eng = ocr.Engine(); np = eng._np
xs = ocr.detect_shop_slots(eng, img, 2)
for i, x0 in enumerate(xs):
    rows = eng.run(img, (x0 - 45, 765, x0 + 55, 850), scale=4)
    if not rows: print(i, "none"); continue
    b = rows[0]["box"]
    box = (int(b[0])-1, int(b[1])-1, int(b[0]+b[2])+1, int(b[1]+b[3])+1)
    arr = np.asarray(img.crop(box).convert("L")).astype(int)
    for th in (150, 185):
        white = (arr > th).sum(axis=0) >= 3
        groups, prev = 0, False
        for v in white:
            if v and not prev: groups += 1
            prev = bool(v)
        print(i, rows[0]["text"], box, "th", th, "strokes", groups,
              "".join("1" if v else "0" for v in white))
    print("-")
