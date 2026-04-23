# Chrome Web Store Listing Package — PureFusion Feed v2.1.0

Use this file as copy-ready content for your Chrome Web Store submission.

---

## Product Details

### Summary (max 150 chars)

Clean up Facebook with smart feed filters, AI post scoring, Read-Later queue, 21-locale support, and optional BYOK AI tools — fully local and private.

### Description

PureFusion Feed gives you full control over your Facebook feed. It removes clutter, scores posts by relevance using on-device AI, lets you permanently block or trust sources, and now ships with 21-language interface support and a full reading toolset — all without sending any data outside your browser.

---

### 1. Feed Cleanup and Filters

- Removes Suggested Posts, People You May Know, Group injection modules, and Reels trays
- Removes Stories bar, Memories posts, Fundraisers, and Page Suggestion modules
- Ad blocker removes feed ads using infrastructure signals (zero false positives)
- Enhanced ad filter adds label-heuristic scanning as a secondary pass
- **Post Age Filter** — hide posts older than 6 h, 12 h, 24 h, 2 d, 3 d, 1 week, 2 weeks, or 1 month
- **Post Deduplication** — hide posts you have already seen in the current session
- Keyword blocklist collapses posts; autohide list removes them entirely
- Image subject filters: hide posts by visual category (sports, food, pets, vehicles, memes, travel) — 21-locale alt-text coverage
- Game invite and notification post filter
- Post type filters: hide Video, Photo, Link, Text-only, Live, Reshare, or Poll posts independently

### 2. Reading and Focus Tools

- **Distraction-Free Mode** (`Alt+Shift+F`) — hides both sidebars, centers feed to 680 px for a clean reading view; also accessible from the popup quick toggle
- **Reply-Only Mode** — collapses post body text, leaving only comment threads visible; useful for engagement-bait avoidance
- **Auto-Expand "See More"** — automatically dismisses Facebook's artificial text truncation in all 21 supported languages
- **Image Hover Expand** — hover over feed images to see a full-size preview with Save and Open actions
- **Absolute Timestamps** — replaces "3 hours ago" with the exact date and time on every post
- **Comment Sort Enforcement** — automatically applies your preferred comment sort order (Newest / Top Comments) when sections expand
- **Tracking Parameter Cleaner** — strips fbclid, utm_*, gclid, msclkid, and 20+ other spy params from every feed link
- **Video Autoplay Control** — mute audio, pause autoplay, or disable entirely

### 3. Read-Later / Bookmark Queue

- Right-click any post → PureFusion → **Save to Read Later** to bookmark it
- Popup shows a live count badge and "View Queue" button
- Full queue management in Settings → Keyword Filters: thumbnail, author, snippet, save date, Open link, and individual Remove buttons
- Clear All with confirmation; queue persists across sessions in local storage

### 4. AI Feed Scoring and Classification

- On-device AI engine scores every post by predicted relevance based on your own engagement history — no cloud, no API key required
- Content Classification (Model F): identifies Political, Opinion, News, Commercial, and Emotional content using word-boundary-accurate token matching
- True-Affinity Sort: reorders feed posts by your local engagement score in real time (CSS flexbox, no React DOM changes)
- Ragebait and Engagement Bait detection flags manipulation patterns directly on each post
- Credibility signals with one-click verification search links
- Insight Chip: compact per-post panel showing score, content type, tone, and confidence rating
- Friend Activity Feed Insight: highlights contacts in the sidebar whose posts haven't appeared in your feed this session

### 5. Source Control

- Permanent Author Blocklist: block any source to hide all their posts across every page load
- Trusted Sources Allowlist: mark sources as always-show, immune to session content filters
- Session Content Filters: "Hide similar posts" hides all posts of the same type for the session — one click from the Insight Chip
- Quick Actions in every Insight Chip: Hide similar posts · Always show source · Block source
- AI Source Manager in Settings → Keyword Filters: view, add, and remove all blocked and trusted authors in one place

