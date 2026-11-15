from PIL import Image, ImageDraw
img = Image.open(r"./world/shots/wz-1794236285953.png").convert("RGB")
box = (230, 700, 500, 1080)
crop = img.crop(box).resize(((box[2]-box[0])*2, (box[3]-box[1])*2), Image.LANCZOS)
d = ImageDraw.Draw(crop)
for (x, y, c) in [(568, 854, (255,0,0)), (360, 1010, (0,255,0))]:
    cx = (x-box[0])*2; cy = (y-box[1])*2
    d.ellipse([cx-10, cy-10, cx+10, cy+10], outline=c, width=3)
crop.save(r"./world/shots/upgrade_panel2.png")
print(crop.size)
