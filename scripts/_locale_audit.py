#!/usr/bin/env python3
"""One-off locale audit. Not part of the extension."""
import json

en = json.load(open(r"purefusion-feed/_locales/en/messages.json", encoding="utf-8"))
es = json.load(open(r"purefusion-feed/_locales/es/messages.json", encoding="utf-8"))

eng = set(
    "the a an of to for and or with your this that from are is on off click "
    "hide show remove removes block blocks when posts post settings setting "
    "mode modes only because friend friends liked commented stories story bar "
    "top ads ad sponsored labels label detection enhanced minimal filtered "
    "toggles toggle description desc placeholder".split()
)

for key, value in es.items():
    msg = value.get("message", "")
    words = []
    for raw in msg.replace("—", " ").replace("✓", " ").replace("⚠", " ").split():
        words.append(raw.strip(".,:;!?\"'()[]{}").lower())
    hits = [w for w in words if w in eng]
    if len(hits) >= 2:
        en_msg = en.get(key, {}).get("message", "")
        print(f"{key}")
        print(f"  EN: {en_msg}")
        print(f"  ES: {msg}")
