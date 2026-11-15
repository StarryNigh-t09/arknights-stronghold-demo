import sys, json
sys.path.insert(0, sys.argv[1])
import ocr
from PIL import Image
eng = ocr.Engine()
out = {}
for p in sys.argv[2:]:
    img = Image.open(p).convert("RGB")
    out[p.replace("\\", "/").split("/")[-1]] = ocr.read_slots_left(eng, img)
print(json.dumps(out, ensure_ascii=False))
