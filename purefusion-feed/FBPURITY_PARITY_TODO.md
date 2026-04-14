# PureFusion Feed — Parity Roadmap

Last updated: 2026-04-14

## Definition of Done (DoD)

- [ ] Feature works on fresh page load.
- [ ] Survives infinite scroll and React-driven node injections.
- [ ] Master toggle is fully reversible (content restores on OFF).
- [ ] Messenger surface remains unaffected unless specifically targeted.
- [ ] Roadmap documentation (`FBPURITY_PARITY_TODO.md`) updated with latest status.

## Current Focus (DO NOT SKIP)

**Active Priority:**

- ✅ Phase 13: Power-User Rule Engine — COMPLETE (Selector + Text logic)
- ✅ Phase 15: Context Menu "Zap" — COMPLETE (Instant rules + Undo support)
- ✅ Phase 16: Multilingual & Story Hardening — COMPLETE (NL/SV/DA/NO + Body Text Guard)
- ✅ Phase 18: Performance Pass — COMPLETE (Chunked Cleaning + Skip Markers)
- ✅ Phase 17: Auto Comment Preview v3 — COMPLETE (Non-intrusive GraphQL fetching)
- ✅ Phase 19: Filter Logic Consolidation — COMPLETE (Shared helpers, duplicate filter removal, locale token merge)
- ✅ Phase 20: Visual Polish & Theme Expansion — COMPLETE (AMOLED refined, Pastel added, Insight Chip propagation)
- ✅ Phase 21: Post-type Filter Tuning — COMPLETE (NL/SV/DA/NO locale expansion; gate filter diacritic correctness hardened)
- ✅ Phase 22: Options UI Hardening & Locale Settings — COMPLETE (filterLocale setting, locale-aware gate filters, i18n/orphan fixes)

**Secondary:**

- Auto comment preview v3 (DOM injection) — Placeholder logic validated; awaiting data integration strategy.
- Advanced Custom UI presets — Expanding the snippet library.

**Do NOT jump ahead to:**

- Plugin SDK
- Non-critical UI cleanup

Always continue from the highest-priority unfinished item above.

## Last Action Log

- **Last completed (2026-04-14):** Phase 22 — Options UI Hardening & Locale Settings. Fixed `options_ui_theme_pastel` i18n gap (EN+ES). Fixed `commentPreviewStrategy` orphan (wired to UI). Fixed `hideMemories` orphan (HTML + i18n added). Added `filterLocale` setting + Feed Language card. Gate filters now locale-aware.
- **Prior completed (2026-04-13):** Phase 21 — Post-type Filter Tuning (NL/SV/DA/NO locale expansion).
- **`_looksLikeStoryActivitySignal` gate expanded:** Added NL (`omslagfoto`, `levensgebeurtenis`, `ingecheckt`, `relatiestatus`, `gedeeld`, `gepost`, `deelde`), SV normalized (`gick med`, `delade`, `postade`, `milstolpe`, `checka in`, `relationsstatus`, `omslagsbild`, `livshändelse`), DA (`forholdsstatus`, `gik med`, `delte`, `postede`, `synes godt om`, `deltager`, `livsbegivenhed`, `tjek ind`, `omslagsbillede`), NO (`relasjonsstatus`, `ble med`, `delte`, `postet`, `livshendelse`, `sjekk inn`, `liker`, `forsidebilde`). Fixed multiline regex bug (was using newline-separated regex literal, invalid JS). Fixed broken `vän` token (was being tested against normalized text where `ä`→`a`; replaced with diacritic-free equivalents).
- **`_looksLikePostTypeAnchor` gate expanded:** Added NL (`deelde`, `koppeling`, `lees meer`, `bericht`, `publicatie`), SV normalized (`delade`, `las mer`, `inlagg`), DA (`delte`, `opslag`, `læs mere`), NO (`lenke`, `les mer`, `innlegg`).
- **Anchor phrase regexes expanded in `_classifyPostType`:** All four regexes now cover NL/SV/DA/NO — `hasVideoAnchor` (NL: `deelde een video`, SV: `delade en video`, DA/NO: `delte en video`), `hasPhotoAnchor` (covers `profielfoto`/`omslagfoto` NL; `omslagsbild`/`profilbild` SV; `profilbillede`/`omslagsbillede` DA; `forsidebilde` NO), `hasLinkAnchor` (NL: `koppeling`/`lees meer`; SV: `lank`/`las mer`; DA: `læs mere`; NO: `lenke`/`les mer`), `hasRepostAnchor` (NL: `deelde het bericht van`; SV: `delade inlagget av`; DA: `delte opslaget fra`; NO: `delte innlegget fra`).
- **Normalization note:** `_normalizeComparableText` strips SV `ä/å/ö` via NFD+combining strip but preserves DA/NO `ø`/`æ`. All added regex tokens written in their correct post-normalization form.
- **Prior completed (2026-04-13):** Phase 20 — Visual Polish & Theme Expansion (AMOLED refined, Pastel Warm added, Insight Chip theme propagation for all 5 non-default themes).
- **Prior completed (2026-04-13):** Phase 19 — Filter Logic Consolidation.

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
- PureFusion status: DONE.
- Notes: module-level toggles are implemented with master enable; selectors and locale support are hardened; added "Notification Soul-Soother" jewel styling.

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

