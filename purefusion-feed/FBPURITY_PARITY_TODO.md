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
- ✅ Phase 17: Auto Comment Preview v3 (DOM injection strategy — DONE)
- ✅ Phase 16: Multilingual & Story Hardening (NL/SV/DA/NO + Body Text Guard)
- ✅ Phase 15: Context Menu "Zap" (Instant rules + Undo support)
- ✅ Phase 13: Power-User Rule Engine (Selector + Text logic)

**Do NOT jump ahead to:**

- Plugin SDK
- Non-critical UI cleanup

---

## Last Action Log

- **Last completed (2026-04-14):** Phase 27 — UI Tweaks Unimplemented Settings Activation. `fontSizeScale` (80–150): generates `html { font-size: N% }` when not 100; only fires when in range and non-default. `anonymizerMode`: CSS blur (8px imgs, 5px author name links) with hover-reveal transition; scoped to article/complementary/navigation. `disableCommentAutofocus`: capture-phase focus listener tracks last mousedown target; blurs programmatic textbox focus via microtask. All three were wired in options.html/js but had zero content-script implementation.
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

Status key: **DONE** = implemented and working | **WIP** = implemented but being hardened | **TODO** = not started

| Feature Area | Status | Notes |
| --- | --- | --- |
| Story/activity post filters | DONE | All 14 subtypes wired (became friends, joined group, photo updates, life events, check-ins, milestones, job, relationship, group activity, memories) |
| Granular sidebar module controls | WIP | Left/right module toggles implemented; selector paths still tightened per-module |
| Top header micro-controls | DONE | Per-icon toggles + Notification Soul-Soother jewel styles |
| Notification popup filtering | DONE | Games, birthdays, marketplace, engagement — all 9 locales |
| Search popup suppression | DONE | All suggestions / trending / recent — all 9 locales |
| Image subject filtering | WIP | 6 categories implemented in safe mode; needs selector hardening |
| Auto comment preview v3 | DONE | DOM injection strategy; placeholder shell; MutationObserver re-render guard |
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
| Plugin SDK | TODO | Deferred — low priority |

---

## Remaining Work (Priority Order)

### High — Granular Sidebar Hardening (WIP)

Selector paths for left nav and right sidebar modules are implemented but periodically break when FB rotates class names. Each module needs at least two stable selector strategies (aria-label primary + structural fallback).

- Left nav: Marketplace, Gaming, Watch, Memories, Meta AI, Manus AI
- Right col: Trending, Contacts, Events, Birthdays, Meta AI contact, Manus AI contact

### Medium — Image Subject Filter Hardening (WIP)

The 6 image categories (sports/food/pets/vehicles/memes/travel) work but rely on FB's alt-text descriptor strings which are locale-sensitive. Needs:

- Expanded token coverage for FR/DE/IT/NL/SV/DA/NO image descriptors
- False-positive audit on food/travel overlap

### Medium — Auto Comment Preview v3.1 — Real Comment Data

v3.0 (DOM shell injection) is DONE. v3.1 would intercept FB GraphQL responses via the service worker to populate real comment text. High complexity and ToS-adjacent — do not start without explicit decision to pursue.

### Low — Plugin SDK spike

Extension-safe plugin hooks for custom filters and post scoring. Gate behind developer mode. Do not start until sidebar hardening and image filter work are complete.

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
