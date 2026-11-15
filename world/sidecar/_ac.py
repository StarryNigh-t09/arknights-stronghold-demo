import sys
from PIL import Image
import numpy as np
a = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(float)
lum = a.mean(axis=2)
for y in (450, 560, 340):
    row = lum[y]
    seg = row[400:1500]
    f = np.abs(np.fft.rfft(seg - seg.mean()))
    freqs = np.fft.rfftfreq(len(seg))
    order = np.argsort(f)[::-1][:6]
    print('y', y, [(round(float(1/freqs[i]),1), round(float(f[i]),0)) for i in order if freqs[i] > 0])
