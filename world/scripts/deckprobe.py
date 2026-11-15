
import subprocess, time, sys
from PIL import Image
ADB = r"C:\Program Files\Netease\MuMu\nx_main\adb.exe"
S = "127.0.0.1:16416"
def sh(args):
    return subprocess.run([ADB, "-s", S] + args, capture_output=True, text=True, encoding="utf-8", errors="replace")
def shot(path):
    sh(["shell", "screencap", "-p", "/sdcard/probe.png"])
    sh(["pull", "/sdcard/probe.png", path])
    return Image.open(path).convert("RGB")
def red(img, cx, cy, r=18):
    n = 0
    for x in range(cx-r, cx+r):
        for y in range(cy-r, cy+r):
            p = img.getpixel((x,y))
            if p[0] > 150 and p[1] < 90 and p[2] < 90: n += 1
    return n
def tap(x,y):
    sh(["shell","input","tap",str(x),str(y)])
pts = [(x,699) for x in range(1100,1721,50)]
path = r"C:\Users\18539\DSH-Workspaces\coopanion\_probe.png"
for (x,y) in pts:
    tap(x,y); time.sleep(0.9)
    img = shot(path)
    n = red(img, 575, 175)
    print("probe", x, y, "red=", n, flush=True)
    if n > 200:
        tap(575,175); time.sleep(0.6)
