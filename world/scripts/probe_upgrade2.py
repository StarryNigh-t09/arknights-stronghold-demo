import sys, json
sys.path.insert(0, r"./world/sidecar")
import ocr
from PIL import Image
img = Image.open(r"./world/shots/wz-1794236285953.png").convert("RGB")
eng = ocr.Engine()
for box in [(410, 990, 620, 1078), (430, 1000, 580, 1075), (380, 940, 660, 1078)]:
    for sc in (4, 6):
        rows = eng.run(img, box, scale=sc)
        print(box, sc, json.dumps([(r["text"], [int(v) for v in r["box"]], round(float(r.get("score",0)),2)) for r in rows], ensure_ascii=False))
