# -*- coding: utf-8 -*-
"""Single-process live session: record + extract frames + poll title.
Host note: only ONE bash sandbox slot exists, so this runs as the single background job.
CDN note: ffmpeg cannot reach bilivideo from this host (TLS reset); python requests can,
and only some of the playurl candidates answer -> try each until one streams."""
import os, sys, json, time, threading, subprocess, glob, re, traceback, requests

H = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://live.bilibili.com/",
}
ROOM = int(os.environ.get("ZC_ROOM", "3044248"))
SEG_SEC = int(os.environ.get("ZC_SEG", "70"))
TOTAL_MIN = int(os.environ.get("ZC_MINUTES", "65"))
OFFSETS = [5.0, 40.0]
KEEP_SEC = int(os.environ.get("ZC_KEEP", "1500"))

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAG = os.environ.get("ZC_TAG", "zc-2026-11-10")
OUT = os.path.join(BASE, "data", "live", TAG)
SHOTS = os.path.join(BASE, "shots")
os.makedirs(os.path.join(OUT, "rec"), exist_ok=True)
os.makedirs(SHOTS, exist_ok=True)
START = time.time(); STOP = START + TOTAL_MIN * 60

def log(*a):
    print(f"[{time.strftime('%H:%M:%S')}]", *a, flush=True)

def room_info():
    r = requests.get("https://api.live.bilibili.com/room/v1/Room/get_info",
                     params={"room_id": ROOM}, headers=H, timeout=15)
    return r.json().get("data", {})

def candidates():
    params = {"room_id": ROOM, "protocol": "0,1", "format": "0,1,2",
              "codec": "0", "qn": 10000, "platform": "web", "ptype": 8,
              "dolby": 5, "panorama": 1}
    r = requests.get("https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo",
                     params=params, headers=H, timeout=20)
    j = r.json()
    out = []
    for s in j["data"]["playurl_info"]["playurl"]["stream"]:
        for f in s.get("format", []):
            for c in f.get("codec", []):
                for u in c.get("url_info", []):
                    if s.get("protocol_name") == "http_stream" and f.get("format_name") == "flv" and c.get("codec_name") == "avc":
                        out.append(u.get("host", "") + c.get("base_url", "") + u.get("extra", ""))
    return out

def record_once():
    urls = candidates()
    for url in urls:
        t0 = time.time()
        seg = os.path.join(OUT, "rec", f"seg-{int(t0)}.flv")
        n = 0
        try:
            with requests.get(url, headers=H, stream=True, timeout=(6, 20)) as r:
                r.raise_for_status()
                it = r.iter_content(65536)
                with open(seg, "wb") as f:
                    for chunk in it:
                        if not chunk:
                            continue
                        f.write(chunk); n += len(chunk)
                        if time.time() - t0 > SEG_SEC:
                            break
                    f.flush()
            if n < 100000:
                log("seg too small", n, url.split("/")[2])
                try: os.remove(seg)
                except Exception: pass
                continue
            json.dump({"seg": os.path.basename(seg), "start": int(t0), "end": int(time.time()),
                       "bytes": n, "dur": round(time.time() - t0, 1), "host": url.split("/")[2]},
                      open(seg + ".json", "w"))
            open(seg + ".done", "w").write("1")
            log("seg", os.path.basename(seg), f"{n/1048576:.1f}MB", f"{time.time()-t0:.0f}s", url.split("/")[2])
            return True
        except Exception as e:
            log("host fail", url.split("/")[2], type(e).__name__, str(e)[:60])
            try:
                if n < 5000 and os.path.exists(seg): os.remove(seg)
            except Exception: pass
    return False

def recorder():
    fails = 0
    while time.time() < STOP:
        try:
            if room_info().get("live_status") != 1:
                log("offline"); time.sleep(20); continue
            if record_once():
                fails = 0
            else:
                fails += 1; log("all hosts failed", fails); time.sleep(min(5 * fails, 30))
        except Exception as e:
            fails += 1; log("REC ERR", type(e).__name__, str(e)[:80])
            time.sleep(min(5 * fails, 30))
    log("recorder stop")

def extractor():
    done = set()
    mp = os.path.join(OUT, "frames.jsonl")
    if os.path.exists(mp):
        for line in open(mp, encoding="utf-8"):
            try: done.add(json.loads(line)["seg"])
            except Exception: pass
    while time.time() < STOP + 180:
        try:
            for d in sorted(glob.glob(os.path.join(OUT, "rec", "seg-*.flv.done"))):
                seg = d[:-5]; name = os.path.basename(seg)
                if name in done: continue
                try: sj = json.load(open(seg + ".json", encoding="utf-8"))
                except Exception: sj = {}
                m = re.search(r"seg-(\d+)", name)
                t0 = sj.get("start") or (int(m.group(1)) if m else int(time.time()))
                dur = sj.get("dur") or 70
                for off in OFFSETS:
                    if off + 1 >= dur: continue
                    ts = int(t0 + off)
                    out = os.path.join(SHOTS, f"zc-{ts}.png")
                    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-ss", str(off), "-i", seg,
                           "-frames:v", "1", "-q:v", "2", out]
                    with open(os.path.join(OUT, ".ff.log"), "ab") as ef:
                        p = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=ef)
                    ok = p.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 50000
                    with open(mp, "a", encoding="utf-8") as mf:
                        mf.write(json.dumps({"ts": ts, "seg": name, "off": off,
                                             "file": os.path.basename(out) if ok else None,
                                             "ok": ok}) + "\n")
                    if not ok: log("frame FAIL", name, off)
                done.add(name)
            # cleanup old segments
            for d in glob.glob(os.path.join(OUT, "rec", "seg-*.flv")):
                try:
                    if time.time() - os.path.getmtime(d) > KEEP_SEC:
                        for suf in ["", ".json", ".done"]:
                            try: os.remove(d + suf)
                            except Exception: pass
                except Exception: pass
        except Exception:
            log("EXT ERR", traceback.format_exc()[-300:])
        time.sleep(6)
    log("extractor stop")

def titler():
    last = None
    while time.time() < STOP + 60:
        try:
            d = room_info()
            rec = {"ts": int(time.time()), "live_status": d.get("live_status"),
                   "title": d.get("title"), "online": d.get("online"),
                   "area": d.get("area_name"), "live_time": d.get("live_time")}
            if (rec["title"], rec["live_status"]) != last:
                with open(os.path.join(OUT, "title.jsonl"), "a", encoding="utf-8") as f:
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                log("title", rec["title"], rec["online"])
                last = (rec["title"], rec["live_status"])
        except Exception as e:
            log("TITLE ERR", str(e)[:80])
        time.sleep(60)

if __name__ == "__main__":
    json.dump({"room": ROOM, "started": int(START), "minutes": TOTAL_MIN},
              open(os.path.join(OUT, "session.json"), "w"))
    log("session start", TAG, "for", TOTAL_MIN, "min")
    ts = [threading.Thread(target=recorder, name="rec"),
          threading.Thread(target=extractor, name="ext"),
          threading.Thread(target=titler, name="title")]
    for t in ts: t.start()
    for t in ts: t.join()
    log("session end")
