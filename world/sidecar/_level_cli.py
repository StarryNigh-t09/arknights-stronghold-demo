"""read_shop_level 的批量调试入口（给 test/level-read.test.mjs 用）。

用法：python _level_cli.py <sidecar 目录> <帧1.png> [帧2.png ...]
输出：{"roman": {原文: 解析结果}, "frames": {文件名: 界面等级或 null}}
"""
import sys
import json

sys.path.insert(0, sys.argv[1])
import ocr
from PIL import Image

eng = ocr.Engine()
out = {"roman": {}, "frames": {}}

# 罗马数字解析：框里可能是 "Ⅲ" 三竖、"|V"、"lV"、"_"（Ⅰ 被读成下划线）、"Fiv"（char 模型的脏读数）、"LEVEL IV"
for t in ["I", "II", "III", "IV", "V", "VI", "LEVEL IV", "|V", "lV", "_", "_._", "Fiv", "ZZ"]:
    out["roman"][t] = ocr._roman_to_int(t)

for p in sys.argv[2:]:
    img = Image.open(p).convert("RGB")
    out["frames"][p.replace("\\", "/").split("/")[-1]] = ocr.read_shop_level(eng, img)

print(json.dumps(out, ensure_ascii=False))
