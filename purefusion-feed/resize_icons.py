import os
from PIL import Image

src_image = r"C:\Users\elimi\.gemini\antigravity\brain\7ef4d24f-409a-4226-8c23-686e869e9c20\purefusion_icon_1775598353904.png"
out_dir = r"i:\GITHUB\Projects\Chrome\Extension\purefusion-feed\icons"

if not os.path.exists(src_image):
    print("Source image not found.")
    exit(1)

with Image.open(src_image) as img:
    # Chrome requires square icons
    # Resize with high quality antialiasing
    sizes = [16, 32, 48, 128]
    for size in sizes:
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        out_path = os.path.join(out_dir, f"icon{size}.png")
        resized.save(out_path, format="PNG")
        print(f"Generated {out_path}")
