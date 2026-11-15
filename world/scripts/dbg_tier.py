import sys, json
sys.path.insert(0, r"./world/sidecar")
import ocr
from PIL import Image
img = Image.open(r"./world/shots/l5.png").convert("RGB")
eng = ocr.Engine()
xs = ocr.detect_shop_slots(eng, img, 2)
print("slots", xs)
for i, x0 in enumerate(xs):
    box = (x0 - 40, 750, x0 + 250, 850)
    rows = eng.run(img, box, scale=4)
    got = [(r["text"], [int(v) for v in r["box"]], round(r.get("score", 0), 2)) for r in rows]
    print(i, x0, json.dumps(got, ensure_ascii=False))
