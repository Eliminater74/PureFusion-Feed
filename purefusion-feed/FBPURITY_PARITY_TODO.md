# PureFusion Feed — Parity Roadmap

Last updated: 2026-04-14

---

## Definition of Done (DoD)

- Feature works on fresh page load.
- Survives infinite scroll and React-driven node injections.
- Master toggle is fully reversible (content restores on OFF).
- Messenger surface remains unaffected unless specifically targeted.
- Roadmap documentation updated with latest status.

---

## Current Focus (DO NOT SKIP)

Always continue from the highest-priority unfinished item. Do not jump ahead.

**Completed phases (most recent first):**

- ✅ Phase 32: Sponsored Toggle-OFF Restoration + Popup Wiring (`_restoreCriticalContainers` handles `'Ad (Hard Signal)'` + `'Sponsored Post (Label Heuristic)'` + legacy `'Sponsored Post (Heuristic)'` reason strings; browser popup gains `tgl_removeSponsored` secondary row in Ad Blocker section; popup.js reads/writes `filters.removeSponsored`)
- ✅ Phase 31: Sponsored/Ads Split — Full Surface Wiring (options page `opt_filters_removeSponsored` + `uiMap` entry; popup "Ad Blocker" title + description updated; i18n keys updated EN+ES; popup.js `removeSponsored` preservation comment)
- ✅ Phase 30: Sponsored Label Detection Hardening (`_isSponsoredLabel` mid-string/endsWith patterns; `_findSponsoredMarkerInPost` 260→400px / 32→48 char thresholds; `aria-describedby` scan added; `[role="link"]` aria-label selectors; `adabouturl` + lowercase `_cft_%5b0%5d` URL patterns)
- ✅ Phase 29: Image Subject Filter Hardening (FR/DE/IT/NL/SV/DA/NO tokens for all 6 categories; false-positive audit removes 'outdoor'+'building' from travel; prefix-stripping regex expanded for all 9 locales)
- ✅ Phase 28: Granular Sidebar Hardening (position-aware `_resolveRightSidebarContainer`; all heading/aria-label tokens expanded to 9 locales for Trending/Contacts/Events/Birthdays; `_hasShortcutsHeading` 9-locale; `_looksLikeContactsModule` 9-locale)
- ✅ Phase 27: UI Tweaks — Unimplemented Settings Activation (fontSizeScale CSS, anonymizerMode hover-reveal blur, disableCommentAutofocus guard)
- ✅ Phase 26: Notification + Search Popup Full Locale Expansion (FR/DE/IT/NL/SV/DA/NO for all 4 notif categories + search input selectors + trending/recent tokens)
- ✅ Phase 25: Memories Filter + Messenger Lifecycle Guard (removeMemoriesPosts; toggle-OFF reversal; messenger-main lifecycle guard)
- ✅ Phase 24: Content Script Lifecycle Hardening (chrome.runtime.connect port guard; destroy() on all modules with intervals/observers)
- ✅ Phase 23: Sponsored Detection Locale Completion (NL/SV/DA/NO aria-label selectors; token-driven right-rail text scan)
- ✅ Phase 22: Options UI Hardening & Locale Settings (filterLocale setting; locale-aware gate filters; i18n orphan fixes)
- ✅ Phase 21: Post-type Filter Tuning (NL/SV/DA/NO locale expansion; gate filter diacritic correctness hardened)
- ✅ Phase 20: Visual Polish & Theme Expansion (AMOLED refined; Pastel added; Insight Chip propagation)
- ✅ Phase 19: Filter Logic Consolidation (shared helpers; duplicate filter removal; locale token merge)
- ✅ Phase 18: Performance Pass (Chunked Cleaning + Skip Markers)
- ✅ Phase 17: Auto Comment Preview v3.0 (DOM injection strategy — shell injection DONE; v3.1 real data deferred)
- ✅ Phase 16: Multilingual & Story Hardening (NL/SV/DA/NO + Body Text Guard)
- ✅ Phase 15: Context Menu "Zap" (Instant rules + Undo support)
- ✅ Phase 13: Power-User Rule Engine (Selector + Text logic)

**Do NOT jump ahead to:**

- Auto Comment Preview v3.1 (needs explicit go decision)
- Plugin SDK (needs explicit go decision)
- Non-critical UI cleanup

---

## Last Action Log

