# Chrome Web Store Listing Package - PureFusion Feed v1.4.0

Use this file as copy-ready content for your Chrome Web Store submission.

## Product Details

### Summary (max 150 chars)
Clean up Facebook and Messenger with smart feed filters, privacy controls, and optional BYOK AI tools for summaries and replies.

### Description

PureFusion Feed helps you take back control of Facebook and Messenger.

Core value:
- Remove sponsored and suggested clutter.
- Customize feed behavior with presets and advanced filters.
- Keep settings privacy-first with local key storage.
- Add optional BYOK AI features only when you enable them.

What PureFusion includes:

1) Feed cleanup and focus controls
- Blocks sponsored posts and noisy recommendations.
- Hides reels, stories, and selected sidebar components.
- Includes keyword blocklist/autohide with allowlist support.
- Adds quick presets (Work Focus, Friends Only, Minimal, News Heavy, Messenger Privacy).

2) User-safe control surface
- Popup quick toggles for common actions.
- Full options dashboard with import/export.
- Undo chips for hidden posts, including one-click source allowlisting.

3) Optional AI (BYOK)
- Post TL;DR and smart comment assistance.
- Messenger draft rewrite and smart replies.
- AI host permissions are optional and requested only if a provider is enabled.

4) Messenger privacy tools
- Hide seen receipts.
- Hide typing indicators.
- Privacy blur mode.

5) Performance and architecture
- Debounced observer pipeline for dynamic feed updates.
- Uses roles/data attributes where possible for resilient selection.

## Category and Language

- Category: Productivity
- Language: English

## Test Instructions for Reviewers

1. Install extension and open `https://www.facebook.com`.
2. Open extension popup and toggle ad/suggested filters.
3. Open full settings and apply a preset pack from Core Filters.
4. Verify feed updates without page reload.
5. Open Messenger and verify Ghost Mode options (seen/typing/privacy blur).
6. Optional AI test:
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
