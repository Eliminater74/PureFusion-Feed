<div align="center">

<img src="purefusion-feed/icons/icon128.png" alt="PureFusion Feed logo" width="96" height="96"/>

# PureFusion Feed v2.4.1

**Your Facebook. Filtered. Predicted. Perfected.**

[![Version](https://img.shields.io/badge/version-2.4.1-6C3FC5?style=for-the-badge&logo=googlechrome&logoColor=white)](https://github.com/Eliminater74/PureFusion-Feed/releases)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-00D4FF?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Facebook-1877F2?style=for-the-badge&logo=facebook&logoColor=white)](https://www.facebook.com)

[![Stars](https://img.shields.io/github/stars/Eliminater74/PureFusion-Feed?style=social)](https://github.com/Eliminater74/PureFusion-Feed/stargazers)
[![Forks](https://img.shields.io/github/forks/Eliminater74/PureFusion-Feed?style=social)](https://github.com/Eliminater74/PureFusion-Feed/network/members)
[![Issues](https://img.shields.io/github/issues/Eliminater74/PureFusion-Feed)](https://github.com/Eliminater74/PureFusion-Feed/issues)
[![Last Commit](https://img.shields.io/github/last-commit/Eliminater74/PureFusion-Feed)](https://github.com/Eliminater74/PureFusion-Feed/commits/main)
[![Repo Size](https://img.shields.io/github/repo-size/Eliminater74/PureFusion-Feed)](https://github.com/Eliminater74/PureFusion-Feed)

[![Visitors](https://visitor-badge.laobi.icu/badge?page_id=Eliminater74.PureFusion-Feed&left_color=%236C3FC5&right_color=%2300D4FF&left_text=Visitors)](https://github.com/Eliminater74/PureFusion-Feed)

</div>

---

PureFusion Feed is an advanced, **privacy-first Chrome extension** that gives you full control over your Facebook experience. Unlike traditional ad-blockers that rely on static blacklists, PureFusion intelligently restructures the DOM, eliminates invasive algorithmic modules, and runs an **on-device AI engine** to curate your timeline — with zero data ever leaving your browser.

---

## What's New in v2.4.1

| Version | What changed |
|---------|----------------|
| **2.4.1** | Friend-activity and Stories controls are translated in all 21 languages. Spanish labels match the English controls. The toolbar icon is the original blue swirl. |
| **2.4.0** | The main ad blocker hides **Sponsored** and **Paid partnership** headers. **"Liked this" / "Commented on this"** cards are hidden by default. Reel carousels (several `/reel/` links in one card) are hidden with Reels. **Stories** has its own popup switch. |
| **2.3.0** | Clicking the **Facebook logo** to go Home keeps filters on. Facebook rebuilds that feed without a page reload, and PureFusion follows the new feed instead of the one it just removed. |

---

## 🚀 Core Features

### Feed Cleaner
- **Algorithmic disarmament** — removes Suggested for you, Suggested post, People You May Know, and group injection modules
- **Friend-activity cards** — hides "Jane liked this" and "John commented on this". Posts from people you follow stay
- **Reels and Stories** — hides Reels trays and reel carousels. Stories is a separate switch
- **Sponsored labels** — the main ad blocker hides Sponsored and Paid partnership headers, including ads that no longer include an ads link
- **Home button** — filters stay on when you click the Facebook logo. That click rebuilds the feed in place
- **21 languages** — English, Spanish, French, German, Italian, Dutch, Swedish, Danish, Norwegian, Portuguese, Indonesian, Vietnamese, Filipino, Turkish, Arabic, Hindi, Korean, Japanese, Traditional Chinese, Polish, and Russian

### AI Prediction Engine (100% On-Device)
- **Local-first ML scoring** — ranks posts by predicted relevance based entirely on your own engagement history
- **Content Classification (Model F)** — word-boundary-accurate detection of Political, Opinion, News, Commercial, and Emotional content
- **Ragebait & Engagement-Bait Detection** — flags manipulation patterns with on-chip severity badges
- **Credibility Signals** — multi-factor source credibility scoring with one-click verification search links
- **Persistent Author Blocklist** — permanently suppress any source; survives page reloads
- **Persistent Allowlist** — mark trusted sources so they always appear, even when session content filters are active

### Insight Chip — Per-Post AI Panel
Each feed post gets a compact, non-intrusive intelligence chip showing:

| Info | Detail |
|------|--------|
| PF Score | Relevance score based on your history |
| Content type | Political / Opinion / News / Commercial / Personal |
| Tone | Opinionated / Informational / Emotional / Promotional |
| Confidence | Low / Medium / High |
| Quick Actions | Hide similar · Always show source · Block source |

### Smart Controls
- **Feed Mode Presets** — Clean / Focus / Ultra Fast / Smart / Classic — one-click feed personality
- **Widescreen Mode** — breaks Facebook's center-column layout for ultrawide monitors
- **Context-menu Zap** — right-click any post to instantly remove it or teach PureFusion to filter it
- **Daily Feed Report** — session and weekly stats; open with `Alt+Shift+R`
- **Power-User Rule Engine** — custom filter rules by selector, author, or text match

### Privacy & Wellbeing
- **Screenshot Anonymizer** — blurs profile images and author names; hover to reveal
- **Clickbait Blocker & Scroll Stopper**
- **AI features are 100% opt-in** — the AI wand hides itself completely if no key is configured

---

## 🧠 AI Assistant Configuration (100% Free)

You do **not** need a paid subscription. Choose either option:

### Option 1: Chrome Built-in AI — Gemini Nano *(Recommended for Privacy)*

Runs entirely offline. No API key, no cloud, no cost.

1. Go to `chrome://flags`
2. Enable **Prompt API for Gemini Nano** → `Enabled`
3. Enable **Enables optimization guide on device model** → `Enabled BypassPerfRequirement`
4. Relaunch Chrome — check download progress at `chrome://components` → *Optimization Guide On Device Model*

### Option 2: Free Gemini Developer API

Google's Gemini API is free up to 15 requests/minute.

1. Get a free key at [Google AI Studio](https://aistudio.google.com/)
2. Open **PureFusion Settings → AI Engine** and paste your key

> If both keys are left blank the AI wand hides itself automatically, keeping your UI clean.

---

## 🛠 Installation

### Developer Mode (from source)

```bash
git clone https://github.com/Eliminater74/PureFusion-Feed.git
```

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `purefusion-feed/` folder inside this repo
4. Visit Facebook — the **PF** button appears in your header bar automatically

### Chrome Web Store

> **Coming soon** — submission in progress.

---

## ⚙️ Usage

| Action | Result |
|--------|--------|
| Click **PF** in the Facebook header | Quick-toggle popup: Grayscale, Hide Reels, Hide Ads |
| Click **Advanced Settings** | Full glassmorphism settings panel |
| Right-click any post | Context-menu Zap — filter by author, text, or selector |
| Click **Details** on an Insight Chip | AI score breakdown, Quick Actions, active filter status |
| Press `Alt+Shift+R` | Open Daily Feed Report |

---

## 🔒 Privacy First

| What PureFusion does | What PureFusion never does |
|----------------------|---------------------------|
| All DOM modifications run inside your browser | No telemetry, analytics, or usage reporting |
| Engagement history stored in `chrome.storage.local` | No data sent to any external server |
| API keys stored in local encrypted storage | No third-party tracking or fingerprinting |
| Blocklist & allowlist stored locally | No account linking or identity inference |

---

## 📁 Project Structure

```
PureFusion-Feed/
├── purefusion-feed/              # Chrome extension root (load this folder)
│   ├── src/
│   │   ├── content/              # Content scripts
│   │   │   ├── cleaner-core.js   # Feed filter pipeline
│   │   │   ├── cleaner-ads.js    # Sponsored and ad detection
│   │   │   ├── observer.js       # Watches the page, including Home rebuilds
│   │   │   └── ...
│   │   ├── background/           # MV3 service worker
│   │   ├── popup/                # Quick-toggle popup UI
│   │   ├── options/              # Full settings panel
│   │   ├── welcome/              # First-run welcome page
│   │   └── utils/                # Storage, helpers, LLM engine
│   ├── icons/                    # Extension icons (16 / 32 / 48 / 128 px)
│   ├── manifest.json
│   └── CHANGELOG.md
└── scripts/                      # Developer utilities
    ├── bump_version.py           # Version manager (--patch / --minor / --major / --set)
    ├── make_icons.py             # Generate placeholder icons
    └── resize_icons.py          # Resize a source PNG to all required icon sizes
```

---

## 🤝 Contributing

Contributions, bug reports, and feature requests are welcome!

1. Fork the repo and create a feature branch
2. Make your changes inside `purefusion-feed/src/`
3. Test on a live Facebook feed (Developer Mode → reload extension)
4. Open a Pull Request — describe what changed and why

If Facebook has updated their DOM structure and broken a filter, please [open an issue](https://github.com/Eliminater74/PureFusion-Feed/issues) with the broken selector or a description of what stopped working.

---

## 📝 License

Distributed under the **MIT License**.

---

<div align="center">

Made with ☕ by [Eliminater74](https://github.com/Eliminater74)

[![GitHub](https://img.shields.io/badge/GitHub-Eliminater74-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/Eliminater74)

*If PureFusion Feed has saved your sanity from the algorithmic chaos, consider leaving a ⭐*

</div>
