from PIL import Image
im = Image.open(r"./world/shots/tap_712_430.png")
im.crop((560, 280, 940, 520)).save(r"./world/shots/raw_unit.png")
print(im.size)
