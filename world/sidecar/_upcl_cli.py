import sys, json
sys.path.insert(0, sys.argv[1])
import ocr
from PIL import Image
eng = ocr.Engine()
out = {}
for p in sys.argv[2:]:
    img = Image.open(p).convert("RGB")
    if img.width != ocr.BASE_W:
        img = img.resize((ocr.BASE_W, ocr.BASE_H), Image.LANCZOS)
    try:
        pt = ocr.read_upgrade_point(eng, img)
    except Exception as e:
        pt = {"err": repr(e)[:120]}
    out[p.replace("\\", "/").split("/")[-1]] = pt
print(json.dumps(out, ensure_ascii=False))