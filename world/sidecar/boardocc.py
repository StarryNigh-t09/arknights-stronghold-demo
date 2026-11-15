# boardocc.py — 被动读棋盘：哪些可部署格此刻站着干员。
# 用法: python boardocc.py <map.json> <frame.png> <out.json>
# 每格取半边长 34 的方块，算颜色标准差(sd)与暗像素比(dark)。
# 2026-11-14 标定（trace-night-13T16-04-09/step-011.png）：站人 sd 88~138 / dark 0.2~0.6；
# 空格 sd 19.7~43 / dark 0.000~0.104。判据 sd>60 and dark>0.12。
import json, sys
from PIL import Image

def main():
    map_path, frame, out = sys.argv[1], sys.argv[2], sys.argv[3]
    m = json.load(open(map_path, encoding='utf-8'))
    img = Image.open(frame).convert('RGB')
    W, H = img.size
    cells = [c for c in (m.get('cells') or []) if c.get('deploy') and c.get('px')]
    tiles = []
    detail = []
    half = 34
    for c in cells:
        x, y = int(c['px'][0]), int(c['px'][1])
        box = (max(0, x - half), max(0, y - half), min(W, x + half), min(H, y + half))
        patch = list(img.crop(box).getdata())
        n = len(patch) or 1
        mr = sum(p[0] for p in patch) / n
        mg = sum(p[1] for p in patch) / n
        mb = sum(p[2] for p in patch) / n
        var = sum((p[0] - mr) ** 2 + (p[1] - mg) ** 2 + (p[2] - mb) ** 2 for p in patch) / n
        sd = var ** 0.5
        dark = sum(1 for p in patch if (p[0] + p[1] + p[2]) / 3 < 95) / n
        occ = sd > 60 and dark > 0.12
        detail.append({'col': c.get('col'), 'row': c.get('row'), 'x': x, 'y': y,
                       'sd': round(sd, 1), 'dark': round(dark, 3), 'occ': occ})
        if occ:
            tiles.append({'col': c.get('col'), 'row': c.get('row'), 'x': x, 'y': y})
    json.dump({'ok': True, 'count': len(tiles), 'tiles': tiles, 'detail': detail,
               'frame': frame}, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
    print('occupied %d/%d' % (len(tiles), len(cells)))

if __name__ == '__main__':
    main()
