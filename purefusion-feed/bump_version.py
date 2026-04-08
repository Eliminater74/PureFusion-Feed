#!/usr/bin/env python3
"""
PureFusion Feed - Version Bumping Utility
Usage: 
  python bump_version.py --patch
  python bump_version.py --minor
  python bump_version.py --major
"""

import json
import re
import os
import argparse

def bump_version():
    parser = argparse.ArgumentParser(description="Bump PureFusion Feed Version")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--major", action="store_true")
    group.add_argument("--minor", action="store_true")
    group.add_argument("--patch", action="store_true")
    
    args = parser.parse_args()

    manifest_path = "manifest.json"
    readme_paths = ["README.md", "../README.md"]

    if not os.path.exists(manifest_path):
        print(f"Error: {manifest_path} not found.")
        return

    # 1. Read and Update Manifest
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    old_version = manifest.get("version", "1.0.0")
    parts = list(map(int, old_version.split('.')))

    if args.major:
        parts[0] += 1
        parts[1] = 0
        parts[2] = 0
    elif args.minor:
        parts[1] += 1
        parts[2] = 0
    elif args.patch:
        parts[2] += 1

    new_version = ".".join(map(str, parts))
    manifest["version"] = new_version

    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')

    print(f"✅ Manifest bumped: {old_version} -> {new_version}")

    # 2. Update READMEs
    version_pattern = re.compile(r"(PureFusion Feed v)\d+\.\d+\.\d+")
    
    for path in readme_paths:
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            new_content = version_pattern.sub(rf"\1{new_version}", content)
            
            with open(path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"✅ Updated version in {path}")
        else:
            print(f"⚠️ Skipping {path} (not found)")

if __name__ == "__main__":
    bump_version()
