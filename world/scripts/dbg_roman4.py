import sys, json
sys.path.insert(0, r"./world/sidecar")
import ocr
from PIL import Image
img = Image.open(r"./world/shots/l5.png").convert("RGB")
eng = ocr.Engine()
xs = ocr.detect_shop_slots(eng, img, 2)
for i, x0 in enumerate(xs):
    rows = eng.run(img, (x0 - 45, 765, x0 + 55, 850), scale=4)
    print(i, json.dumps([(r["text"], [int(v) for v in r["box"]], round(float(r.get("score",0)),2)) for r in rows], ensure_ascii=False))
