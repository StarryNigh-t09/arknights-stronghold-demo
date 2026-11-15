from PIL import Image
for name in ["dk_fold", "eq1", "eq3"]:
    im = Image.open(r"./world/shots/%s.png" % name)
    im.crop((700, 430, 980, 640)).resize((840, 630)).save(r"./world/shots/crop_%s.png" % name)
print("ok")
