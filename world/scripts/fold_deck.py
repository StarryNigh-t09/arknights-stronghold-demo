import subprocess, os
ADB = r"C:\\Program Files\\Netease\\MuMu\\nx_main\\adb.exe"
DEV = "127.0.0.1:16416"
env = dict(os.environ, MSYS2_ARG_CONV_EXCL="*", MSYS_NO_PATHCONV="1")
def sh(*a):
    return subprocess.run([ADB, "-s", DEV] + list(a), capture_output=True, text=True, env=env)
def shot(name):
    sh("shell", "screencap", "-p", "/sdcard/x.png")
    sh("pull", "/sdcard/x.png", os.path.join(r"./world", "shots", name))
    return os.path.join(r"./world", "shots", name)
sh("shell", "input", "tap", "1785", "1012")
import time; time.sleep(1.6)
p = shot("dk_fold.png")
print("saved", p)
