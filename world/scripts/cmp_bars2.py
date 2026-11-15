from PIL import Image
names = ["dk_fold", "eq1", "eq3", "eq4"]
ims = []
for n in names:
    im = Image.open(r"./world/shots/%s.png" % n)
    ims.append(im.crop((640, 340, 820, 420)).resize((720, 320)))
out = Image.new("RGB", (720, 320 * len(ims)))
for i, im in enumerate(ims):
    out.paste(im, (0, i * 320))
out.save(r"./world/shots/bars2.png")
print("ok")
