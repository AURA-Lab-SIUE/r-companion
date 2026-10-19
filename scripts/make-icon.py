# Builds assets/icon.png (128x128) from shapes and text with Pillow: a bold "R" with a check mark.
# No SIUE marks or colors and no generated image. Run: python scripts/make-icon.py
# Not shipped yet (SIUE brand policy question q-20261019-0001). To ship it: add "icon": "assets/icon.png"
# to package.json and the line !assets/icon.png to .vscodeignore.
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SIZE, SCALE = 128, 4  # draw at 4x, then downsample for smooth edges
S = SIZE * SCALE
BG, FG, CHECK = (38, 50, 56), (255, 255, 255), (129, 199, 132)
FONT = Path("C:/Windows/Fonts/DejaVuSans-Bold.ttf")  # DejaVu fonts: free license

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=22 * SCALE, fill=BG)
font = ImageFont.truetype(str(FONT), 80 * SCALE)
d.text((S * 0.37, S * 0.44), "R", font=font, fill=FG, anchor="mm")
# Check mark in the lower right
w = 11 * SCALE
d.line([(S * 0.66, S * 0.77), (S * 0.75, S * 0.86), (S * 0.90, S * 0.65)], fill=CHECK, width=w, joint="curve")
for x, y in [(S * 0.66, S * 0.77), (S * 0.90, S * 0.65)]:
    d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=CHECK)

out = Path(__file__).resolve().parent.parent / "assets" / "icon.png"
img.resize((SIZE, SIZE), Image.Resampling.LANCZOS).save(out)
print(out)
