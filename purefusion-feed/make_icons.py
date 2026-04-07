import os
from PIL import Image, ImageDraw, ImageFont

# Ensure directory exists
os.makedirs("i:/GITHUB/Projects/Chrome/Extension/purefusion-feed/icons", exist_ok=True)

sizes = [16, 32, 48, 128]

for size in sizes:
    # Create image with PureFusion Purple background #6C3FC5
    img = Image.new('RGB', (size, size), color=(108, 63, 197))
    d = ImageDraw.Draw(img)
    
    # Very basic text drawing
    # Calculate scale roughly
    font_size = int(size * 0.6)
    try:
        # Try to load a generic default font
        fnt = ImageFont.truetype("arial.ttf", font_size)
    except IOError:
        fnt = ImageFont.load_default()
        
    text = "PF"
    
    # Modern approach to get text size
    try:
        bbox = d.textbbox((0, 0), text, font=fnt)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
    except AttributeError:
        # Fallback for older PIL versions
        text_width, text_height = d.textsize(text, font=fnt)

    x = (size - text_width) / 2
    y = ((size - text_height) / 2) - (size * 0.1) # slight nudge up

    # Draw cyan text #00D4FF
    d.text((x, y), text, font=fnt, fill=(0, 212, 255))
    
    # Save
    imgPath = f"i:/GITHUB/Projects/Chrome/Extension/purefusion-feed/icons/icon{size}.png"
    img.save(imgPath)
    print(f"Generated {imgPath}")
