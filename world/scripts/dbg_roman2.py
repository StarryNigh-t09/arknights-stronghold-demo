import sys
sys.path.insert(0, r"./world/sidecar")
import ocr
from PIL import Image
img = Image.open(r"./world/shots/l5.png").convert("RGB")
eng = ocr.Engine(); np = eng._np
xs = ocr.detect_shop_slots(eng, img, 2)
for i, x0 in enumerate(xs):
    box = (x0 - 45, 780, x0 + 45, 845)
    arr = np.asarray(img.crop(box).convert("L")).astype(int)
    dark = arr < 90
    cols = dark.sum(axis=0); rows = dark.sum(axis=1)
    if cols.max() < 8 or rows.max() < 8:
        print(i, "no badge"); continue
    cx = [k for k, v in enumerate(cols) if v >= rows.max()*0.4]
    ry = [k for k, v in enumerate(rows) if v >= cols.max()*0.4]
    sub = arr[ry[0]:ry[-1]+1, cx[0]:cx[-1]+1]
    white = (sub > 190).sum(axis=0) >= 3
    groups, prev = 0, False
    for v in white:
        if v and not prev: groups += 1
        prev = bool(v)
    print(i, "badge", (box[0]+cx[0], box[1]+ry[0], len(cx), len(ry)), "strokes", groups,
          "w", "".join("1" if v else "0" for v in white))
