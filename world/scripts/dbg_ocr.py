import sys
sys.path.insert(0,'sidecar')
import ocr
from PIL import Image
eng=ocr.Engine()
for p in ('shots/live18.png','shots/live19.png','shots/wz_rest_r1.png','shots/live17.png'):
    im=Image.open(p)
    a=eng.run(im,(200,850,660,1050),scale=3)
    print(p)
    for r in a: print('   ',repr(r['text']),[int(v) for v in r['box']])
