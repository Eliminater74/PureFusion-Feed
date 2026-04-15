# Chrome Web Store Listing Package - PureFusion Feed v1.8.0

Use this file as copy-ready content for your Chrome Web Store submission.

## Product Details

### Summary (max 150 chars)
Clean up Facebook and Messenger with smart feed filters, privacy controls, and optional BYOK AI tools for summaries and replies.

### Description

PureFusion Feed helps reduce clutter in Facebook and Messenger with user-controlled filters, privacy options, and optional BYOK AI tools.

What it does:

1) Feed cleanup controls

- Hides suggested posts, recommended groups, and People You May Know injections.
- Hides Reels injected into your feed — toggle is on by default and accurately reflected in the popup.
- Hides Stories bar, Memories posts, and selected recommendation modules.
- Two-level ad blocking: hard infrastructure signal blocker (always on) plus a separate "Hide Sponsored Posts" label-detection toggle you can enable independently.
- Supports a keyword blocklist and allowlist — automatically collapses posts matching words you choose.
- Includes preset packs (Work Focus, Friends Only, Minimal, News Heavy, Messenger Privacy).
- Image subject filters: hide posts by visual content category (sports, food, pets, vehicles, memes, travel) — 9-locale alt-text coverage.

2) Settings and usability

- Popup quick toggles for common filters, including independent Reels and Sponsored Posts controls.
- Full options dashboard with import/export of your configuration.
- Undo chips for hidden posts (show once or always allow a source).
- ⚡ **Power-User Rule Engine**: Create your own persistent CSS or text-matching rules for deep customization.
- ⚡ **Context Menu "Zap"**: Right-click any element on the page to instantly hide it and create a permanent rule with one-click undo support.

3) Multilingual & International Support

- Refined filtering for English, Spanish, French, Portuguese, German, Italian, Dutch, Swedish, Danish, and Norwegian.
- Intelligent "Body Text Guard" ensures legitimate posts with friend interactions aren't accidentally hidden in any language.
- Notification and search popup filtering across all 9 supported locales.

4) Optional AI features (BYOK — Bring Your Own Key)

- TL;DR post summaries and comment-assist tools.
- Messenger composer tools: rewrite draft and generate smart replies.
- AI permissions are only requested when a provider is enabled by you.

5) Messenger privacy tools

- Hide seen receipts.
- Hide typing indicators.
- Privacy blur mode.

Important compatibility note:

- Facebook and Messenger interfaces change frequently. Filter results may vary by account, language, or rollout variant.
- PureFusion does not guarantee removal of every suggested or injected element in every interface variant.

## Category and Language

- Category: Productivity
- Language: English

## Test Instructions for Reviewers

1. Install extension and open `https://www.facebook.com`.
2. Open the extension popup. The **Hide Reels** toggle will be ON by default — Reels trays injected into the feed should already be hidden on page load. Toggle it off and on to confirm live effect.
3. Confirm that recommendation modules (People You May Know, Suggested Groups) are removed from the feed.
4. To test sponsored post label detection: enable the **Hide Sponsored Posts** toggle in the popup (off by default — separate from the Ad Blocker).
5. Open full settings and apply a preset pack from Core Filters.
6. Verify feed updates without page reload.
7. Context Menu "Zap" test:
   - Right-click any non-critical element (e.g., a sidebar link or group badge).
   - Select "Zap (Hide) Element" from the menu.
   - Confirm the element vanishes and a toast appears with an "Undo" button.
   - Refresh the page and confirm the element stays hidden.
8. Keyword filter reproducibility test:
   - In Options -> Keyword Filters, add a visible word from a feed post into Blocklist.
   - Save settings and confirm that matching posts collapse behind the filter overlay.
9. Open Messenger and verify Ghost Mode options (seen receipts hidden, typing indicator hidden, privacy blur).
10. Optional AI test:
   - In Options -> AI Engine, choose Gemini or OpenAI and save.
   - Allow optional host permission prompt.
   - Trigger TL;DR on a feed post or Rewrite/Smart Replies in Messenger composer.

## Permission Justifications

- `storage`
  - Saves user preferences, filter rules, and synced extension settings.
- `declarativeNetRequest`
  - Applies lightweight network-level filtering for known tracker patterns.
- Host permission `*://*.facebook.com/*`
  - Required to read and modify Facebook feed DOM for user-selected filters.
- Host permission `*://*.messenger.com/*`
  - Required to apply Messenger privacy controls and optional composer tools.
- Optional host `https://api.openai.com/*`
  - Only requested when OpenAI provider is enabled by the user.
- Optional host `https://generativelanguage.googleapis.com/*`
  - Only requested when Gemini provider is enabled by the user.

## Remote Code Usage

- Are you using remote code?
  - No.

PureFusion ships bundled local scripts only. AI requests are direct provider API calls using user-provided keys.

## Data Usage and Privacy Disclosure

- Collected data: none by developer.
- Telemetry: none.
- API keys: stored locally on device (`chrome.storage.local`).
- AI payloads: sent directly from user browser to selected provider endpoint.

## Privacy Policy URL

Use your published URL for `PRIVACY_POLICY.md` (for example, GitHub raw URL on your default branch).
