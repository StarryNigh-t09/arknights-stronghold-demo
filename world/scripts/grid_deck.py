from PIL import Image, ImageDraw
im = Image.open(r"./world/shots/dk.png").convert("RGB")
c = im.crop((850, 640, 1750, 1050)).resize((1800, 820))
d = ImageDraw.Draw(c)
for x in range(0, 900, 25):
    col = (0,255,0) if x % 100 == 0 else (0,120,0)
    d.line([(x*2,0),(x*2,820)], fill=col, width=1)
    if x % 50 == 0:
        d.text((x*2+2, 2), str(850+x), fill=(255,255,0))
for y in range(0, 410, 25):
    col = (0,255,0) if y % 100 == 0 else (0,120,0)
    d.line([(0,y*2),(1800,y*2)], fill=col, width=1)
    if y % 50 == 0:
        d.text((2, y*2+1), str(640+y), fill=(255,255,0))
c.save(r"./world/shots/dk_grid.png")
print("saved", c.size)