- **Last completed (2026-04-14):** Phase 32 — Sponsored Toggle-OFF Restoration + Popup Wiring. `_restoreCriticalContainers`: added three reason-string guards before the bail-out check — restores `'Ad (Hard Signal)'` nodes when `removeAds` is OFF; restores `'Sponsored Post (Label Heuristic)'` and legacy `'Sponsored Post (Heuristic)'` nodes when `removeSponsored` is OFF. Fixes DoD regression rule #3 (toggle-OFF must restore content). Browser popup: added secondary `pf-ad-blocker-row` for `tgl_removeSponsored` with 🔍 icon; `popup.js` maps it into `elements.sponsored`, adds it to `quickToggles`, reads initial state from `filters.removeSponsored`, and writes it back in `handleToggle`. i18n: `popup_hide_sponsored_posts` + `_desc` keys added EN+ES.
- **Prior (2026-04-14):** Phase 31 — Sponsored/Ads Split Full Surface Wiring. `options.html`: added `opt_filters_removeSponsored` row (label: "Hide Sponsored Posts (label detection)") immediately after `opt_filters_removeAds`. `options.js` `uiMap`: added `opt_filters_removeSponsored → filters.removeSponsored`. `popup.html`: "Sponsored Ad Blocker" → "Ad Blocker"; default desc updated. `popup.js`: `updateAdBlockerUI` status strings updated to reflect hard-signal scope; added comment preserving `removeSponsored` through the save handler. i18n EN+ES: updated `popup_block_sponsored/desc`, `popup_ad_blocker_on/off`, added `options_filters_removeAds` + `options_filters_removeSponsored` keys.
- **Prior (2026-04-14):** Phase 30 — Sponsored Label Detection Hardening. `_isSponsoredLabel`: added `endsWith(' token')`, `endsWith(' · token')`, `includes(' · token ·')`, `includes(' · token')` — catches FB patterns where "Sponsored" is a suffix or mid-string item (e.g. "Page · Sponsored · Follow"). `_findSponsoredMarkerInPost`: height threshold 260→400px (tall posts push label below old limit); text length limit 32→48 chars (allows "Sponsored · 3h ago" combined nodes); element scope expanded to include `[role="link"]` and all `a` elements. `_removeSponsoredByLabels`: added `aria-describedby` scan (multi-ID aware) alongside existing `aria-labelledby`. `sponsoredIndicators`: added `[role="link"][aria-label*=…]` for all 9 locales; added `adabouturl` href; added lowercase `_cft_%5b0%5d` encoding variant. `_removeAdsByHardSignals`: same `adabouturl` + lowercase `_cft_` additions.
- **Prior (2026-04-14):** Phase 29 — Image Subject Filter Hardening. All 6 image categories (sports/food/pets/vehicles/memes/travel) expanded from EN+ES to full 9-locale coverage in `selector-map.js imageSubjectTokens`. Removed `'outdoor'` and `'building'` from travel tokens (false-positive audit: food photos taken outdoors and any building photo were incorrectly triggering travel filter). Fixed alt-text prefix-stripping regex in `applyImageSubjectFilters` to handle FR (`contenir`), DE (`enthalten`), IT (`contenere`), NL (`bevatten`), SV (`innehålla`), DA (`indeholde`), NO (`inneholde`) — without this fix, non-English FB UI alt text passed the raw prefix through to token matching, causing misses. Updated regex separator to `\s*:\s*` to handle French typographic space-before-colon convention.
- **Prior (2026-04-14):** Phase 28 — Granular Sidebar Hardening. Replaced naive `document.querySelector('[role="complementary"]')` first-match with `_resolveRightSidebarContainer(rootNode)`: filters all complementary panels to those whose left edge exceeds 50% viewport width, width 100–560px, height > 200px, sorted rightmost-first — correctly targets FB's main sidebar when chat panel is also present. Expanded `_hasShortcutsHeading` from EN+ES to all 9 locales (EN/ES/FR/DE/IT/NL/SV/DA/NO). Expanded all right sidebar heading/aria-label token arrays (Trending, Contacts, Events, Birthdays) to 9 locales. Expanded `_looksLikeContactsModule` aria-label selector string, heading Set, and body-text token array to all locale variants.
- **Prior (2026-04-14):** Phase 27 — UI Tweaks Unimplemented Settings Activation. `fontSizeScale` (80–150): generates `html { font-size: N% }` when not 100; only fires when in range and non-default. `anonymizerMode`: CSS blur (8px imgs, 5px author name links) with hover-reveal transition; scoped to article/complementary/navigation. `disableCommentAutofocus`: capture-phase focus listener tracks last mousedown target; blurs programmatic textbox focus via microtask. All three were wired in options.html/js but had zero content-script implementation.
- **Prior (2026-04-14):** Phase 26 — Notification + Search Popup Full Locale Expansion. All 4 notification filter categories and all search popup detection paths expanded to FR/DE/IT/NL/SV/DA/NO.
- **Prior (2026-04-14):** Phase 25 — Memories Filter + Messenger Lifecycle Guard. `removeMemoriesPosts()`: primary href signal + multi-locale text fallback; toggle-OFF reversal in `_restoreCriticalContainers`. Messenger runtime got `_startLifecycleGuard()` + `_destroy()`.
- **Prior (2026-04-14):** Phase 24 — Content Script Lifecycle Hardening. `_startLifecycleGuard()` in main.js; `_destroy()` covers PF_Observer, PF_Cleaner, PF_NotificationControls, PF_InPageUI, PF_MessengerAI.
- **Prior (2026-04-14):** Phase 23 — Sponsored Detection Locale Completion. NL/SV/DA/NO `sponsoredIndicators` selectors; `removeRightRailAds` driven by `sponsoredTokens` array.

