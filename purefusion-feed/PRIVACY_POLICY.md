# Privacy Policy

**Last Updated: April 2024**

This Privacy Policy describes how "PureFusion Feed" (the "Extension") handles your personal data. By installing and using the Extension, you agree to the practices outlined below.

## 1. Information We Collect
**Nothing.** 

PureFusion Feed operates under a strict zero-telemetry, local-first architecture. We do not collect, harvest, store, or transmit any personally identifiable information, browsing history, or interaction data to any external servers.

## 2. API Keys & Third-Party AI Services
If you choose to use the "Advanced AI Blockers" or "Deep Intelligence Server" features, you will be required to provide your own API keys (e.g., OpenAI API Key or Google Gemini API Key).
- Your keys are stored securely on your local device using `chrome.storage.local`.
- These keys are never transmitted to the developers of PureFusion Feed.
- When an AI feature is triggered (e.g., clicking the Summarize button), the text of that specific post is securely transmitted *directly* from your browser to the provider you selected (OpenAI/Google). Their respective Privacy Policies apply to that transmission.

## 3. Chrome Web Store Requirements
This extension requires the following permissions to function:
- `storage`: Required to save your customized dashboard settings and API credentials locally.
- `declarativeNetRequest`: Required to block network requests associated with known tracking or advertising domains.
- `scripting`: Required to inject the PureFusion engine and visual themes directly into `facebook.com`.
- `alarms`: Used to trigger scheduled wellbeing features and notification digests.

## 4. Host Permissions
The extension requests broad host permissions for `*://*.facebook.com/*` and `*://*.messenger.com/*`. 
This is strictly necessary to allow the content scripts to read and modify the DOM (Document Object Model) of those websites, enabling features like ad removal, layout restructuring, and post restyling.

## 5. Contact Us
If you have any questions or concerns about this Privacy Policy, please open an issue on the official GitHub repository.
