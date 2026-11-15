import subprocess, os, sys, time
ADB = r"C:\\Program Files\\Netease\\MuMu\\nx_main\\adb.exe"
DEV = "127.0.0.1:16416"
ROOT = r"./world"
def sh(*a):
    return subprocess.run([ADB, "-s", DEV] + list(a), capture_output=True, text=True)
def shot(name, small=True):
    sh("shell", "screencap", "-p", "/sdcard/x.png")
    p = os.path.join(ROOT, "shots", name)
    sh("pull", "/sdcard/x.png", p)
    if small:
        from PIL import Image
        Image.open(p).resize((1280, 720)).save(p.replace(".png", "_s.png"))
    return p
if __name__ == "__main__":
    print(shot(sys.argv[1] if len(sys.argv) > 1 else "cur.png"))