---

## Stability Anchors

- Known stable checkpoint: `63e715064fa88ae83dd78a74a6385860ba5ddc9f`
- Rule for risky work: ship new filters behind safe-mode/master toggles first; harden selectors before enabling by default.

---

## Parity Snapshot

Status key: **DONE** = complete and stable | **DONE+** = complete but intentionally expandable | **DEFERRED** = decided not to pursue yet

| Feature Area | Status | Notes |
| --- | --- | --- |
| Story/activity post filters | DONE | All 14 subtypes wired |
| Granular sidebar module controls | DONE | Position-aware resolver + 9-locale heading tokens for all left/right modules |
| Top header micro-controls | DONE | Per-icon toggles + Notification Soul-Soother jewel styles |
| Notification popup filtering | DONE | Games, birthdays, marketplace, engagement — all 9 locales |
| Search popup suppression | DONE | All suggestions / trending / recent — all 9 locales |
| Image subject filtering | DONE | 6 categories; 9-locale alt-text tokens; false-positive audit complete |
| Auto comment preview v3.0 (shell injection) | DONE+ | Placeholder shell; MutationObserver guard — v3.1 real data deferred |
| Smart feed quality scoring | DONE | Ragebait/credibility/engagement-bait; insight chips; score thresholds |
| Feed mode presets | DONE | Custom/Clean/Focus/Ultra Fast/Smart/Classic |
| Performance layer | DONE | Observer queue caps; pipeline budget slicing; serialized resweeps |
| Reels limiter v2 | DONE | Session limiter + hard-lock mode |
| Power-User Rule Engine & Zap | DONE | Selector + text rules; context-menu Zap + Undo |
| Daily Feed Report | DONE | Session + weekly report; Alt+Shift+R; in-page panel |
| Right-click quick filter | DONE | Teach PureFusion context menu; blocklist/allowlist/source actions |
| Multilingual phrase packs | DONE | EN/ES/FR/DE/IT/NL/SV/DA/NO across all filter paths |
| Content script lifecycle | DONE | Port-disconnect guard; destroy() on all interval/observer modules |
| UI tweaks (font/anon/autofocus) | DONE | fontSizeScale, anonymizerMode, disableCommentAutofocus all active |
| Sponsored post detection | DONE+ | Hard-signal + label-heuristic split; iterating detection coverage |
| Auto comment preview v3.1 (real data) | DEFERRED | GraphQL interception — ToS-adjacent; needs explicit go decision |
| Plugin SDK | DEFERRED | Extension plugin hooks — low priority; after core is stable |

---

## Remaining Work (Priority Order)

### Deferred — Auto Comment Preview v3.1 — Real Comment Data

v3.0 shell injection is DONE. v3.1 would intercept FB GraphQL responses via the service worker to populate real comment text. High complexity and ToS-adjacent. **Do not start without an explicit go decision.**

### Deferred — Plugin SDK

Extension-safe plugin hooks for custom filters and post scoring. Gate behind developer mode. **Do not start until explicitly requested.**

---

## Safety Rules

- Never hide structural containers: `html`, `body`, `[role=main]`, `[role=feed]`, `[role=banner]`, `[role=navigation]`, `[role=complementary]`.
- Keep panic recovery and recovery watchdog active at all times.
- Keep feature master toggles default OFF for new risky modules until validated.
- Prefer aria-label / role / href anchors over class-based selectors.
- Keep all AI/behavior features local-first and transparent.

## Red-Team Notes

- **Safe to ship:** Rule engine, Zap, feed modes, quality scoring, performance batching, reels limiter, diagnostics, all locale expansions.
- **Defer:** Plugin SDK, GraphQL comment interception (v3.1).
- **Never:** Deep shadow-profile inference, anything implying hidden account tracking.

## Regression Checklist Per Slice

1. Feed does not blank on first load.
2. Scroll and new node injection still work.
3. Toggle OFF restores all content affected by that toggle.
4. Toggle ON affects only the intended module/post type.
5. Messenger surface unaffected unless the feature explicitly targets it.
6. Rule Engine Zap cannot target the main feed container (Self-Zap Guard).
