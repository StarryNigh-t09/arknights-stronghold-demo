# -*- coding: utf-8 -*-
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from live_grab import best_stream
c = best_stream(3044248)
for x in c:
    if x["proto"] == "http_stream" and x["fmt"] == "flv" and x["codec"] == "avc":
        print(x["url"])
        break
