#!/usr/bin/env python3
"""
make_icons.py — PureFusion Feed toolbar icons

Copies the original blue swirl (scripts/assets/mark-source.png) down to the
Chrome sizes. The artwork stays the source image. This script does not redraw it.

Requires Pillow.
"""

import os

from PIL import Image

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_SOURCE = os.path.join(_SCRIPT_DIR, "assets", "mark-source.png")
_ICONS_DIR = os.path.normpath(os.path.join(_SCRIPT_DIR, "..", "purefusion-feed", "icons"))

SIZES = (16, 32, 48, 128)


def main():
    os.makedirs(_ICONS_DIR, exist_ok=True)
    source = Image.open(_SOURCE).convert("RGBA")

    for size in SIZES:
        icon = source.resize((size, size), Image.Resampling.LANCZOS)
        out_path = os.path.join(_ICONS_DIR, f"icon{size}.png")
        icon.save(out_path, format="PNG")
        print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
