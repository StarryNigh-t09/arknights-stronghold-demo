from PIL import Image
a = Image.open(r"./world/shots/dk_fold.png")
b = Image.open(r"./world/shots/eq4.png")
a.crop((650, 330, 820, 500)).resize((510, 510)).save(r"./world/shots/yj_before.png")
b.crop((650, 330, 820, 500)).resize((510, 510)).save(r"./world/shots/yj_after.png")
print("ok")