- Status: DONE.
- Implemented: Notification Soul-Soother (Blue/Purple/Grey/Hidden jewel styles), multi-scope topbar resolver, expanded locale label aliases, and hardened badge-stripping logic.

3) Advanced custom UI engine (medium-high)
- Status: DONE (Initial).
- Implemented: custom CSS field, custom font family, custom accent color, custom background, preset snippet loader, and post-card styling.
- Keep disabled by default and sandboxed to avoid layout breakage.

4) Power-User Rule Engine & Zap (high)
- Status: DONE.
- Implemented: CSS selector rules, text-based matching rules with wrapper scoping, and "Zap Element" context menu action.
- Added: Dashboard UI for rule management (add/edit/delete) and instant "Undo" for Zapped elements.

5) Broader multilingual phrase packs (medium)
- Status: WIP.
- Added: FR/PT/DE/IT phrase coverage for story-activity detection and post-type anchor detection.
- TODO: Expansion of Dutch (NL), Swedish (SV), Danish (DA), and Norwegian (NO).

6) Rule diagnostics panel (medium)
- Status: DONE.
- Implemented: optional in-page diagnostics overlay with telemetry, observer workload timing, and JSON export.
- Added: pipeline budget telemetry to tune frame-budget slicing and Ultra Fast mode recommendations.
- Added: wellbeing report action telemetry (panel interactions + related-settings deep-link usage counts) in diagnostics overlay/snapshot.
- Added: diagnostics performance guidance card with Ultra Fast mode recommendation CTA when pipeline pressure rises.
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
- Status: hardening slice started — PAUSED. Click strategy abandoned (opens modal/composer side effect). See item 7b for validated replacement approach.
- Added: configurable cooldown, retry cap, and max-posts-per-sweep controls.
- Added: per-surface allow list (Home/Groups/Watch/Marketplace/Notifications/Other).
- Hardened: stricter safe-candidate gating (feed-post eligibility, menu/composer exclusion, external/risky navigation guards).
- Hardened: stronger action-row validation before positional comment clicks.
- Added: FR/PT/DE/IT phrase coverage for inline comment trigger/primer detection.

7b)- [x] **Auto comment preview v3 — DOM injection strategy** (medium)
  - ✅ Implement direct injection after interaction bar.
  - ✅ Add skeleton loader UI for premium look.
  - ✅ Implement MutationObserver re-render guard for React reconciliation.
  - ✅ **DONE 2026-04-13**

### Why this approach works

Sponsored posts on Facebook pre-render a comment `<ul>` inside the feed without any click.
The extension can replicate this by injecting the same structure into normal posts.
No click event is fired — no modal opens, no composer activates, no scroll jump occurs.

### Validated DOM structure (live-captured 2026-04-12)

Interaction bar anchor (stable-ish aria role):

