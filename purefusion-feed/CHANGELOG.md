# Changelog

All notable changes to PureFusion Feed are documented in this file.

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
