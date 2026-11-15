import subprocess, os, time, sys
ADB = r"C:\\Program Files\\Netease\\MuMu\\nx_main\\adb.exe"
DEV = "127.0.0.1:16416"
ROOT = r"./world"
def sh(*a):
    return subprocess.run([ADB, "-s", DEV] + list(a), capture_output=True, text=True)
def shot(name):
    sh("shell", "screencap", "-p", "/sdcard/x.png")
    p = os.path.join(ROOT, "shots", name)
    sh("pull", "/sdcard/x.png", p)
    from PIL import Image
    Image.open(p).resize((1280, 720)).save(p.replace(".png", "_s.png"))
    return p
sh("shell", "input", "tap", "712", "398")
time.sleep(1.5)
print(shot("yj_detail.png"))