- Primary:  `[role="article"] .xn3w4p2.x1gslohp` — obfuscated, WILL change
- Fallback: `[role="article"] div[role="toolbar"]` — more stable, prefer this
- Note: the obfuscated class anchor is confirmed working NOW but must be backed by
  aria/role fallbacks before ship. Add a selector-version stamp so we can
  detect when it breaks without crashing the whole module.
- Confirmed (second live capture 2026-04-12): interaction bar's **parent has no CSS classes** (bare unstyled div).
  This means `bar.insertAdjacentElement('afterend', wrapper)` is the cleanest insertion —
  no class-based selector conflict risk on the parent container.

Comment list wrapper parent sits at:

- `div.x6s0dn4.x3nfvp2` (directly after interaction bar in sponsored post DOM)

Comment list element:

- `<ul class="html-ul x3ct3a4 xdj266r xyri2b x18d9i69 x1c1uobl x1w5wx5t x78zum5 x1wfe3co xat24cr xdwrcjd x1o1nzlu xyqdw3p">`
- Note: these class strings are obfuscated and WILL rotate. Do NOT hard-code them
  on the injected element — use the bare semantic tag `<ul>` and let the
  wrapper div carry a single `purefusion-comments` marker class instead.

### Implementation plan (when we pick this up)

Step 1 — Anchor detection

- Find `[role="article"]` post root (already done in `_isValidPostScope`).
- Within post: try `div[role="toolbar"]` first; fall back to class-based heuristic `.xn3w4p2.x1gslohp`. Store whichever matched so we can detect rotations.

Step 2 — Guard: skip if real comment `<ul>` already present

- If `post.querySelector('ul[class*="x3ct3a4"]')` exists FB already loaded comments — do nothing (avoids duplicate rendering).
- Tag processed posts with `data-pf-comment-injected="1"` to prevent re-runs.

Step 3 — Inject wrapper + list shell

```js
const wrapper = document.createElement('div');
wrapper.className = 'purefusion-comment-shell';
// minimal non-FB styles — no obfuscated class copy-paste
wrapper.style.cssText = 'padding:4px 16px 8px;';

const ul = document.createElement('ul');
ul.setAttribute('role', 'list');
ul.className = 'purefusion-comment-list';

wrapper.appendChild(ul);
interactionBar.insertAdjacentElement('afterend', wrapper);
post.dataset.pfCommentInjected = '1';
```

Step 4 — Populate comment items

- Option A (v3.0 — no real data): inject a single styled placeholder item so the feature can be shipped and tested without a data source.
- Option B (v3.1 — real comments): intercept FB GraphQL responses via a background service worker fetch listener, cache the first N comment objects for a post ID, and populate items from that cache. This is the correct long-term path but is a significant scope increase — do NOT tackle in the same slice as step 3.

Step 5 — Scroll/focus hardening

- After injection call `window.scrollTo({ top: savedY, behavior: 'instant' })` immediately (no timeout needed — injection does not trigger React setState).
- No blur logic needed since no click is fired.

Step 6 — IntersectionObserver gate

- Only inject when the post is ≥40% in the viewport (same threshold as v2).
- Disconnect observer entry after first successful injection.

Step 7 — Settings wiring

- Re-use the existing `social.commentPreview` toggle from v2.
- Add a sub-option `commentPreviewStrategy: "inject" | "click"` so we can A/B the strategies without deleting the v2 code yet.
- Default to "inject" once this slice is validated.

### Known risks / caveats

- Obfuscated class names on the anchor div WILL rotate with FB deploys. Must have aria/role fallback and a canary check that logs when the primary anchor stops matching (but does not throw).
- Injected shell has NO real comment text in v3.0 — it will show as empty/placeholder. Do NOT ship to users until at minimum placeholder copy is in place.
- React reconciliation may wipe injected nodes when FB re-renders the post. Use a MutationObserver on the post root to detect ejection and re-inject. Cap re-injection to 3 attempts per post to avoid thrashing.
- If Option B (real comment data) is pursued: fetching from FB's private GraphQL is fragile and may violate ToS. Document this risk in the options page.
- Do NOT copy FB's obfuscated class strings onto injected elements — they carry no semantic meaning outside FB's CSS bundle and will look broken when that bundle rotates.

