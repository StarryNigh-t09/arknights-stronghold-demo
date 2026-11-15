import sys, json
sys.path.insert(0, r"./world/sidecar")
import ocr
from PIL import Image
img = Image.open(r"./world/shots/wz-1794236285953.png").convert("RGB")
eng = ocr.Engine()
rows = eng.run(img, (380, 720, 660, 1070), scale=3)
print(json.dumps([(r["text"], [int(v) for v in r["box"]], round(float(r.get("score",0)),2)) for r in rows], ensure_ascii=False))
