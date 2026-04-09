# Chrome Web Store Listing Package - PureFusion Feed v1.4.0

Use this file as copy-ready content for your Chrome Web Store submission.

## Product Details

### Summary (max 150 chars)
Clean up Facebook and Messenger with smart feed filters, privacy controls, and optional BYOK AI tools for summaries and replies.

### Description

PureFusion Feed helps reduce clutter in Facebook and Messenger with user-controlled filters, privacy options, and optional BYOK AI tools.

What it does:

1) Feed cleanup controls
- Hides many sponsored and suggested feed injections.
- Hides reels/stories and selected recommendation modules.
- Supports keyword blocklist/autohide plus allowlist and never-hide sources.
- Includes preset packs (Work Focus, Friends Only, Minimal, News Heavy, Messenger Privacy).

2) Settings and usability
- Popup quick toggles for common filters.
- Full options dashboard with import/export.
- Undo chips for hidden posts (show once / always allow source).

3) Optional AI features (BYOK)
- TL;DR summaries and comment-assist tools.
- Messenger composer tools: rewrite draft and generate smart replies.
- AI permissions are requested only when a provider is enabled.

4) Messenger privacy tools
- Hide seen receipts.
- Hide typing indicators.
- Privacy blur mode.

Important compatibility note:
- Facebook and Messenger interfaces change frequently. Some filter results can vary by account, language, or rollout variant.
- PureFusion does not guarantee removal of every sponsored or suggested element in every interface variant.

## Category and Language

- Category: Productivity
- Language: English

## Test Instructions for Reviewers

1. Install extension and open `https://www.facebook.com`.
2. Open extension popup and toggle ad/suggested filters.
3. Open full settings and apply a preset pack from Core Filters.
4. Verify feed updates without page reload.
5. Keyword filter reproducibility test:
   - In Options -> Keyword Filters, add a visible word from a feed post into Blocklist.
   - Save settings and confirm that matching posts collapse behind the filter overlay.
6. Sponsored filter reproducibility test:
   - Keep default Ad filter enabled.
   - Scroll feed and confirm posts labeled "Sponsored" are hidden when detected.
7. Open Messenger and verify Ghost Mode options (seen/typing/privacy blur).
8. Optional AI test:
   - In Options -> AI Engine, choose Gemini or OpenAI and save.
   - Allow optional host permission prompt.
   - Trigger TL;DR on feed or Rewrite/Smart Replies in Messenger composer.

## Permission Justifications

- `storage`
  - Saves user preferences, filter rules, and synced extension settings.
- `declarativeNetRequest`
  - Applies lightweight network-level filtering for known ad/tracker patterns.
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
