# -*- coding: utf-8 -*-
"""Continuous bilibili live recorder: python downloads FLV (ffmpeg TLS is blocked here),
writes rotating segments under data/live/<room>/rec/."""
import os, sys, json, time, requests, traceback

H = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://live.bilibili.com/",
}

ROOM = int(os.environ.get("ZC_ROOM", "3044248"))
SEG_SEC = int(os.environ.get("ZC_SEG", "70"))
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "data", "live", os.environ.get("ZC_TAG", "zc-2026-11-10"))

def log(*a):
    print(f"[{time.strftime('%H:%M:%S')}]", *a, flush=True)

def room_info():
    r = requests.get("https://api.live.bilibili.com/room/v1/Room/get_info",
                     params={"room_id": ROOM}, headers=H, timeout=15)
    return r.json().get("data", {})

def pick_url():
    params = {"room_id": ROOM, "protocol": "0,1", "format": "0,1,2",
              "codec": "0", "qn": 10000, "platform": "web", "ptype": 8,
              "dolby": 5, "panorama": 1}
    r = requests.get("https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo",
                     params=params, headers=H, timeout=20)
    j = r.json()
    cands = []
    for s in j["data"]["playurl_info"]["playurl"]["stream"]:
        for f in s.get("format", []):
            for c in f.get("codec", []):
                for u in c.get("url_info", []):
                    cands.append({"proto": s.get("protocol_name"), "fmt": f.get("format_name"),
                                  "codec": c.get("codec_name"),
                                  "url": u.get("host", "") + c.get("base_url", "") + u.get("extra", "")})
    flv = [x for x in cands if x["proto"] == "http_stream" and x["fmt"] == "flv" and x["codec"] == "avc"]
    return (flv or cands)[0]["url"]

def main():
    os.makedirs(os.path.join(OUT, "rec"), exist_ok=True)
    json.dump({"room": ROOM, "started": int(time.time())}, open(os.path.join(OUT, "session.json"), "w"))
    fails = 0
    while True:
        try:
            inf = room_info()
            if inf.get("live_status") != 1:
                log("offline, wait", inf.get("live_status"))
                time.sleep(30)
                continue
            url = pick_url()
            t0 = time.time()
            seg = os.path.join(OUT, "rec", f"seg-{int(t0)}.flv")
            with open(seg, "wb") as f:
                with requests.get(url, headers=H, stream=True, timeout=(15, 40)) as r:
                    r.raise_for_status()
                    log("rec start", os.path.basename(seg), r.status_code)
                    n = 0
                    for chunk in r.iter_content(65536):
                        if not chunk:
                            continue
                        f.write(chunk); n += len(chunk)
                        if time.time() - t0 > SEG_SEC:
                            break
                    f.flush()
            fails = 0
            json.dump({"seg": os.path.basename(seg), "start": int(t0), "end": int(time.time()),
                       "bytes": n, "dur": round(time.time() - t0, 1)},
                      open(seg + ".json", "w"))
            open(seg + ".done", "w").write("1")
            log("rec done", os.path.basename(seg), f"{n/1024/1024:.1f}MB", f"{time.time()-t0:.0f}s")
        except Exception as e:
            fails += 1
            log("ERR", type(e).__name__, str(e)[:120], "fails=", fails)
            time.sleep(min(3 * fails, 20))

if __name__ == "__main__":
    main()
