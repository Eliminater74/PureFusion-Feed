# Changelog

All notable changes to the PureFusion Feed extension will be documented in this file.

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