8) Smart feed quality scoring (medium-high)
- Detect likely ragebait/engagement bait/low-value repost patterns and assign a quality score.
- Use score thresholds to collapse/dim/hide posts.
- Keep transparent with "why hidden" reasons.
- Status: DONE.
- Added: expanded rage-bait keywords (EN/ES/FR/PT/DE/IT); added multi-lingual engagement-bait pattern detection (manipulative prompts like "tag a friend").
- Added: user controls for low/high score thresholds and optional score-reason hints on PF score badges.
- Added: optional low-score post collapsing with one-click reveal chip.
- Added: local credibility-signal heuristics (suspicious-claim warnings + optional strict penalty mode).
- Added: expandable "Why flagged" details panel on credibility warnings.
- Added: one-click "Verify this claim" web search action from credibility details panel.
- Added: source-domain trust hints (recognized source / unverified domain / short-link warnings).
- Added: optional credibility debug preview chip to show detector status on scanned posts.
- Added: never-empty feed guard for low-score collapse (configurable minimum visible posts floor).
- Added: full-document predictor resweep on boot/settings update to ensure debug/credibility chips render on already-loaded posts.
- Added: visibility hardening for debug chips (prepend placement + rescore version bump + scan status toast).
- Added: feed-region-only scan counting with visible-post count and sample author hints in scan toast.
- Fixed: debug/credibility chips no longer attach to comment rows in post dialogs.
- Fixed: post dialogs are now recognized as valid credibility scan targets (without tagging comment rows).
- Fixed: nested target resolution now prefers real post nodes over outer dialog wrappers (restores dialog chip placement).
- Fixed: dialog chips now anchor to the actual post content area (not top-left dialog shell).
- Fixed: chip refresh stability improvements for rerendered dialogs + image-heavy posts.
- Fixed: stable anchor rows for credibility/debug chips (dialog header anchor + inline post anchor) to survive UI rerenders.
- Fixed: duplicate dialog debug chips replaced via upsert (single debug + single verify block per post view).
- Fixed: dialog-persist checks now detect chips anchored outside post body and reattach after rerenders.
- Fixed: TL;DR "Summarize with AI" now uses stable post anchors and full-document LLM sweep to reduce modal rerender vanish.
- Hardened: unified post-level PureFusion Insight chip now consolidates score + credibility + verify/debug details under one expandable surface.
- Polish: insight chip status copy now uses clearer user-facing phrasing (engagement bait / suspicious claim risk / low-value / high relevance).
- Polish: insight chip labels further humanized ("Pattern: High Engagement Bait risk", "Possible misleading claim", "Lower relevance based on interests").
- Polish: added Emotional Tone detail in insight chip (Outrage-leaning, Informational, Viral-loop, etc.).
- Performance: added insight chip refresh throttling (2s cooldown per node) and optimized leak cleanup frequency.
- Fixed: absolute timestamp visibility toggle now actively renders readable post date labels next to post timestamps.
- Fixed: timestamp enhancement no longer injects sibling DOM nodes into Facebook metadata row (prevents timestamp line flicker/vanish).
- Hardened: timestamp matcher now targets only compact date/time anchors near post headers and avoids mutating non-timestamp author/action links.
- Fixed: timestamp display now uses a separate post-date chip (non-invasive to FB timestamp row) to prevent disappearing native time text.
- Hotfix: disabled timestamp-row DOM mutation path to fully restore native inline post time visibility while scrolling.
- Fixed: scoped Messenger typing-hider selectors to chat/contact surfaces only; added native post timestamp visibility guard to avoid feed metadata collisions.

