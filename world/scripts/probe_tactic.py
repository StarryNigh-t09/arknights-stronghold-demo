import sys, json
sys.path.insert(0, r"./world/sidecar")
import ocr
from PIL import Image
img = Image.open(r"./world/shots/wz-1794236838040.png").convert("RGB")
eng = ocr.Engine()
for box in [(200, 570, 800, 820), (150, 250, 700, 800)]:
    rows = eng.run(img, box, scale=3)
    print(box, json.dumps([(r["text"], [int(v) for v in r["box"]]) for r in rows], ensure_ascii=False))
