from PIL import Image
im = Image.open(r"./world/shots/dk.png")
im.resize((1280,720)).save(r"./world/shots/dk_small.png")
print("ok")
