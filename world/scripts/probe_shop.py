import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sidecar"))
import ocr
from PIL import Image
img = Image.open(sys.argv[1]).convert("RGB")
eng = ocr.Engine()
for label, rect in [("name", (400, 890, 1810, 1000)), ("price", (400, 730, 1810, 810)), ("tier", (400, 790, 1810, 860))]:
    print("==", label)
    for r in eng.run(img, rect, scale=3):
        if r["text"]:
            print("  ", r["text"], [round(v, 1) for v in r["box"]], round(r["score"], 2))
