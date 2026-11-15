from PIL import Image, ImageDraw
names = ["dk_fold", "eq1", "eq4"]
box = (560, 280, 940, 520)
tiles = []
for n in names:
    im = Image.open(r"./world/shots/%s.png" % n).crop(box)
    d = ImageDraw.Draw(im)
    d.text((4, 4), n, fill=(255, 0, 0))
    tiles.append(im)
out = Image.new("RGB", (380, 240 * len(tiles)))
for i, t in enumerate(tiles):
    out.paste(t, (0, i * 240))
out.save(r"./world/shots/eqbars.png")
print("ok")
