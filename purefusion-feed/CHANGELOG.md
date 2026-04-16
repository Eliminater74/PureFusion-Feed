# Changelog

All notable changes to PureFusion Feed are documented in this file.

## v2.0.0 - 2026-04-16

### Added

- **Distraction-Free Reading Mode** — `Alt+Shift+F` keyboard shortcut hides both sidebars and centers the feed to 680px for a focused, clutter-free reading experience. Also accessible via a new Quick Toggle in the popup and in Options → UI Tweaks. The setting persists across sessions; the keyboard shortcut overrides until the next settings push.
- **Game Invite Filter** — New `removeGameInvites` toggle (Core Filters) hides web game notification and invite posts using three-signal detection: pagelet name, link href pattern, and 9-locale text-phrase matching. Toggle-OFF restores hidden posts.
- **True-Affinity Sort** — New `trueAffinitySort` toggle (AI Predictions) reorders the feed by your local engagement score in real time using CSS `flexbox order`, so your highest-interest posts float to the top without modifying React's virtual DOM.
- **Link Destination Reveal** — `showLinkPreviews` (on by default) now actively replaces Facebook's `l.facebook.com/l.php` tracking redirect hrefs with the real destination URL, making the browser status bar and copy-link show the true target. Fully reversible on toggle-OFF.
- **Comment Sort Enforcement** — `commentSortDefault` select (UI Tweaks) auto-clicks the comment sort menu to your preferred sort order (Newest / Most Relevant) when comment sections are expanded.
- **Absolute Timestamp Chips** — `fixTimestamps` (on by default) injects a compact "Posted: [date]" chip below each post heading, replacing relative timestamps ("3 hours ago") with exact dates.
- **Friend Activity Feed Insight** — When enabled (`showFriendActivity` in AI Predictions), marks contacts in the right-sidebar Contacts panel whose posts haven't appeared in your feed this session, revealing friends Facebook may be algorithmically suppressing. Requires ≥3 authors seen before badging to avoid false noise.
- **Large Reaction Normalization** — `removeLargeReactions` (on by default) caps the oversized font-size Facebook applies to emoji-only posts (3× normal) back to standard body text size.
- **Session Stats Live Counting** — The popup "Ads Blocked / Spam Hidden" counters now reflect real session activity. Main script listens for `pf:element_hidden` events and writes totals to `pf_session_stats` local storage, which the popup reads on open.

### Changed

- Popup Quick Filters section now includes a **Distraction-Free Mode** toggle alongside the existing quick controls.
- `data-ad-comet-preview="message"` added alongside `data-ad-preview="message"` in all post-body selectors — fixes TL;DR "Summarize with AI" chip disappearing on post variants that use the comet attribute.

---

## v1.8.1 - 2026-04-15

### Changed
- Session content-type filter (Hide similar posts), Insight Chip classification labels, and ad detection hardening

---

## v1.8.0 - 2026-04-15

### Added
- **Sponsored Posts toggle** — split "Block Ads & Sponsored" into two independent controls: a hard infrastructure signal blocker (`removeAds`, always reliable, zero false positives) and a separate "Hide Sponsored Posts" label-detection toggle (`removeSponsored`, off by default, iterating). Both are accessible from the popup, in-page panel, and options page.
- **Image subject filters** — 9-locale alt-text token coverage (FR/DE/IT/NL/SV/DA/NO) for all 6 categories (sports, food, pets, vehicles, memes, travel). False-positive audit removed overly broad travel tokens.
- **Granular sidebar hardening** — position-aware right sidebar resolver correctly targets the main sidebar when a Messenger chat panel is also present. All heading/aria-label tokens expanded to 9 locales.
- **Memories filter** — hides "On This Day" Memories posts; toggle-OFF restores them.
- **UI tweaks activated** — `fontSizeScale` (80–150%), `anonymizerMode` blur with hover-reveal, `disableCommentAutofocus` guard.
- **Notification + search popup locale expansion** — all 4 notification categories and search popup paths cover 9 locales.

### Fixed
- **Hide Reels toggle showed wrong state** — popup initialized the toggle using `hideReels && hideStories` (AND condition), so it always displayed OFF even though Reels were actively hidden. Fixed to reflect `hideReels` state independently. Decoupled from Stories toggle.
- **Reels selector hardening** — added `aria-label`, `role="region"` structural, and lowercase pagelet variants. Text heuristic now uses `^reels\b` regex guard with ancestor walk.
- **Sponsored toggle-OFF restoration** — toggling either ad/sponsored switch OFF now correctly un-hides posts that were hidden by that specific filter (DoD regression rule compliance).
- **Content script lifecycle** — port-disconnect guard and `destroy()` on all interval/observer modules prevents stale callbacks after extension reload.

### Changed
- Ad Blocker section in popup renamed from "Sponsored Ad Blocker" to "Ad Blocker" to accurately reflect hard-signal scope.
- Popup "Hide Reels & Stories" renamed to "Hide Reels" — Stories is a separate setting in the options dashboard.

## v1.7.0 - 2026-04-13

### Added
- ⚡ **Power-User Rule Engine**: Create persistent custom filtering rules based on CSS selectors or text-matching patterns. Accessible via the new "Power-User" settings tab.
- ⚡ **Context Menu "Zap"**: Right-click any element on Facebook to instantly hide it. Generates persistent hiding rules automatically with one-click "Undo" support.
- **International Story Expansion**: Added refined filtering support for Dutch (NL), Swedish (SV), Danish (DA), and Norwegian (NO) locales.
- **Story Body Text Guard**: Intelligent heuristic that skips story filters for posts containing substantial user-written text, significantly reducing false positives on friend interactions.

### Fixed
- Resolved Unicode encoding issues in developer versioning scripts.
- Hardened "Friend Activity" detection to better distinguish between low-signal stories and legitimate feed discussions.
- Improved header signal extraction reliability across different Facebook UI rollout variants.

## v1.4.0 - 2026-04-08

### Added
- Messenger runtime support improvements and settings sync on messenger.com.
- Messenger AI assist tools:
  - Rewrite draft button.
  - Smart Replies generation (3 options).
- Options presets: Work Focus, Friends Only, Minimal, News Heavy, Messenger Privacy.
- Keyword allowlist and Never Hide Sources inputs.
- Undo chips for hidden posts with "Show once" and "Always allow source" actions.
- Live theme preview enhancements and keyboard-accessible options tab navigation.
- Extended i18n coverage across popup/options/welcome and runtime strings.

### Changed
- Moved AI provider hosts to optional host permissions and added runtime permission flow.
- Updated LLM/Gemini routing to handle modern model variants and improved error feedback.
- Improved popup and options visual polish and focus states.
- Added messenger AI toggles to Options -> AI Engine.

### Fixed
- Duplicate IDs and structural issues in options UI.
- Master toggle behavior in popup and settings sync propagation across modules.
- Local-only storage handling for API keys.
- Multiple interval/observer performance leaks and hidden-tab overhead.
- Invalid color and assorted copy/typo issues.

### Notes
- Auto Comment Preview remains beta and is disabled by default for stability.

## v1.3.0 - 2026-04-08

### Added
- Initial public-ready architecture baseline for feed cleanup, UI tweaks, local prediction, and options dashboard.
