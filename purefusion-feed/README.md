# 💜 PureFusion Feed

> "Your Facebook. Filtered. Predicted. Perfected."

**PureFusion Feed** is a next-generation Chrome Extension designed to eliminate the noise from modern Facebook. Combining a robust zero-latency CSS blocklist, a highly resilient MutationObserver engine, and an exclusive, privacy-first **Local AI Prediction Engine**, it transforms Facebook back into a clean, chronological social network.

---

## ✨ Features

### 🚫 Complete Clutter Removal (Core Filters)
- Eradicates "Sponsored" posts and sidebar Ads via dynamic DOM sweeping.
- Hides "Suggested for you", "People You May Know", and "Suggested Groups".
- Removes colored backgrounds and large obnoxious text statuses.
- Strict Keyword filtering: **Autohide** (silently deletes posts) or **Blocklist** (collapses them behind a "Show anyway" blur wall).

### 🤖 Local AI Prediction Engine
- **Privacy First:** Your data never leaves your browser.
- **Engagement Profiling:** Learns which authors and pages you actually interact with (Likes, Comments, Link clicks).
- **Feed Badging:** Injects a "PF Score" onto every post.
- **Auto-Dimming:** Visually mutes posts scoring below your relevance threshold, while highlighting highly relevant posts with a neon Cyan glow.
- **Trend Detection:** Periodically analyzes the organic text in your feed to surface naturally trending keywords without external APIs.

### 🎨 Interface Refinement (UI Tweaks)
- **Chronological Forcing:** Auto-redirects Facebook's algorithmic feed back to "Most Recent".
- **Distraction-Free Reading:** Press `Alt+Shift+F` to instantly hide all sidebars and headers.
- **Compact Mode:** Reduces padding and margins for a denser information display.
- **Anti-Phishing Links:** Decodes Facebook's tracking URLs and shows you the true domain destination as a badge `🔗 destination.com`.
- **Custom Themes:** Override Facebook's root tokens with *Dark Pro*, *AMOLED Pitch Black*, or *Classic Blue* variations.

### 📊 Social & Notification Tools
- **Silent Unfriend Detection:** Passively maps your friends list over intervals to identify removed or deactivated accounts.
- **Digest Mode:** Hides the anxiety-inducing red notification count badge until a full hour has passed.
- **Targeted Notification Blocking:** Strips out Game Invites and Marketplace noise from the alert dropdown.

---

## 🛠️ Architecture

Built completely from scratch using **Vanilla JavaScript (ES2022)**. 

- **Manifest V3 Core:** Utilizing `declarativeNetRequest` for strict payload blocks before rendering.
- **Debounced Observer Matrix:** `MutationObserver` captures 150ms batches to prevent the browser thread lock-ups caused by legacy extensions.
- **Resilient Map Dictionary:** `src/data/selector-map.js` avoids directly targeting Facebook's hashed CSS class names, instead relying upon `aria-labels`, `role` attributes, and localized nested structures.
- **Asymmetric Storage:** Syncs configuration across all your devices using `chrome.storage.sync`, but keeps heavy AI machine learning data locked onto the current device via `chrome.storage.local`.

---

## 📦 Installation & Developer Build

As this is an active developer build, you must load it "Unpacked" in Chrome:

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`
3. Toggle on **"Developer Mode"** in the top right corner.
4. Click **"Load unpacked"** and select the root `purefusion-feed` folder.

All Icons and `manifest.json` are automatically picked up.

---

## 📝 Definition of Done (Checklist)

- [x] Manifest V3 Setup with minimum permissions
- [x] `.gitignore` guarding repository
- [x] Settings Schema & Selector Mapping
- [x] Core Debounced `MutationObserver` 
- [x] Ads, Sponsored, Suggestion Cleaning Engine
- [x] Service Worker (DNR rules)
- [x] Zero-latency `injected.css` hard blocks
- [x] Popup Server with Quick Toggles
- [x] Options Dashboard with JSON Export/Import
- [x] Local Prediction Engine (Scoring / Learning)
- [x] Social Tools (Unfriend Detection) & Notification Digest
- [x] Icons generated
- [x] Clean architecture with zero console-spam in Production

**Design Assets:** 
- Primary Color: `#6C3FC5`
- Accent Color: `#00D4FF`

*Built by the PureFusion team.*
