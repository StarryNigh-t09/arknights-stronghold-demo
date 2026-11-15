# -*- coding: utf-8 -*-
import sys, os, time, requests, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import live_session as S

params = {"room_id": 3044248, "protocol": "0,1", "format": "0,1,2",
          "codec": "0", "qn": 10000, "platform": "web", "ptype": 8,
          "dolby": 5, "panorama": 1}
r = requests.get("https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo",
                 params=params, headers=S.H, timeout=20)
j = r.json()
cands = []
for s in j["data"]["playurl_info"]["playurl"]["stream"]:
    for f in s.get("format", []):
        for c in f.get("codec", []):
            for u in c.get("url_info", []):
                cands.append((s.get("protocol_name"), f.get("format_name"), c.get("codec_name"),
                              u.get("host", "") + c.get("base_url", "") + u.get("extra", "")))

print("cands", len(cands))
for proto, fmt, codec, url in cands:
    t0 = time.time(); n = 0
    try:
        with requests.get(url, headers={**S.H, "Range": "bytes=0-65535"}, stream=True, timeout=(6, 8)) as rr:
            for ch in rr.iter_content(16384):
                n += len(ch)
                if time.time() - t0 > 6: break
        print(f"{proto:11s} {fmt:5s} {codec:4s} {rr.status_code} {n:7d}B {time.time()-t0:4.1f}s {url.split('?')[0][-40:]}")
    except Exception as e:
        print(f"{proto:11s} {fmt:5s} {codec:4s} FAIL {type(e).__name__:16s} {str(e)[:60]}")
