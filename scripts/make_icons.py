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

from PIL import Image, ImageDraw, ImageEnhance

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_ICONS_DIR = os.path.normpath(os.path.join(_SCRIPT_DIR, "..", "purefusion-feed", "icons"))
_SOURCE = os.path.normpath(os.path.join(_SCRIPT_DIR, "assets", "mark-source.png"))

SIZES = (16, 32, 48, 128)


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
    """Full-bleed circle. The outer pixels are bright so they do not vanish on a dark toolbar."""
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pixels = image.load()
    center = (size - 1) / 2.0
    radius = size / 2.0
    for y in range(size):
        for x in range(size):
            distance = math.hypot(x - center, y - center)
            if distance > radius:
                continue
            t = distance / max(radius, 0.001)
            # Light violet body. The rim is near-white cyan so the full circle reads.
            red = int(92 + t * 40)
            green = int(48 + t * 150)
            blue = int(210 + t * 40)
            if t > 0.72:
                edge = (t - 0.72) / 0.28
                red = int(red * (1 - edge) + 236 * edge)
                green = int(green * (1 - edge) + 252 * edge)
                blue = 255
            pixels[x, y] = (min(255, red), min(255, green), min(255, blue), 255)
    return image


def _swirl_layer(size):
    """Oversized swirl, cropped by the canvas so the bright lines reach the rim."""
    source = Image.open(_SOURCE).convert("RGBA")
    side = int(source.width * 0.5)
    left = (source.width - side) // 2
    top = int(source.height * 0.2)
    mark = _knock_out(source.crop((left, top, left + side, top + side)))
    mark = ImageEnhance.Contrast(mark).enhance(1.6)
    mark = ImageEnhance.Brightness(mark).enhance(1.35)
    mark = ImageEnhance.Color(mark).enhance(1.4)

    blown = int(size * 1.55)
    mark = mark.resize((blown, blown), Image.Resampling.LANCZOS)
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    offset = (size - blown) // 2
    layer.paste(mark, (offset, offset), mark)
    return layer


def _bold_strokes(image):
    """Thick arcs on top of the photo swirl so 16px still fills the button."""
    size = image.size[0]
    draw = ImageDraw.Draw(image)
    stroke = max(2, round(size * 0.16))
    pad = max(0, round(size * 0.06))
    box = [pad, pad, size - 1 - pad, size - 1 - pad]
    draw.arc(box, start=200, end=40, fill=(255, 255, 255, 255), width=stroke)
    inner = pad + round(stroke * 0.85)
    if inner * 2 < size - 2:
        box_inner = [inner, inner, size - 1 - inner, size - 1 - inner]
        draw.arc(box_inner, start=10, end=190, fill=(186, 255, 255, 255), width=max(2, stroke - 1))
    return image


def _mask_circle(image):
    size = image.size[0]
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.paste(image, (0, 0), mask)
    return result


def _render(size):
    plate = _disc(size)
    plate.alpha_composite(_swirl_layer(size))
    plate = _bold_strokes(plate)
    return _mask_circle(plate)


def main():
    os.makedirs(_ICONS_DIR, exist_ok=True)
    _ensure_source()

    for size in SIZES:
        # Draw at 4x and downscale so the 16px icon stays a solid disc, not a blurry speck.
        scale = 4 if size <= 32 else 2
        icon = _render(size * scale).resize((size, size), Image.Resampling.LANCZOS)
        out_path = os.path.join(_ICONS_DIR, f"icon{size}.png")
        icon.save(out_path, format="PNG")
        print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