9) Feed mode presets (high)
- Status: initial implementation complete.
- Implemented: persistent mode selector with Custom, Clean, Focus, Ultra Fast, Smart, Classic.
- Scope mode behavior to existing filters + predictions + keyword rules.
- Keep mode switching instant and reversible.
- Hardened: stronger per-mode behavior differentiation (Home-first Focus profile, smarter Smart scoring posture, cleaner Classic/Clean algorithm suppression).
- Added: options-side live mode profile helper text so each mode intent is explicit before saving.
- Added: Ultra Fast mode patch for text-first performance posture (aggressive media suppression + reduced prediction/LLM overhead + Home-first surface scope).
- Added: device-aware Ultra Fast recommendation hint + one-click apply action in options (low/moderate hardware guidance).
- Added: "PureFusion in 5 seconds" quick-start card with one-click Clean/Fast/Smart mode actions.
- Added: inline mode recommendation badge near selector (device-aware recommendation state at a glance).
- Added: live "Why this mode" one-liner under the selector (mode intent + device-tier note).
- Polish: launch quick-start card now emphasizes Clean as the default-friendly recommendation (best-for-most-users badge + stronger contrast).
- Polish: quick-start mode buttons now show active-state highlighting for the currently selected mode.
- Added: options-level Basic/Advanced view switch (hides advanced nav sections/cards for simpler onboarding).
- Polish: unified top save CTA wording to "Save Changes" for consistency.
- Hardened: deep-link/open-settings navigation now auto-switches to Advanced view when targeting an advanced-only field.

10) Performance layer (high)
- Mutation batching and pre-filter passes before expensive processing.
- Aggressive caps to avoid repeated scans of the same nodes.
- Maintain low CPU budget on long sessions.
- Status: hardening slice started.
- Hardened: observer now filters low-signal injected nodes and prioritizes high-signal nodes with queue/dispatch caps.
- Hardened: main pipeline now pre-filters/dedupes observer node batches before fan-out to all modules.
- Hardened: settings-sync resweeps are now serialized to avoid overlapping burst rescans.
- Hardened: module fan-out now enforces a per-slice processing budget and defers remaining processors to the next tick when over budget.

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

14) Daily Feed Report (medium)
- Status: initial implementation complete.
- Implemented: optional session impact report (hidden items, reels blocked, top reason, estimated minutes saved).
- Added: auto-report interval + manual report button on session timer + keyboard shortcut (Alt+Shift+R).
- Hardened: shortcut no longer triggers while typing, and auto-report stays quiet when no items were filtered.
- Localized: session report labels/messages/button now run through extension i18n keys (EN/ES).
- Localized: wellbeing runtime UX strings for break wall and session timer label (EN/ES).
- Added: optional session-awareness soft break prompt based on sustained high scroll velocity (threshold + cooldown controls).
- Added: weekly feed report scaffold (7-day aggregate toast + top distraction reason + timer quick button + Alt+Shift+W shortcut).
- Added: in-page feed report panel UI (session/weekly tabs, refresh/reset actions, and keyboard/timer button entry points).
- Added: weekly panel trend mini-chart + top 3 distraction reasons list for faster behavior insights.
- Added: weekly top-reason explain actions with category-level descriptions (why this distraction type is being filtered).
- Added: top-reason "open related settings" deep-link actions (panel -> advanced settings tab/field focus).

15) Right-click quick filter actions (medium-high)
- Status: initial implementation complete.
- Implemented: "Teach PureFusion" context menu for selected text on Facebook/Messenger.
- Implemented actions: add to blocklist, add to auto-hide, add to allowlist, hide source, never hide source.
- Added: guardrails for short/broad selections to reduce accidental over-broad rules.
- Added: immediate settings sync + feed resweep + in-page confirmation toast after quick actions.
- Hardened: link-context source actions now resolve from right-clicked name links (with recent context capture fallback when no text is selected).
- Added: one-click Undo in quick-action toast (time-limited rollback of the most recent quick rule mutation).

## Implementation Order (Next Priority)

### Phase 19: Filter Logic Consolidation — DONE (2026-04-13)

- [x] Extract `_getFilterablePostCandidates` shared helper (removes 3× copy-pasted pre-filter).
- [x] Extract `_exceedsSafetyBailout` shared helper (removes 3× copy-pasted bailout block).
- [x] Eliminate duplicate `removeImageSubjectPosts` / `_extractImageSubjectSignals`; consolidate to `applyImageSubjectFilters` + `PF_SELECTOR_MAP.imageSubjectTokens`.
- [x] Merge ES locale tokens into `selector-map.js` imageSubjectTokens.
- [x] Remove orphaned legacy fields from `sidebar` in `default-settings.js`.

