import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sidecar"))
import ocr
from PIL import Image
img = Image.open(sys.argv[1]).convert("RGB")
eng = ocr.Engine()
print("== names (y 1000..1065)")
for r in eng.run(img, (390, 1000, 1810, 1065), scale=3):
    if r["text"]:
        print("  ", repr(r["text"]), [round(v, 1) for v in r["box"]], round(r["score"], 2))
print("== badges row (y 755..825) raw texts")
for r in eng.run(img, (390, 755, 1810, 825), scale=4):
    if r["text"]:
        print("  ", repr(r["text"]), [round(v, 1) for v in r["box"]], round(r["score"], 2))
