from PIL import Image
im = Image.open(r"./world/shots/eq4.png")
im.crop((640, 300, 860, 520)).resize((660, 660)).save(r"./world/shots/yj2.png")
im.crop((700, 470, 900, 660)).resize((600, 570)).save(r"./world/shots/lx2.png")
print("ok")