### 6. Popup Feed Intelligence

- AI Scoring toggle directly in the popup — no need to open Full Settings
- Live session stats: real counts of ads blocked and spam hidden since page loaded
- Live blocked/trusted source counts
- Read-Later count badge with direct queue access
- "Manage Sources" link opens Source Manager directly

### 7. Settings and Usability

- Popup quick toggles for all common filters and reading modes
- Full options dashboard with tabbed layout (Core Filters / Story Filters / AI / UI Tweaks / Social / Sidebar / Data)
- Import/Export configuration — enhanced format includes blocklist + allowlist with datestamped filename; legacy flat-format backups also accepted
- Feed Mode Presets: Clean / Focus / Ultra Fast / Smart / Classic — one-click feed personality
- Power-User Rule Engine: create persistent CSS or text-matching rules
- Context Menu "Zap": right-click any element to instantly hide it with one-click undo

### 8. Multilingual and International Support

- **21-locale filtering and UI coverage**: English, Spanish, French, German, Italian, Dutch, Swedish, Danish, Norwegian, Indonesian, Vietnamese, Filipino, Turkish, Arabic, Hindi, Korean, Japanese, Traditional Chinese, Polish, Russian, Brazilian Portuguese
- All filter paths, notification controls, "See More" auto-expand, and search popup suppression cover all supported locales
- Intelligent Body Text Guard prevents legitimate posts from being accidentally hidden in any language

### 9. Marketplace Local Filter

- Distance-based listing filter — set a max distance in miles to hide listings outside your area
- Supports both "X miles away" and "X km away" labels (auto-converts)
- Local pickup listings always shown; local-first sort surfaces nearby deals at the top
- Hide unknown distance option for strictly local-only view
- Compact overlay panel injected on the Marketplace page with live distance preview

### 10. Optional AI Features (BYOK — Bring Your Own Key)

- TL;DR post summaries and comment-assist tools
- Messenger composer: message rewrite and smart reply generation
- Supports Chrome's built-in Gemini Nano (fully offline) or Google Gemini / OpenAI APIs
- AI permissions only requested when you enable a provider

### 11. Messenger Enhancements

- Always-visible message timestamps — exact send times without hovering
- Mark All Read button — clears all unread badges in one click
- Conversation filter bar — filter inbox to All, Unread, or Group conversations
- Unsend detection — notifies you when a received message is deleted by the sender
- Hide seen receipts, typing indicators, and privacy blur mode

### 12. Digital Wellbeing

- Grayscale Mode — reduce screen addiction with monochrome rendering
- Infinite Scroll Stopper — pause feed loading after N posts with a "Take a break" prompt
- Session Timer — floating clock showing time spent on Facebook this session
- Reels Limiter — allow only N reels per session, then block further autoplay
- Clickbait Blocker — auto-collapses known clickbait phrase patterns
- Ragebait Detector — uses AI Predictor to down-score intentionally inflammatory posts

---

**Important compatibility note:**

Facebook and Messenger interfaces change frequently. Filter results may vary by account, language, or rollout variant. PureFusion does not guarantee removal of every suggested or injected element in every interface variant.

---

## Category and Language

- Category: Productivity
- Language: English

---

## Test Instructions for Reviewers

1. Install the extension and open `https://www.facebook.com`.
2. Open the extension popup. The **Hide Reels** toggle will be ON by default — Reels trays should already be hidden. Toggle off and on to confirm live effect.
3. Confirm recommendation modules (People You May Know, Suggested Groups) are removed from the feed.
4. In the popup **Feed Intelligence** section, confirm the AI Scoring toggle is present and changes the subtitle text when toggled.
5. Open full settings and apply a preset pack from Core Filters. Verify the feed updates without a page reload.
6. Context Menu "Zap" test:
   - Right-click any non-critical element (e.g., a sidebar link or group badge).
   - Select "Zap (Hide) Element" from the menu.
   - Confirm the element vanishes and a toast appears with an "Undo" button.
   - Refresh the page and confirm the element stays hidden.
