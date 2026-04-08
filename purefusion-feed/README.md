# PureFusion Feed v1.4.0

> Your Facebook. Filtered. Predicted. Perfected.

PureFusion Feed is a Chrome extension focused on restoring control over Facebook and Messenger with fast feed filtering, privacy-first settings, and optional BYOK AI tools.

---

## Highlights

### Feed Control
- Removes sponsored posts and right-rail ads.
- Hides suggested content, PYMK, reels, stories, and other noisy injections.
- Adds preset packs (Work Focus, Friends Only, Minimal, News Heavy, Messenger Privacy).
- Adds keyword modes: autohide, blocklist, allowlist, and never-hide sources.
- Includes undo chips for hidden posts with one-click restore or allow-source action.

### AI Features (Optional, BYOK)
- Local prediction engine with PF Score badges and interest-based dim/highlight logic.
- TL;DR summaries, smart comment helper, and clickbait decode for feed posts.
- Messenger AI assist: draft rewrite and smart replies in composer.
- Gemini/OpenAI provider support with optional host permissions.

### UI and Privacy
- Chronological feed enforcement, compact mode, widescreen mode, and themes.
- Messenger privacy toggles (hide seen/typing, privacy blur).
- In-page dashboard button and quick toggles.

### Internationalization
- English and Spanish locale support for popup, options, welcome, and runtime controls.

## Release Notes

- Current: `v1.4.0`
- Full history: `CHANGELOG.md`

---

## Architecture

Built with Vanilla JavaScript (ES2022) and Manifest V3.

- `declarativeNetRequest` for pre-render network filtering.
- Debounced observer/event pipeline for dynamic feed changes.
- Selector strategy based on roles/aria/data attributes instead of fragile class names.
- Split storage: sync settings plus local-only AI keys and device caches.

---

## Installation (Unpacked)

Load unpacked in Chrome:

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`
3. Toggle on **"Developer Mode"** in the top right corner.
4. Click **"Load unpacked"** and select the root `purefusion-feed` folder.

Chrome will load `manifest.json` from the `purefusion-feed` folder.

---

## Project Files

- `CHROME_STORE_LISTING.md` - Web Store copy and reviewer notes.
- `PRIVACY_POLICY.md` - privacy statement.
- `CHANGELOG.md` - release history.

Built by the PureFusion team.
