from PIL import Image, ImageDraw
img = Image.open(r"./world/shots/wz-1794236285953.png").convert("RGB")
crop = img.crop((380, 720, 680, 1080))
crop = crop.resize((crop.width*2, crop.height*2), Image.LANCZOS)
d = ImageDraw.Draw(crop)
# mark current POINTS.upgrade (568,854) and candidate (495,1040)
for (x, y, c) in [(568, 854, (255,0,0)), (495, 1040, (0,255,0))]:
    cx = (x-380)*2; cy = (y-720)*2
    d.ellipse([cx-10, cy-10, cx+10, cy+10], outline=c, width=3)
crop.save(r"./world/shots/upgrade_panel.png")
print(crop.size)
