# PureFusion Feed v1.7.1

**Your Facebook. Filtered. Predicted. Perfected.**

PureFusion Feed is an advanced, privacy-first Chrome Extension designed to take absolute control over your Facebook experience. Unlike traditional ad-blockers that rely on simple blacklists, PureFusion intelligently restructures the DOM, nukes invasive algorithmic trays, and leverages local AI to curate your timeline.

## 🚀 Core Features

- **Algorithmic Disarmament:** Eradicates the "Suggested For You", "People You May Know", and Group injection modules.
- **Aggressive Reels & Stories Blocking:** Fully removes horizontal scrolling distraction trays (Reels natively blocked via heuristic text-node traversal to prevent bypasses).
- **Ad & Sponsored Content Eradication:** Nests deep into the virtual DOM to remove sponsored posts masquerading as standard feed items.
- **Smart Comment Control:** Enforces "All Comments" timeline sorting automatically and auto-expands hidden comment threads so you can read seamlessly while scrolling.
- **Widescreen Mode:** Breaks Facebook's rigid center-column constraints to utilize your entire ultrawide monitor.
- **Core Engine:** Cleaner, Predictor, and Observer loops.
- **Privacy:** Screenshot Anonymizer and Friends-Only mode.
- **Wellbeing:** Clickbait blocker and Scroll stopper.
- **Global Support:** Smart, automatic i18n with English and Spanish presets.
- **AI Intelligence:** Gemini and Window.ai integrations.

---

[PureFusion Dev Documentation](https://github.com/Eliminater74/PureFusion-Feed)

## 🧠 AI Assistant Configuration (100% Free)

You do **not** need a paid subscription (like ChatGPT Plus) to use the powerful AI features in PureFusion. You have two completely free options to power the AI Assistant Wand:

### Option 1: Chrome Native Local AI (window.ai) - *Recommended for Privacy*

Google recently built a lightweight version of Gemini directly into the Chrome browser that runs entirely offline on your local machine. It costs nothing, requires no API keys, and never sends your data to the cloud.

### Setup Instructions (Local Chrome AI)

1.  Navigate to `chrome://flags` in your browser.
2.  Enable: `Prompt API for Gemini Nano` (**Enabled**).
3.  Enable: `Enables optimization guide on device model` (**Enabled BypassPerfRequirement**).
4.  Relaunch Chrome and wait a few minutes for the model to download (check `chrome://components` for "Optimization Guide On Device Model").

### Option 2: The Free Gemini Developer API

Google provides access to their world-class Gemini API completely for free (up to 15 requests per minute). 

### Setup Instructions (Gemini API Free Tier)

1.  Get your free API Key from [Google AI Studio](https://aistudio.google.com/).
2.  Open **PureFusion Settings** > **AI Engine** tab.
3.  Choose **Google Gemini** as the provider and paste your key.

*(Note: If you leave the API keys completely blank, the AI Assistant Wand will automatically hide itself entirely from your feed to keep your interface absolutely clean!)*

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
