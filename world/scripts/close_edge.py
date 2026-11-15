import subprocess, os, time
env = dict(os.environ, PYTHONIOENCODING="utf-8")
cmd = ("Get-Process msedge -ErrorAction SilentlyContinue | "
       "Where-Object { $_.MainWindowHandle -ne 0 } | "
       "ForEach-Object { $_.CloseMainWindow() | Out-Null }")
r = subprocess.run(["powershell","-NoProfile","-Command", cmd], capture_output=True, env=env)
print("close sent", r.returncode)
time.sleep(4)
r2 = subprocess.run(["powershell","-NoProfile","-Command",
  "(Get-Process msedge -ErrorAction SilentlyContinue | Measure-Object).Count"], capture_output=True, env=env)
print("remaining", r2.stdout.decode("utf-8","replace").strip())
