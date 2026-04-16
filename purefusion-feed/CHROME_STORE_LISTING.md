# Chrome Web Store Listing Package — PureFusion Feed v1.9.0

Use this file as copy-ready content for your Chrome Web Store submission.

---

## Product Details

### Summary (max 150 chars)

Clean up Facebook with smart feed filters, AI post scoring, source blocklist/allowlist, and optional BYOK AI tools — all local and private.

### Description

PureFusion Feed gives you full control over your Facebook feed. It removes clutter, scores posts by relevance using on-device AI, and lets you permanently block or trust sources — all without sending any data outside your browser.

---

### 1. Feed Cleanup

- Removes Suggested Posts, People You May Know, and Group injection modules
- Removes Reels trays injected into your feed — toggle on by default, accurately reflected in the popup
- Removes Stories bar, Memories posts, and Page Suggestion modules
- Ad blocker removes feed ads using infrastructure signals (zero false positives)
- Separate sponsored post detection using label-heuristic scanning
- Keyword blocklist automatically collapses posts matching words you choose
- Image subject filters: hide posts by visual content category (sports, food, pets, vehicles, memes, travel) — 9-locale alt-text coverage

### 2. AI Feed Scoring and Classification

- On-device AI engine scores every post by predicted relevance based on your own engagement history — no cloud, no API key required
- Content Classification (Model F): identifies Political, Opinion, News, Commercial, and Emotional content using word-boundary-accurate token matching
- Ragebait and Engagement Bait detection flags manipulation patterns directly on each post
- Credibility signals with one-click verification search links
- Insight Chip: a compact per-post panel showing score, content type, tone, and confidence rating
- Classification row shows content type and tone badges inline on each chip

### 3. Source Control

- Permanent Author Blocklist: block any source to hide all their posts across every page load — stored in local storage, managed from the popup and the full settings Source Manager
- Trusted Sources Allowlist: mark sources as always-show, making them immune to session content filters
- Session Content Filters: "Hide similar posts" hides all posts of the same content type for the current session — one click from the Insight Chip
- Quick Actions in every Insight Chip: Hide similar posts · Always show source · Block source
- AI Source Manager in Settings → Keyword Filters: view, add, and remove all blocked and trusted authors in one place

### 4. Popup Feed Intelligence

- AI Scoring toggle directly accessible from the popup — no need to open Full Settings
- Live session stats: real counts of ads blocked and spam hidden since the page loaded
- Live counts of blocked and trusted sources shown in the popup
- "Manage Sources" link opens the Source Manager directly

### 5. Settings and Usability

- Popup quick toggles for common filters
- Full options dashboard with import/export of your configuration
- Undo chips for hidden posts (show once or always allow a source)
- Feed Mode Presets: Clean / Focus / Ultra Fast / Smart / Classic — one-click feed personality
- Power-User Rule Engine: create your own persistent CSS or text-matching rules
- Context Menu "Zap": right-click any element to instantly hide it with one-click undo

### 6. Multilingual and International Support

- 9-locale filtering coverage: English, Spanish, French, German, Italian, Dutch, Swedish, Danish, Norwegian
- All filter paths, notification controls, and search popup suppression cover all 9 locales
- Intelligent Body Text Guard prevents legitimate posts from being accidentally hidden in any language

### 7. Marketplace Local Filter

- Distance-based listing filter — set a max distance in miles to hide listings outside your area
- Works with both "X miles away" and "X km away" listing labels (auto-converts)
- Local pickup listings are treated as zero distance and always shown
- Local-first sort reorders matching results to surface nearby deals at the top
- Hide unknown distance listings option — for a strictly local-only view
- Compact overlay panel injected directly on the Marketplace page with a live preview of your distance setting

### 8. Optional AI Features (BYOK — Bring Your Own Key)

- TL;DR post summaries and comment-assist tools
- Messenger composer tools: rewrite draft and generate smart replies
- AI permissions only requested when a provider is enabled by you
- Supports Chrome's built-in Gemini Nano (fully offline, no key needed) or free Google Gemini API

### 9. Messenger Enhancements

- Always-visible message timestamps — see exact send times without hovering
- Mark All Read button — clears all unread badges in one click from the chat list
- Conversation filter bar — instantly filter your inbox to show only Unread, Direct, or Group conversations
- Unsend detection — notifies you when a message you received is deleted by the sender
- Hide seen receipts, typing indicators, and privacy blur mode

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
2. Open the extension popup. The **Hide Reels** toggle will be ON by default — Reels trays injected into the feed should already be hidden on page load. Toggle it off and on to confirm live effect.
3. Confirm that recommendation modules (People You May Know, Suggested Groups) are removed from the feed.
4. In the popup **Feed Intelligence** section, confirm the AI Scoring toggle is present and changes the subtitle text when toggled.
5. Open full settings and apply a preset pack from Core Filters.
6. Verify feed updates without page reload.
7. Context Menu "Zap" test:
   - Right-click any non-critical element (e.g., a sidebar link or group badge).
   - Select "Zap (Hide) Element" from the menu.
   - Confirm the element vanishes and a toast appears with an "Undo" button.
   - Refresh the page and confirm the element stays hidden.
8. Keyword filter reproducibility test:
   - In Options → Keyword Filters, add a visible word from a feed post into the Blocklist.
   - Save settings and confirm matching posts collapse behind the filter overlay.
9. Insight Chip test:
   - With AI Scoring enabled, scroll the Facebook feed and observe the compact Insight Chip on posts.
   - Click "Details" on a chip to expand the panel — confirm score, content type, and Quick Actions are visible.
   - Click "Block source" and confirm the post hides immediately.
   - Open Settings → Keyword Filters → AI Source Manager and confirm the blocked author appears in the Blocked Sources list.
10. Marketplace Local Filter test:
    - Open `https://www.facebook.com/marketplace/` — confirm the PureFusion distance filter overlay appears.
    - Set Max Distance to 10 miles — confirm listings beyond that distance are hidden.
    - Enable "Hide unknown distance" and confirm listings with no distance label are hidden.
11. Open Messenger (`https://messenger.com`) and verify:
    - Message timestamps are visible on each bubble without hovering (if enabled).
    - "Mark All Read" button appears in the chat list header (if enabled).
    - The conversation filter bar appears above the inbox (if enabled).
    - Ghost Mode options work: seen receipts hidden, typing indicator hidden, privacy blur.
12. Optional AI test:
    - In Options → AI Engine, choose Gemini or OpenAI and save.
    - Allow the optional host permission prompt.
    - Trigger TL;DR on a feed post or Rewrite / Smart Replies in the Messenger composer.

---

## Permission Justifications

- `storage`
  - Saves user preferences, filter rules, keyword lists, AI engagement history, blocked/trusted source lists, and synced extension settings.
- `declarativeNetRequest`
  - Applies lightweight network-level filtering for known tracker patterns.
- `contextMenus`
  - Powers the right-click "Zap (Hide) Element" feature that lets users instantly hide any page element.
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
- AI payloads: sent directly from the user's browser to their selected provider endpoint using their own key.

---

## Privacy Policy URL

Use your published URL for `PRIVACY_POLICY.md` (for example, the GitHub raw URL on your default branch).
