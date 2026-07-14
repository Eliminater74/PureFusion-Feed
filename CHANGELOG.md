# Changelog

All notable changes to the PureFusion Feed extension will be documented in this file.

## [2.2.1] - 2026-07-14
### Added
- **Auto Comment Preview (Smart Inject v3):** Hardened multi-layer `fb_dtsg` auth token extraction (`require('DTSGInitialData')` and document fallback) to reliably fetch GraphQL top comments on modern Facebook Comet feeds.
- **Full-Depth Post ID Resolver:** Expanded `PF_PostIDResolver` to inspect all embedded links (`fbid=`, `story_fbid=`, `multi_permalinks=`, `/permalink/`, `/photo/`) and React attributes, enabling instant comment previews across almost 100% of feed posts, group posts, photos, and video cards.
- **Interactive "Expand All ▾" Trigger:** Added a one-click `Expand All ▾` button inside the Quick Insight comment preview card to instantly open the full live comment thread inline without leaving the feed.
- **Automatic Click Fallback:** Added seamless fallback routing from GraphQL fetching to progressive DOM click expansion whenever posts have restricted privacy or unresolvable IDs.

### Changed
- **Comment Section Isolation:** Updated `ui-tweaks.js`, `predictor-engine.js`, and `predictor-ui.js` with precise comment detectors (`_isCommentElement`, `_isCommentNode`) to completely prevent stray `Posted: ...` date chips and credibility badges from injecting into comment threads or over modal close (`X`) buttons.
- **AI Wand Composer Integration:** Refactored `llm-features.js` to insert the AI response wand (`🪄`) directly inside the Lexical comment composer action bar alongside emoji/GIF icons instead of floating on its own line.
- **Attribution & i18n:** Updated all welcome screen and 21 internationalized `messages.json` locale translations to attribute development to `Eliminater74`.

## [1.0.0] - Launch Candidate 1
### Added
- **Core Engine:** Ported complete filter map targeting modern React-based Facebook DOM.
- **Aggressive Eradication:** `removeRightRailAds` heuristic added to scrub sidebar ads.
- **Aggressive Trays:** Added heuristic text-node DOM hunting to physically locate and destroy dynamically injected Reels and Stories trays, bypassing Facebook obfuscation.
- **In-Page Dashboard:** Deployed native "PF" navigation button directly into the top Facebook Navbar using virtual React portaling simulation.
- **Smart Comments:** Re-architected `applyToNodes` to drill directly into React text inputs, allowing the AI Copilot Wand to render successfully inside deep photo modals.
- **Comment Tweaks:** Automated "All Comments" virtual-click sorter, slowing down the timeout to 400ms to guarantee precision even when React renders slowly.
- **Auto Expand:** Built a feature that automatically hunts and expands inline `12 comments` prompts as you scroll so timelines are fully legible.
- **Widescreen Native:** Added global `max-width` CSS overrides to stretch content for Ultrawide monitors.
- **Settings Sync:** Built glassmorphic Settings UI page mapped to `chrome.storage.local`.

### Security
- Locked down `manifest.json` ensuring Web Accessible Resources only expose necessary options.
- Disabled engine-block gates so users are fully alerted via UI alerts if AI parameters are inactive.
