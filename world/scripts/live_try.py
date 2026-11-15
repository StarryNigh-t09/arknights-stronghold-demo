# -*- coding: utf-8 -*-
import requests, json, time, urllib.parse, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from live_grab import info, best_stream, H

rid = 3044248
c = best_stream(rid)
flv = [x for x in c if x["proto"] == "http_stream" and x["fmt"] == "flv" and x["codec"] == "avc"]
hls = [x for x in c if x["proto"] == "http_hls"]
targets = []
for x in flv + hls:
    targets.append(("orig", x["url"]))
    u = urllib.parse.urlsplit(x["url"])
    for host in ["https://upos-sz-mirrorcos.bilivideo.com", "https://upos-hz-mirrorakam.akamaized.net"]:
        targets.append((host, host + u.path + ("?" + u.query if u.query else "")))

for name, url in targets:
    t0 = time.time()
    try:
        r = requests.get(url, headers={**H, "Range": "bytes=0-262143"}, timeout=12, stream=True)
        n = 0
        for chunk in r.iter_content(65536):
            n += len(chunk)
            if n > 262144:
                break
        print(f"{name:34s} {r.status_code} {n:7d}B {time.time()-t0:5.1f}s  {url.split('?')[0][-50:]}")
    except Exception as e:
        print(f"{name:34s} FAIL {type(e).__name__} {str(e)[:60]} {time.time()-t0:5.1f}s")
