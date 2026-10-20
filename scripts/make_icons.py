#!/usr/bin/env python3
"""
make_icons.py — PureFusion Feed toolbar icons

Rebuilds icons/icon16.png, icon32.png, icon48.png, and icon128.png from the
original swirl artwork so the mark fills the Chrome toolbar button.

The old tiles were a near-black rounded square with a small glow in the
middle. On a dark toolbar only a few pixels of that glow showed, so the
button looked empty next to other extensions.

Requires Pillow.
"""

import math
import os

from PIL import Image, ImageEnhance, ImageFilter

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_ICONS_DIR = os.path.normpath(os.path.join(_SCRIPT_DIR, "..", "purefusion-feed", "icons"))
_SOURCE = os.path.normpath(os.path.join(_SCRIPT_DIR, "assets", "mark-source.png"))

SIZES = (16, 32, 48, 128)
MASTER = 512


def _ensure_source():
    """The original swirl lives beside this script so reruns do not restack the effect."""
    if os.path.exists(_SOURCE):
        return
    raise SystemExit(f"No source artwork at {_SOURCE}")


def _knock_out(image):
    """Drop the black tile and keep the luminous swirl, brighter."""
    image = image.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            red, green, blue, _alpha = pixels[x, y]
            lum = max(red, green, blue)
            if lum < 26:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            strength = min(1.0, (lum - 26) / 70.0)
            alpha = int(min(255, 40 + strength * 255))
            pixels[x, y] = (
                min(255, int(red * 1.35 + 8)),
                min(255, int(green * 1.2 + 4)),
                min(255, int(blue * 1.28 + 10)),
                alpha,
            )
    return image


def _disc(size):
    """Solid circular badge. Transparent corners, so Chrome's round button is filled."""
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pixels = image.load()
    center = (size - 1) / 2.0
    radius = size / 2.0 - 0.35
    for y in range(size):
        for x in range(size):
            distance = math.hypot(x - center, y - center)
            if distance > radius:
                continue
            t = distance / radius
            # Indigo center, brighter violet rim so the edge reads on a dark toolbar.
            red = int(36 + t * 78)
            green = int(18 + t * 28)
            blue = int(92 + t * 120)
            if t > 0.86:
                edge = (t - 0.86) / 0.14
                red = int(red * (1 - edge) + 120 * edge)
                green = int(green * (1 - edge) + 210 * edge)
                blue = int(blue * (1 - edge) + 255 * edge)
            pixels[x, y] = (red, green, blue, 255)
    return image


def _build_master():
    source = Image.open(_SOURCE).convert("RGBA")
    # The faint horizontal streaks pad the artwork. Crop the square body of the swirl.
    side = int(source.width * 0.62)
    left = (source.width - side) // 2
    top = int(source.height * 0.16)
    mark = _knock_out(source.crop((left, top, left + side, top + side)))
    mark = ImageEnhance.Contrast(mark).enhance(1.35)
    mark = ImageEnhance.Color(mark).enhance(1.25)

    plate = _disc(MASTER)
    mark_size = int(MASTER * 0.92)
    mark = mark.resize((mark_size, mark_size), Image.Resampling.LANCZOS)
    offset = (MASTER - mark_size) // 2
    plate.alpha_composite(mark, (offset, offset))

    # A soft bloom so the core stays visible after the image is shrunk to 16px.
    glow = plate.filter(ImageFilter.GaussianBlur(radius=MASTER * 0.012))
    return Image.blend(glow, plate, 0.82)


def main():
    os.makedirs(_ICONS_DIR, exist_ok=True)
    _ensure_source()
    master = _build_master()

    for size in SIZES:
        icon = master.resize((size, size), Image.Resampling.LANCZOS)
        if size <= 32:
            icon = ImageEnhance.Contrast(icon).enhance(1.18)
            icon = ImageEnhance.Sharpness(icon).enhance(1.4)
        out_path = os.path.join(_ICONS_DIR, f"icon{size}.png")
        icon.save(out_path, format="PNG")
        print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
