#!/usr/bin/env python3
"""
make_icons.py — PureFusion Feed toolbar icons

Chrome paints every extension icon at the same size inside a dark gray circle.
The gray circle is Chrome's button and cannot be enlarged. A dark disc blends
into it, so only the center glow shows. These icons are a near-white disc
that uses the whole slot, with a thick blue stroke on top.

Requires Pillow.
"""

import os

from PIL import Image, ImageDraw

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_ICONS_DIR = os.path.normpath(os.path.join(_SCRIPT_DIR, "..", "purefusion-feed", "icons"))

SIZES = (16, 32, 48, 128)


def _render(size):
    """Solid light disc. Chrome only gives the icon about half the gray button.

    A dark or detailed swirl turns into a speck in that slot. A near-white
    disc uses every pixel Chrome will actually draw, same as the other
    toolbar icons, with a thick blue stroke so it still reads as PureFusion.
    """
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((0, 0, size - 1, size - 1), fill=(244, 247, 255, 255))

    stroke = max(2, round(size * 0.22))
    margin = max(1, round(size * 0.14))
    box = [margin, margin, size - 1 - margin, size - 1 - margin]
    draw.arc(box, start=210, end=40, fill=(79, 70, 229, 255), width=stroke)

    inset = margin + round(stroke * 0.9)
    if size - 1 - inset > inset + 2:
        inner = [inset, inset, size - 1 - inset, size - 1 - inset]
        draw.arc(inner, start=20, end=200, fill=(34, 211, 238, 255), width=max(2, round(stroke * 0.75)))
    return image


def main():
    os.makedirs(_ICONS_DIR, exist_ok=True)

    for size in SIZES:
        # Draw large, then shrink, so the 16px icon stays solid instead of fuzzy.
        big = _render(size * 8)
        icon = big.resize((size, size), Image.Resampling.LANCZOS)
        out_path = os.path.join(_ICONS_DIR, f"icon{size}.png")
        icon.save(out_path, format="PNG")
        print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
