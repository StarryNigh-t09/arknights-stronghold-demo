import sys, json
sys.path.insert(0, r"./world/sidecar")
import ocr
from PIL import Image
eng = ocr.Engine()
img = Image.open(r"./world/shots/wz_tactic2.png").convert("RGB")
rows = eng.run(img, (150, 330, 1780, 520), scale=3)
print("tactic titles:", json.dumps([(r["text"], [int(v) for v in r["box"]]) for r in rows if len(r["text"]) <= 8], ensure_ascii=False))
img2 = Image.open(r"./world/shots/wz-1794236860893.png").convert("RGB")
rows2 = eng.run(img2, (900, 700, 1700, 1000), scale=3)
print("deck:", json.dumps([(r["text"], [int(v) for v in r["box"]]) for r in rows2], ensure_ascii=False))