7. Read-Later test:
   - Right-click any Facebook post and select **Save to Read Later** from the PureFusion submenu.
   - Open the popup and confirm the Read-Later badge count has incremented.
   - Click "View Queue" and confirm the saved item appears in Settings → Keyword Filters with thumbnail, author, and snippet.
8. Keyword filter reproducibility test:
   - In Options → Keyword Filters, add a visible word from a feed post into the Blocklist.
   - Save and confirm matching posts collapse behind the filter overlay.
9. Insight Chip test:
   - With AI Scoring enabled, scroll the feed and observe the compact Insight Chip on posts.
   - Click "Details" on a chip to expand the panel — confirm score, content type, and Quick Actions are visible.
   - Click "Block source" and confirm the post hides immediately.
   - Open Settings → Keyword Filters → AI Source Manager and confirm the blocked author appears in the Blocked Sources list.
10. Post Age Filter test:
    - In Options → Core Filters, set "Hide posts older than" to 24 h.
    - Refresh Facebook — posts older than 24 hours should be hidden.
    - Set the filter back to Off and confirm hidden posts are restored.
11. Marketplace Local Filter test:
    - Open `https://www.facebook.com/marketplace/` — confirm the PureFusion distance filter overlay appears.
    - Set Max Distance to 10 miles — confirm listings beyond that distance are hidden.
    - Enable "Hide unknown distance" and confirm listings with no distance label are hidden.
12. Open Messenger (`https://messenger.com`) and verify:
    - Message timestamps are visible without hovering (if enabled in Settings → Social).
    - "Mark All Read" button appears in the chat list header (if enabled).
    - The conversation filter bar appears above the inbox (if enabled).
    - Ghost Mode options work: seen receipts hidden, typing indicator hidden, privacy blur.
13. Optional AI test:
    - In Options → AI Engine, choose Gemini or OpenAI and save.
    - Allow the optional host permission prompt.
    - Trigger TL;DR on a feed post or Rewrite / Smart Replies in the Messenger composer.

---

## Permission Justifications

- `storage`
  - Saves user preferences, filter rules, keyword lists, AI engagement history, blocked/trusted source lists, Read-Later queue, and all extension settings.
- `declarativeNetRequest`
  - Applies lightweight network-level filtering for known tracker patterns.
- `contextMenus`
  - Powers the right-click "Zap (Hide) Element" and "Save to Read Later" features that let users instantly act on any page element.
- Host permission `*://*.facebook.com/*`
  - Required to read and modify Facebook feed DOM for user-selected filters and AI scoring.
- Host permission `*://*.messenger.com/*`
  - Required to apply Messenger privacy controls and optional composer AI tools.
- Optional host `https://api.openai.com/*`
  - Only requested when the user enables the OpenAI provider in Settings → AI Engine.
- Optional host `https://generativelanguage.googleapis.com/*`
  - Only requested when the user enables the Gemini provider in Settings → AI Engine.

---

## Remote Code Usage

- Are you using remote code? **No.**

PureFusion ships bundled local scripts only. AI requests are direct provider API calls using user-provided keys sent from the user's own browser.

---

## Data Usage and Privacy Disclosure

- Data collected by developer: **None.**
- Telemetry: **None.**
- API keys: stored locally on device only (`chrome.storage.local`), never transmitted.
- AI engagement history: stored locally in `chrome.storage.local`, never leaves the device.
- Blocked/trusted source lists: stored locally in `chrome.storage.local`.
- Read-Later queue: stored locally in `chrome.storage.local`, never transmitted.
- AI payloads: sent directly from the user's browser to their selected provider endpoint using their own key.

---

## Privacy Policy URL

Use your published URL for `PRIVACY_POLICY.md` (for example, the GitHub raw URL on your default branch).
