# -*- coding: utf-8 -*-
"""Probe a bilibili live room: status, title, playurl qualities."""
import requests, json, sys

H = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://live.bilibili.com/",
    "Origin": "https://live.bilibili.com",
}

def info(room_id):
    r = requests.get("https://api.live.bilibili.com/room/v1/Room/get_info",
                     params={"room_id": room_id}, headers=H, timeout=15)
    d = r.json()
    if d.get("code") != 0:
        return {"error": d}
    d = d["data"]
    keys = ["room_id", "short_id", "uid", "live_status", "live_time", "title",
            "area_name", "parent_area_name", "online", "attention"]
    return {k: d.get(k) for k in keys}

def playinfo(room_id, qn=10000):
    params = {"room_id": room_id, "protocol": "0,1", "format": "0,1,2",
              "codec": "0,1", "qn": qn, "platform": "web", "ptype": 8,
              "dolby": 5, "panorama": 1}
    r = requests.get("https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo",
                     params=params, headers=H, timeout=20)
    return r.json()

if __name__ == "__main__":
    rid = int(sys.argv[1]) if len(sys.argv) > 1 else 3044248
    j = info(rid)
    print(json.dumps(j, ensure_ascii=False, indent=1))
    p = playinfo(rid)
    print("playinfo code:", p.get("code"), p.get("message"))
    if p.get("code") == 0:
        pd = p["data"]
        print("live_status:", pd.get("live_status"))
        out = []
        for s in pd.get("playurl_info", {}).get("playurl", {}).get("stream", []) or []:
            for f in s.get("format", []):
                for c in f.get("codec", []):
                    out.append({
                        "protocol": s.get("protocol_name"),
                        "format": f.get("format_name"),
                        "codec": c.get("codec_name"),
                        "qn": c.get("current_qn"),
                        "accept_qn": c.get("accept_qn"),
                        "url": c.get("url_info", [{}])[0].get("host", "") + c.get("base_url", ""),
                        "hosts": [u.get("host") for u in c.get("url_info", [])],
                    })
        print(json.dumps(out, ensure_ascii=False, indent=1))
