# PureFusion Feed

**Your Facebook. Filtered. Predicted. Perfected.**

PureFusion Feed is an advanced, privacy-first Chrome Extension designed to take absolute control over your Facebook experience. Unlike traditional ad-blockers that rely on simple blacklists, PureFusion intelligently restructures the DOM, nukes invasive algorithmic trays, and leverages local AI to curate your timeline.

## 🚀 Core Features

- **Algorithmic Disarmament:** Eradicates the "Suggested For You", "People You May Know", and Group injection modules.
- **Aggressive Reels & Stories Blocking:** Fully removes horizontal scrolling distraction trays (Reels natively blocked via heuristic text-node traversal to prevent bypasses).
- **Ad & Sponsored Content Eradication:** Nests deep into the virtual DOM to remove sponsored posts masquerading as standard feed items.
- **Smart Comment Control:** Enforces "All Comments" timeline sorting automatically and auto-expands hidden comment threads so you can read seamlessly while scrolling.
- **Widescreen Mode:** Breaks Facebook's rigid center-column constraints to utilize your entire ultrawide monitor.
- **Digital Wellbeing Engine:** Includes dopamine-breaking features like grayscale mode, infinite-scroll walls, and session timers.
- **AI Intelligence Suite (BYOK):** Connect your own OpenAI or Gemini API securely to summarize long posts (TL;DR), un-spin clickbait headlines, or draft smart comments via the Copilot Wand.

## 🛠 Installation

1. Clone or download this repository.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the `/purefusion-feed` folder inside this directory.
5. Alternatively, install it directly from the [Chrome Web Store](#) *(Link coming soon)*.

## ⚙️ Usage

Once installed, a native dashboard button ("PF") will dock itself into your Facebook header bar.
- Click the **PF Button** for quick-toggles (Grayscale, Hide Reels, Hide Ads).
- Click **Advanced Settings** to open the full glassmorphism UI configuration panel where you can input API keys, adjust font scaling, toggle widescreen mode, and manage blocklists.

## 🔒 Privacy First

PureFusion operates with a strict local-first architecture. 
- All timeline modifications happen directly in your browser.
- Your personal API keys (OpenAI / Gemini) are encrypted and stored in `chrome.storage.local`.
- **Zero data** is collected, harvested, or transmitted to third-party tracking servers.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](#) if you discover Facebook has updated their DOM structures.

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.
