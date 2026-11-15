from PIL import Image
img = Image.open(r"./world/shots/l5.png").convert("RGB")
crop = img.crop((420, 750, 1660, 860)).resize((1240*2, 110*2), Image.LANCZOS)
crop.save(r"./world/shots/tier_strip.png")
print(crop.size)
