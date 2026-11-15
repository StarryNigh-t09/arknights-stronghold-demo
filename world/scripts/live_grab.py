# -*- coding: utf-8 -*-
"""Grab one frame from a bilibili live room via playurl + ffmpeg."""
import requests, json, sys, subprocess, time, os

H = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://live.bilibili.com/",
}

def info(room_id):
    r = requests.get("https://api.live.bilibili.com/room/v1/Room/get_info",
                     params={"room_id": room_id}, headers=H, timeout=15)
    return r.json()

def best_stream(room_id):
    params = {"room_id": room_id, "protocol": "0,1", "format": "0,1,2",
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
                    cands.append({
                        "proto": s.get("protocol_name"), "fmt": f.get("format_name"),
                        "codec": c.get("codec_name"), "qn": c.get("current_qn"),
                        "url": u.get("host", "") + c.get("base_url", "") + u.get("extra", ""),
                    })
    return cands

if __name__ == "__main__":
    rid = int(sys.argv[1]) if len(sys.argv) > 1 else 3044248
    out = sys.argv[2] if len(sys.argv) > 2 else "shot.png"
    j = info(rid)
    d = j.get("data", {})
    print("title:", d.get("title"))
    print("live_status:", d.get("live_status"), "online:", d.get("online"), "live_time:", d.get("live_time"))
    c = best_stream(rid)
    print("candidates:", len(c))
    for x in c[:6]:
        print(" ", x["proto"], x["fmt"], x["codec"], x["qn"], x["url"][:110])
    pick = next((x for x in c if x["proto"] == "http_stream" and x["fmt"] == "flv" and x["codec"] == "avc"), c[0])
    print("pick:", pick["proto"], pick["fmt"], pick["url"][:110])
    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-headers", "Referer: https://live.bilibili.com/\r\nUser-Agent: " + H["User-Agent"] + "\r\n",
           "-i", pick["url"], "-frames:v", "1", "-q:v", "2", out]
    t0 = time.time()
    errf = out + ".ff.log"
    with open(errf, "wb") as ef:
        p = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=ef, timeout=90)
    print("ffmpeg rc:", p.returncode, "elapsed:", round(time.time() - t0, 1))
    try:
        print("stderr:", open(errf, "rb").read().decode("utf-8", "ignore")[:600])
    except Exception as e:
        print("log read fail", e)
    print("out exists:", os.path.exists(out), os.path.getsize(out) if os.path.exists(out) else 0)
    json.dump({"ts": int(time.time()), "info": j, "stream": pick}, open(out + ".json", "w"), ensure_ascii=False, indent=1)