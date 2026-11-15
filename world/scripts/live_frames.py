# -*- coding: utf-8 -*-
"""Extract frames from closed 70s segments -> world/shots/zc-<epoch>.png + frames.jsonl."""
import os, sys, json, time, subprocess, glob, re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "data", "live", os.environ.get("ZC_TAG", "zc-2026-11-10"))
SHOTS = os.path.join(BASE, "shots")
OFFSETS = [5.0, 40.0]

def log(*a):
    print(f"[{time.strftime('%H:%M:%S')}]", *a, flush=True)

def main():
    os.makedirs(SHOTS, exist_ok=True)
    done = set()
    mp = os.path.join(OUT, "frames.jsonl")
    if os.path.exists(mp):
        for line in open(mp, encoding="utf-8"):
            try:
                done.add(json.loads(line)["seg"])
            except Exception:
                pass
    while True:
        for d in sorted(glob.glob(os.path.join(OUT, "rec", "seg-*.flv.done"))):
            seg = d[:-5]
            name = os.path.basename(seg)
            if name in done:
                continue
            try:
                sj = json.load(open(seg + ".json", encoding="utf-8"))
            except Exception:
                sj = {}
            m = re.search(r"seg-(\d+)", name)
            t0 = sj.get("start") or (int(m.group(1)) if m else int(time.time()))
            dur = sj.get("dur") or 70
            for off in OFFSETS:
                if off + 1 >= dur:
                    continue
                ts = int(t0 + off)
                out = os.path.join(SHOTS, f"zc-{ts}.png")
                cmd = ["ffmpeg", "-y", "-loglevel", "error", "-ss", str(off), "-i", seg,
                       "-frames:v", "1", "-q:v", "2", out]
                with open(os.path.join(OUT, ".ff.log"), "ab") as ef:
                    p = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=ef)
                ok = p.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 50000
                rec = {"ts": ts, "seg": name, "off": off,
                       "file": os.path.basename(out) if ok else None, "ok": ok}
                with open(mp, "a", encoding="utf-8") as mf:
                    mf.write(json.dumps(rec) + "\n")
                if ok:
                    log("frame", os.path.basename(out), f"{os.path.getsize(out)//1024}KB")
            done.add(name)
        time.sleep(8)

if __name__ == "__main__":
    main()
