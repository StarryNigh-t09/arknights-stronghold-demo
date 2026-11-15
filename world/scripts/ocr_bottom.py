import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sidecar"))
import ocr
from PIL import Image
src = sys.argv[1]
eng = ocr.Engine()
img = Image.open(src).convert("RGB")
items = eng.run(img, (0, 690, 1920, 1080), scale=2)
print(" | ".join(i["text"] for i in items if i["text"]))
