import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sidecar"))
import ocr
from PIL import Image

src = sys.argv[1]
eng = ocr.Engine()
img = Image.open(src).convert("RGB")
for rect in [(1500, 900, 1920, 1080), (0, 700, 1920, 1080)]:
    items = eng.run(img, rect, scale=2)
    print(rect, json.dumps(items, ensure_ascii=False))
