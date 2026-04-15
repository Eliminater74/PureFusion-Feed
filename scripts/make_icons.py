#!/usr/bin/env python3
"""
make_icons.py — PureFusion Feed Icon Generator

Generates placeholder icons (purple background, "PF" text) at all required
Chrome extension sizes: 16, 32, 48, 128.

Requires Pillow:  pip install pillow

Run from any directory — output path is resolved relative to this script.
"""

import os
from PIL import Image, ImageDraw, ImageFont

# Resolve output directory relative to this script's location
# Structure: Extension/scripts/make_icons.py → Extension/purefusion-feed/icons/
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_ICONS_DIR  = os.path.normpath(os.path.join(_SCRIPT_DIR, "..", "purefusion-feed", "icons"))

os.makedirs(_ICONS_DIR, exist_ok=True)

sizes = [16, 32, 48, 128]

for size in sizes:
    # Purple background (#6C3FC5)
    img = Image.new("RGB", (size, size), color=(108, 63, 197))
    d   = ImageDraw.Draw(img)

    font_size = int(size * 0.6)
    try:
        fnt = ImageFont.truetype("arial.ttf", font_size)
    except IOError:
        fnt = ImageFont.load_default()

    text = "PF"

    try:
        bbox        = d.textbbox((0, 0), text, font=fnt)
        text_width  = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
    except AttributeError:
        # Fallback for older Pillow versions
        text_width, text_height = d.textsize(text, font=fnt)

    x = (size - text_width)  / 2
    y = (size - text_height) / 2 - (size * 0.1)

    # Cyan text (#00D4FF)
    d.text((x, y), text, font=fnt, fill=(0, 212, 255))

    out_path = os.path.join(_ICONS_DIR, f"icon{size}.png")
    img.save(out_path)
    print(f"Generated {out_path}")
