import subprocess, os, time
env = dict(os.environ, PYTHONIOENCODING="utf-8")
def run(c):
    return subprocess.run(["powershell","-NoProfile","-Command", c], capture_output=True, env=env).stdout.decode("utf-8","replace").strip()
print("before", run("(Get-Process msedge -ErrorAction SilentlyContinue | Measure-Object).Count"))
run("Stop-Process -Name msedge -Force -ErrorAction SilentlyContinue")
for i in range(10):
    time.sleep(1)
    n = run("(Get-Process msedge -ErrorAction SilentlyContinue | Measure-Object).Count")
    if n == "0":
        break
print("after", n)
