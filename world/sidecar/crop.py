# crop.py — 把一张 1920x1080 截图裁成小块（给模型看、给 OCR/视觉少吃像素）
#
#   python crop.py in.png out.png 0 0 1920 200 [--scale 0.5]
#
# 输出 JSON：{"ok":true,"w":960,"h":100,"src":[0,0,1920,200],"scale":0.5}
# 用户 m02001（2026-11-11 15:1x）：截小图能少花 token，也省解析时间。
import json
import sys

from PIL import Image


def main(argv):
    if len(argv) < 7:
        print(json.dumps({"ok": False, "error": "用法: crop.py in out x0 y0 x1 y1 [--scale s]"}))
        return 2
    src, dst = argv[1], argv[2]
    x0, y0, x1, y1 = [int(round(float(v))) for v in argv[3:7]]
    scale = 1.0
    if "--scale" in argv:
        try:
            scale = float(argv[argv.index("--scale") + 1])
        except Exception:
            scale = 1.0
    try:
        img = Image.open(src).convert("RGB")
        W, H = img.size
        x0 = max(0, min(W - 1, x0)); y0 = max(0, min(H - 1, y0))
        x1 = max(x0 + 1, min(W, x1)); y1 = max(y0 + 1, min(H, y1))
        crop = img.crop((x0, y0, x1, y1))
        if scale != 1.0:
            crop = crop.resize((max(1, int(crop.width * scale)), max(1, int(crop.height * scale))), Image.LANCZOS)
        crop.save(dst, "PNG", optimize=True)
        print(json.dumps({"ok": True, "w": crop.width, "h": crop.height, "src": [x0, y0, x1, y1], "scale": scale}))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": "%s: %s" % (type(exc).__name__, exc)}))
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
