from PIL import Image
names = ["dk_fold", "eq1", "eq3", "eq4"]
ims = []
for n in names:
    im = Image.open(r"./world/shots/%s.png" % n)
    ims.append(im.crop((620, 290, 800, 360)).resize((720, 280)))
out = Image.new("RGB", (720, 280 * len(ims)))
for i, im in enumerate(ims):
    out.paste(im, (0, i * 280))
out.save(r"./world/shots/bars_cmp.png")
print("ok")
