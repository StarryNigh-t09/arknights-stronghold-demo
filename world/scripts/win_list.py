import subprocess, os
env = dict(os.environ, PYTHONIOENCODING="utf-8")
r = subprocess.run(["powershell","-NoProfile","-Command",
  "Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object { $_.ProcessName + ' | ' + $_.MainWindowTitle }"],
  capture_output=True, env=env)
out = r.stdout.decode("utf-8", "replace")
print(out[:1500])
