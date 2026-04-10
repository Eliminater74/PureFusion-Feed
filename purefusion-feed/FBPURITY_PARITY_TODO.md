# F.B. Purity Parity TODO (Living Plan)

Last updated: 2026-04-10

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
- Status: initial implementation complete (safe mode, disabled by default).
- Implemented: custom CSS field, custom font family, custom accent color, custom background.
- Keep disabled by default and sandboxed to avoid layout breakage.

4) Broader multilingual phrase packs (medium)
- Improve rule coverage across additional locales and synonym variants.

5) Rule diagnostics panel (medium)
- Status: initial implementation complete.
- Implemented: optional in-page diagnostics overlay with per-reason hide counters and optional verbose console mode.
- Added: live settings-sync telemetry (sync count, resweep count, follow-up pass count, and last-sync timestamps).
- Added: observer workload timing (batch count, records/nodes, avg/peak batch ms, last batch summary).
- Added: one-click diagnostics snapshot export (JSON) from the overlay.
- Added: rolling observer spike history ring buffer (last 10 warning/severe batches).
- Added: threshold-based severity highlighting in diagnostics (OK/Warn/Severe).
- Added: user-configurable observer spike thresholds in Diagnostics settings (warn/severe for ms, nodes, records).
- Added: mini observer workload trend sparkline (rolling window with warn/severe guide lines).
- Added: quick-reset actions in diagnostics overlay (clear observer history, reset all counters).
- Added: optional copy-to-clipboard action for diagnostics snapshot JSON (with fallback copy path).
- Added: optional compact diagnostics overlay mode for smaller screens.
- Added: draggable diagnostics overlay position with persisted placement.
- Added: per-minute observer batch rate metric in diagnostics header.
- Next: pivot back to non-diagnostics roadmap items (per-surface controls or smart feed scoring polish).

6) Per-surface controls (medium)
- Separate behavior for Home feed vs Groups vs Watch vs Marketplace surfaces.
- Status: initial implementation complete.
- Implemented: optional per-surface scope toggle with independent application switches for Home, Groups, Watch, Marketplace, and Other surfaces.

7) Auto comment preview v2 (medium)
- Expand first comment batch inline for visible posts only.
- Use IntersectionObserver + guarded click strategy to avoid opening full post pages.
- Add rate limiting and per-post retry cap to avoid bot-like behavior.
- Keep OFF by default and expose as an explicit advanced toggle.

8) Smart feed quality scoring (medium-high)
- Detect likely ragebait/engagement bait/low-value repost patterns and assign a quality score.
- Use score thresholds to collapse/dim/hide posts.
- Keep transparent with "why hidden" reasons.
- Status: polish slice started.
- Added: user controls for low/high score thresholds and optional score-reason hints on PF score badges.
- Added: optional low-score post collapsing with one-click reveal chip.
- Added: local credibility-signal heuristics (suspicious-claim warnings + optional strict penalty mode).
- Added: expandable "Why flagged" details panel on credibility warnings.
- Added: one-click "Verify this claim" web search action from credibility details panel.
- Added: source-domain trust hints (recognized source / unverified domain / short-link warnings).
- Added: optional credibility debug preview chip to show detector status on scanned posts.

9) Feed mode presets (high)
- Status: initial implementation complete.
- Implemented: persistent mode selector with Custom, Clean, Focus, Smart, Classic.
- Scope mode behavior to existing filters + predictions + keyword rules.
- Keep mode switching instant and reversible.

10) Performance layer (high)
- Mutation batching and pre-filter passes before expensive processing.
- Aggressive caps to avoid repeated scans of the same nodes.
- Maintain low CPU budget on long sessions.

11) Reels control v2 (medium)
- Status: initial implementation complete.
- Implemented: optional Reels session limiter with threshold and hard-lock mode.
- Keep current hide toggle and continue tuning detection reliability.

12) Rule engine for power users (medium)
- Simple IF/THEN rules over post metadata/text.
- Start with safe operators and local-only evaluation.

13) Plugin SDK spike (low-medium)
- Define extension-safe plugin hooks for custom filters and post scoring modules.
- Gate behind developer mode first.

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
- Expand with optional preset snippets and finer variable controls.

4) Diagnostics mode
- Add optional debug toggle and small overlay/log panel.

5) Auto comment preview v2 hardening
- Restrict to safe inline triggers and avoid modal/page navigation links.
- Add cooldown between auto-click actions.
- Add per-surface allow/deny list (Home yes, Notifications no by default).

6) Feed mode presets + quality scoring
- Add mode selector in UI and map to internal setting bundles.
- Implement first-pass quality score heuristics with explicit reason labels.

7) Performance pass
- Add mutation batching, debounce windows, and skip markers for processed nodes.
- Track observer workload metrics in diagnostics mode.

8) Reels session limiter
- Add optional counter and soft lock after user-defined threshold.
- Add optional on-screen "Reels locked" panel with resume action.

9) Power-user rule engine spike
- Implement MVP parser for IF/THEN post rules and evaluate performance impact.

## Safety Rules (Do Not Remove)

- Never hide structural containers: `html`, `body`, `role=main`, `role=feed`, `role=banner`, `role=navigation`, `role=complementary`.
- Keep panic recovery and recovery watchdog active.
- Keep feature master toggles default OFF for new risky modules until validated.
- Prefer strict selectors and short heading/aria/href anchors over broad full-text sweeps.
- Keep all advanced AI/behavior features local-first and transparent for policy safety.

## Red-Team Notes (Helpful vs Risky)

- Helpful now: feed mode presets, quality scoring, performance batching, reels limiter, diagnostics.
- Helpful later: rule engine, plugin SDK.
- Risky/policy-sensitive (defer): deep "shadow profile" estimation and anything that implies hidden account inference.

## Regression Checklist Per Feature Slice

1) Feed does not blank on first load.
2) Scroll and new node injection still work.
3) Toggle OFF restores content behavior.
4) Toggle ON affects only intended module/type.
5) Messenger surface remains unaffected unless feature is Messenger-specific.
