# -*- coding: utf-8 -*-
import sys, os, time, requests, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from live_session import pick_url, H, room_info

print("live_status", room_info().get("live_status"))
url = pick_url()
print("url", url[:90])

def probe(tag, url, hdrs, secs=12):
    t0 = time.time(); n = 0; first = None
    try:
        with requests.get(url, headers={**H, **hdrs}, stream=True, timeout=(8, 12)) as r:
            if first is None: first = time.time() - t0
            for ch in r.iter_content(65536):
                n += len(ch)
                if time.time() - t0 > secs: break
        print(f"{tag:12s} ok {r.status_code} first={first:.2f}s bytes={n} ({n/max(0.01,time.time()-t0)/1024:.0f}KB/s)")
    except Exception as e:
        print(f"{tag:12s} FAIL {type(e).__name__} {str(e)[:100]} first={first} bytes={n}")

probe("norange", url, {})
probe("range", url, {"Range": "bytes=0-"})
probe("range-256k", url, {"Range": "bytes=0-262143"})
