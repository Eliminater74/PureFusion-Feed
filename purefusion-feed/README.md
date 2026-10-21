# PureFusion Feed v2.4.1

> Your Facebook. Filtered. Predicted. Perfected.

PureFusion Feed is a Chrome extension focused on restoring control over Facebook and Messenger with fast feed filtering, privacy-first settings, and optional BYOK AI tools.

---

## Highlights

### Feed Control
- Removes Sponsored and Paid partnership posts, including ads that only show the header label, plus right-rail ads.
- Hides suggested content, People You May Know, reel trays, reel carousels, and other injected modules.
- Hides "liked this" and "commented on this" cards. Ordinary posts stay. Stories is its own switch.
- Keeps those filters on when you click the Facebook logo to return Home.
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
- 21 locales for popup, options, welcome, and runtime controls: English, Spanish, French, German, Italian, Dutch, Swedish, Danish, Norwegian, Portuguese, Indonesian, Vietnamese, Filipino, Turkish, Arabic, Hindi, Korean, Japanese, Traditional Chinese, Polish, and Russian.

## Release Notes

- Current: `v2.4.1`
- **v2.4.1** — Friend-activity and Stories strings in all 21 languages. Spanish labels match the English controls. Toolbar icon is the original blue swirl.
- **v2.4.0** — Sponsored-label ads, friend-activity cards, reel carousels, and a separate Stories switch.
- **v2.3.0** — Filters stay on after you click the Facebook logo to go Home.
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
