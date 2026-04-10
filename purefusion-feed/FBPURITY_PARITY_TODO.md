# F.B. Purity Parity TODO (Living Plan)

Last updated: 2026-04-09

## Goal

Track the feature gap between F.B. Purity and PureFusion Feed, keep a clear implementation plan, and avoid losing context between commits.

## Stability Anchors

- Known stable checkpoint from user: `63e715064fa88ae83dd78a74a6385860ba5ddc9f`
- Rule for risky work: ship new filters behind safe-mode/master toggles first, then harden selectors before enabling by default.

## Parity Snapshot

Status key: DONE = implemented and working, WIP = implemented but still being hardened, TODO = not implemented yet.

1) Story/activity post filters (friend activity style clutter)
- FBP parity need: hide "became friends", "joined group", "liked/commented", event/memory style activity posts.
- PureFusion status: WIP (core done, expanded pack added and hardening continues).
- Notes: uses header-signal matching + safety bailouts in cleaner.
- Added in expanded pack: profile/cover photo updates, life events, check-ins, milestones, job/work updates, relationship updates, group activity posts.

2) Granular navigation/sidebar module controls
- FBP parity need: fine-grained left/right module hides (not one giant sidebar kill switch).
- PureFusion status: WIP (safe mode).
- Notes: module-level toggles are implemented with master enable; selector paths still being tightened per-module over time.

3) Top header micro-controls
- FBP parity need: granular top bar icon controls without hiding the header shell.
- PureFusion status: WIP (safe mode).
- Implemented: master toggle + per-icon toggles (Home, Friends, Watch, Marketplace, Groups, Messenger, Notifications, Menu, Create).

4) Notification popup filtering
- FBP parity need: hide low-value notification categories.
- PureFusion status: DONE.
- Implemented: games, birthdays, marketplace, algorithmic engagement nags.

5) Search popup suppression
- FBP parity need: suppress trending/recent/typeahead noise.
- PureFusion status: DONE.
- Implemented: hide all suggestions, hide trending suggestions, hide recent section.

6) Image subject filtering (classification-like)
- FBP parity need: hide image-heavy categories based on image descriptors.
- PureFusion status: WIP (safe mode).
- Implemented categories: sports, food, pets, vehicles, memes/screenshots, travel/scenery.

## Remaining Major Gap Areas

1) Expanded post-type filters (high priority)
- Status: initial implementation complete; continue tuning selectors/phrases per locale.
- Add dedicated toggles for: profile picture updates, cover photo updates, life events, check-ins, milestones, job/work updates, relationship updates, group activity variants.

2) Top header micro-controls (high priority)
- Status: initial implementation complete; continue tightening per-locale aria label mapping.
- Granular controls for top bar modules and jewels (without hiding banner/header containers).

3) Advanced custom UI engine (medium-high)
- User custom CSS field.
- Font override, color variables, optional background/image overrides.
- Keep disabled by default and sandboxed to avoid layout breakage.

4) Broader multilingual phrase packs (medium)
- Improve rule coverage across additional locales and synonym variants.

5) Rule diagnostics panel (medium)
- Add optional debug mode to show which rule hid each item and count actions per rule.

6) Per-surface controls (medium)
- Separate behavior for Home feed vs Groups vs Watch vs Marketplace surfaces.

## Implementation Order (Next)

1) Post-type filter pack v2
- Add new toggle group in Core Filters.
- Implement strict per-type selectors + phrase anchors.
- Keep global safety bailout active.

2) Header/top-nav controls
- Add safe-mode master toggle + per-item toggles.
- Only allow compact item-level hides, never hide `role=banner`.
- Validate icon mapping across account locales and alternate nav layouts.

3) Custom UI engine (experimental)
- Add "Advanced Custom CSS" textarea with clear warning.
- Validate and apply CSS in isolated style tag.

4) Diagnostics mode
- Add optional debug toggle and small overlay/log panel.

## Safety Rules (Do Not Remove)

- Never hide structural containers: `html`, `body`, `role=main`, `role=feed`, `role=banner`, `role=navigation`, `role=complementary`.
- Keep panic recovery and recovery watchdog active.
- Keep feature master toggles default OFF for new risky modules until validated.
- Prefer strict selectors and short heading/aria/href anchors over broad full-text sweeps.

## Regression Checklist Per Feature Slice

1) Feed does not blank on first load.
2) Scroll and new node injection still work.
3) Toggle OFF restores content behavior.
4) Toggle ON affects only intended module/type.
5) Messenger surface remains unaffected unless feature is Messenger-specific.
