import subprocess, os, time
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
for pt in [(712, 430), (712, 455)]:
    sh("shell", "input", "tap", str(pt[0]), str(pt[1]))
    time.sleep(1.4)
    print(pt, shot("tap_%d_%d.png" % pt))
    break