### Phase 20: Visual Polish & Theme Expansion — DONE (2026-04-13)

- [x] AMOLED accent corrected to `#BB86FC`; full true-black surface coverage across cards, wells, rail, and chips.
- [x] Pastel Warm theme added — `feed-manager.js`, `options.html`, `options.js`, `options.css`.
- [x] Insight Chip & post-date chip theme propagation — per-theme overrides injected for all 5 non-default themes (darkPro, amoled, classicBlue, zen, pastel).
- [x] Options page preview swatch added for Pastel Warm.

### Phase 21: Post-type Filter Tuning — DONE (2026-04-13)

- [x] Expand NL/SV/DA/NO phrase coverage for `_looksLikeStoryActivitySignal` gate filter.
- [x] Expand NL/SV/DA/NO phrase coverage for `_looksLikePostTypeAnchor` gate filter.
- [x] Expand NL/SV/DA/NO anchor phrase regexes in `_classifyPostType` (video/photo/link/repost).
- [x] Fix multiline regex literal bug in `_looksLikeStoryActivitySignal`.
- [x] Fix broken `vän` diacritic token (was tested against NFD-normalized text — replaced with diacritic-free equivalents).
- [ ] **Manual validation needed:** Validate AMOLED and Pastel themes on live FB page — confirm no FB CSS variable conflicts with injected overrides (cannot be automated).

### Phase 22: Options UI Hardening & Locale Settings — DONE (2026-04-14)

- [x] **Locale preference setting** — `filterLocale: 'auto'` added to `filters` in `default-settings.js`.
- [x] **Options page: Locale selector** — Feed Language card added to the Filters tab (`options.html`); `opt_filters_filterLocale` wired in `options.js` uiMap.
- [x] **Cleaner: locale-aware gate filters** — `_looksLikeStoryActivitySignal` and `_looksLikePostTypeAnchor` now read `this.settings.filters.filterLocale`; `auto` = unified regex (unchanged behavior); specific locale = EN base + selected locale group only.
- [x] **Orphan fix: `opt_filters_hideMemories`** — was in uiMap with no HTML control or i18n key; added `options_filters_hide_memories` to EN + ES locales; added toggle to Clutter & Injections card.
- [x] **Orphan fix: `commentPreviewStrategy`** — setting existed in default-settings.js and messages.json but had no HTML control or uiMap entry; added select to comment preview section and wired in uiMap.
- [x] **i18n key audit** — Fixed missing `options_ui_theme_pastel` in EN locale (confirmed gap). Added `options_ui_theme_zen` + `options_ui_theme_pastel` to ES locale (both were absent). Added locale selector keys to both EN and ES.

## Safety Rules (Do Not Remove)

- Never hide structural containers: `html`, `body`, `role=main`, `role=feed`, `role=banner`, `role=navigation`, `role=complementary`.
- Keep panic recovery and recovery watchdog active.
- Keep feature master toggles default OFF for new risky modules until validated.
- Prefer strict selectors and short heading/aria/href anchors over broad full-text sweeps.
- Keep all advanced AI/behavior features local-first and transparent for policy safety.

## Red-Team Notes (Helpful vs Risky)

- **Helpful now:** Rule engine (Zap), feed mode presets, quality scoring, performance batching, reels limiter, diagnostics.
- **Helpful later:** Plugin SDK.
- **Risky/policy-sensitive (defer):** Deep "shadow profile" estimation and anything that implies hidden account inference.

## Regression Checklist Per Feature Slice

1) Feed does not blank on first load.
2) Scroll and new node injection still work.
3) Toggle OFF restores content behavior.
4) Toggle ON affects only intended module/type.
5) Messenger surface remains unaffected unless feature is Messenger-specific.
6) Rule Engine "Zap" does not target the main feed container itself (Self-Zap Guard).


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
