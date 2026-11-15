from PIL import Image, ImageDraw
base = r"./world/shots/"
names = ["dk_fold", "eq1", "eq3", "eq4"]
box = (655, 340, 800, 385)
tiles = []
for n in names:
    im = Image.open(base + n + ".png")
    c = im.crop(box).resize((870, 270), Image.NEAREST)
    d = ImageDraw.Draw(c)
    d.text((4, 4), n, fill=(255, 0, 0))
    tiles.append(c)
out = Image.new("RGB", (870, 270 * len(tiles)), (0, 0, 0))
for i, t in enumerate(tiles):
    out.paste(t, (0, i * 270))
out.save(base + "bars3.png")
print("ok", box)
