#!/usr/bin/env python3
"""
resize_icons.py — PureFusion Feed Icon Resizer

Resizes a high-resolution source PNG to all required Chrome extension icon
sizes (16, 32, 48, 128) using LANCZOS resampling and saves them into the
purefusion-feed/icons/ directory.

Requires Pillow:  pip install pillow

Usage:
  python scripts/resize_icons.py
  python scripts/resize_icons.py --src "C:/path/to/your_icon.png"

Run from any directory — the output path is resolved relative to this script.
"""

import os
import sys
import argparse

# Resolve output directory relative to this script's location
# Structure: Extension/scripts/resize_icons.py → Extension/purefusion-feed/icons/
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_ICONS_DIR  = os.path.normpath(os.path.join(_SCRIPT_DIR, "..", "purefusion-feed", "icons"))

# Default source image — update this to your own path or pass --src
_DEFAULT_SRC = r"C:\Users\elimi\.gemini\antigravity\brain\7ef4d24f-409a-4226-8c23-686e869e9c20\purefusion_icon_1775598353904.png"

SIZES = [16, 32, 48, 128]


def main():
    parser = argparse.ArgumentParser(
        description="Resize a source PNG to all Chrome extension icon sizes."
    )
    parser.add_argument(
        "--src",
        metavar="PATH",
        default=_DEFAULT_SRC,
        help=f"Path to the source image (default: {_DEFAULT_SRC})"
    )
    args = parser.parse_args()

    src_image = args.src

    if not os.path.exists(src_image):
        print(f"Error: source image not found:\n  {src_image}")
        print("\nPass a different path with:  --src \"C:/path/to/icon.png\"")
        sys.exit(1)

    from PIL import Image

    os.makedirs(_ICONS_DIR, exist_ok=True)

    with Image.open(src_image) as img:
        print(f"Source: {src_image}  ({img.size[0]}×{img.size[1]})")
        print(f"Output: {_ICONS_DIR}\n")

        for size in SIZES:
            resized  = img.resize((size, size), Image.Resampling.LANCZOS)
            out_path = os.path.join(_ICONS_DIR, f"icon{size}.png")
            resized.save(out_path, format="PNG")
            print(f"  ✔  icon{size:>3}.png")

    print(f"\nDone. {len(SIZES)} icons written to:\n  {_ICONS_DIR}")


if __name__ == "__main__":
    main()
