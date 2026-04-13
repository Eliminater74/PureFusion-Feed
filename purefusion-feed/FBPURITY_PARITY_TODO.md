# F.B. Purity Parity TODO (Living Plan)

Last updated: 2026-04-13

## Current Focus (DO NOT SKIP)

**Active Priority:**

- ✅ Post-type filter pack v2 — COMPLETE
- ✅ Smart feed scoring polish — COMPLETE
- ✅ Auto comment preview v3 — COMPLETE (DOM Injection Strategy)
- Header/top-nav controls — monitor selector stability across 2025+ FB nav revisions (next up)

**Secondary:**

- ✅ Smart feed scoring polish (UX copy, threshold tuning, chip stability) — COMPLETE
- Auto comment preview v2 stabilization (experimental — currently disabled by user)

**Do NOT jump ahead to:**

- Plugin SDK
- Rule engine
- Non-critical UI features

Always continue from the highest-priority unfinished item above.

## Last Action Log

- Last completed: Sponsored ad detection — full hardening for CWS release
- Last major fix: (1) `removeSponsored` step 4 added — direct article-level href scan (`a[href*="/ads/about"]` etc.) that bypasses all text matching and works even when FB obfuscates "Sponsored" with zero-width chars; (2) `sponsoredIndicators` updated to partial/case-insensitive aria-label matching (`*=` instead of exact) and includes ad-href selectors + locale variants; (3) `_isSponsoredLabel` strips ZWC/invisible Unicode before normalization; (4) `findContains` in helpers also strips ZWC so `:contains()` checks work on obfuscated text; (5) NL/SV/DA/NO token additions
- Known unstable area: Auto comment preview v2 (experimental, off by default — user paused work)
- Stable checkpoint: `63e715064fa88ae83dd78a74a6385860ba5ddc9f`

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
- PureFusion status: WIP (safe mode — hardening slice complete).
- Implemented: master toggle + per-icon toggles (Home, Friends, Watch, Marketplace, Groups, Gaming, Messenger, Notifications, Menu, Create).
- Hardened: count-badge stripping in label matcher, exact-href Home detection, expanded locale aliases (FR/PT/DE/IT/NL/SV/NO/DA) for all icons.

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
- Status: hardening slice in progress.
- Hardened: multi-scope topbar resolver + expanded locale label aliases + href-token fallback matching.
- Granular controls for top bar modules and jewels (without hiding banner/header containers).

3) Advanced custom UI engine (medium-high)
- Status: hardening slice in progress (safe mode, disabled by default).
- Implemented: custom CSS field, custom font family, custom accent color, custom background.
- Hardened: stricter CSS sanitization (risky directives removed + critical hide-rule stripping).
- Added: optional CSS snippet presets + finer custom style controls (text color and post-card background).
- Keep disabled by default and sandboxed to avoid layout breakage.

4) Broader multilingual phrase packs (medium)
- Status: hardening slice in progress.
- Added: FR/PT/DE/IT phrase coverage for story-activity detection using token-assisted matching.
- Added: FR/PT/DE/IT phrase coverage for post-type anchor detection (video/photo/link hints).
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
- Added: observer in/out/trimmed node telemetry (batch + cumulative) to tune observer queue caps.
- Added: pipeline fan-out telemetry (received/dispatched/trimmed + trim ratio) to tune node prefilter caps.
- Added: pipeline budget telemetry (deferral count, deferred processors, last deferral summary) to tune frame-budget slicing.
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

## Implementation Order (Next)

1) Post-type filter pack v2

- Status: second implementation slice complete.
- Added: dedicated Core Filter toggles (video, photo/image, link/share, text-only).
- Added: strict `[data-pagelet^="FeedUnit_"]` / `AdUnit` targeting + anchor-based type detection + global safety bailout.
- Hardened: evidence scoring + header-zone anchor gating + media-node guard for text-only detection.
- Added: Live Video toggle (`hideLiveVideoPosts`) — detects FB Live / live-replay posts via `/live/` href selectors + live-broadcast anchor phrases (EN/ES/FR/PT/DE/IT). Independent of the base Video toggle so users can filter live-only without hiding all video.
- Added: Share/Repost toggle (`hideShareReposts`) — detects reshares of another person's post via `/share/` href selectors + "shared [name]'s post" anchor phrases (EN/ES/FR/PT/DE/IT).
- Added: Poll toggle (`hidePollPosts`) — detects poll posts via `[role="listbox"]` / `[aria-label*="poll"]` selectors + "voted in a poll" / "created a poll" anchor phrases (EN/ES/FR/PT/DE/IT).
- Added: new separator + three toggle rows in options UI Post-Type Filter Pack v2 card.
- Added: uiMap wiring for all three new settings in options.js.
- Added: EN and ES i18n keys for all three new toggles.
- All three new types: OFF by default, pass through the existing safety bailout (max-hide cap).
- Next: validate selector coverage on live/poll layouts across account locales; continue topbar controls hardening.

2) Header/top-nav controls
- Add safe-mode master toggle + per-item toggles.
- Only allow compact item-level hides, never hide `role=banner`.
- Hardened: topbar now scans likely header navigation scopes (including alternate nav pagelets) instead of a single aria-label sweep.
- Hardened: per-item matching now uses locale-expanded label aliases plus href-token fallback for route-stable icons.
- Fixed: `_matchesTopbarLabels` now strips trailing count badges (e.g. "Notifications (3 unread)") from label signals before comparison — prevents Notifications hide from failing when an unread count is appended.
- Fixed: Home button href `"/"` exact match via new `_hideTopbarByExactHref` helper — substring token matching was unsafe for single-character hrefs; also added `/?sk=h_nor` and `/?sk=h_chr` tokens.
- Expanded: locale alias tables for all icons — Watch now covers FR (`regarder`), PT (`assistir`), ES (`ver videos`), DE (`videos ansehen`), IT (`guarda`), NL (`bekijk videos`), SV (`titta pa`); Friends/Groups/Messenger/Notifications/Create extended with NL/SV/NO/DA variants.
- Added: Gaming/Play icon toggle (`hideGaming`) — detects Gaming tab via label aliases (EN/ES/FR/PT/DE/IT/NL/SV) and href tokens (`/gaming`, `/games`, `/play`); OFF by default; account-dependent (not all accounts show this tab).
- Status: hardening slice complete. Remaining: monitor selector stability across 2025+ FB nav layout revisions.

3) Custom UI engine (experimental)
- Add "Advanced Custom CSS" textarea with clear warning.
- Hardened: added preset snippet loader in options for safe starter custom CSS blocks.
- Hardened: added custom text color + post-card background controls.
- Hardened: strengthened custom CSS/background/font sanitization before style injection.
- Validate and apply CSS in isolated style tag.

4) Diagnostics mode
- Add optional debug toggle and small overlay/log panel.

5) Auto comment preview v2 hardening
- Restrict to safe inline triggers and avoid modal/page navigation links.
- Add cooldown between auto-click actions.
- Add per-surface allow/deny list (Home yes, Notifications no by default).
- Hardened: added stricter safe-candidate gating + expanded risky-navigation detection.
- Hardened: added multilingual (FR/PT/DE/IT) comment trigger and primer phrase matching.
- v2 rewrite: fully redesigned based on live DOM inspection findings:
  - Fixed: `_extractLabel` now reads `aria-label` FIRST (FB hides button text visually via CSS; `innerText` is empty on action-row buttons).
  - Fixed: `_hasOpenCommentSection` now detects `[role="complementary"]` — the confirmed FB signal that a comment thread is loaded.
  - Added: `_findCommentCountTrigger` — detects the "X Comments" clickable in the post stats row (above Like/Comment/Share); most reliable trigger; works without prior state.
  - Added: `_pollForCommentSection` — adaptive polling at 220 ms intervals (up to 8 attempts ≈ 1.76 s) after primer/count-trigger click; replaces fragile fixed 900 ms wait.
  - Added: `_findDirectCommentButton` — `aria-label`-first direct match for "Comment" action button, covering EN/ES/FR/PT/DE/IT.
  - Improved: `_findPositionalCommentButton` — now validates Like/Comment/Share toolbar using `aria-label` signals (not empty `innerText`).
  - Added: beta warning card in options UI (amber border, BETA badge, risk explanation, recommended settings guidance).
  - Added: confirmation dialog in options.js that fires when the toggle is turned ON; cancelling reverts the checkbox without saving.
  - Added: `options_beta_badge`, `options_comment_preview_warning_text`, `options_comment_preview_risk_text` i18n keys (EN + ES).
  - Fixed: `_safeClick` now calls `element.click()` instead of `dispatchEvent(new MouseEvent(...))`. Synthetic events have `isTrusted=false` which Facebook's React handlers reject — `element.click()` goes through the browser's native dispatch path and is trusted.
  - Fixed: `_hasOpenCommentSection` no longer checks `[role="complementary"]` — that attribute belongs to the PAGE-LEVEL right sidebar, not any post's comment section. Replaced with correct signals: multiple `[role="article"]` elements (post body + comment articles) and a visible `[contenteditable]` / `[role="textbox"]` composer.
  - Fixed: `_findCommentCountTrigger` selector now includes `[tabindex="0"]` — FB's stats-row "X Comments" clickable is often a plain `div`/`span` with only a tabindex (no role attribute), which was previously missed.
  - Fixed: `_findCommentCountTrigger` no longer calls `_isRiskyNavTarget` — stats-row comment count links use `href="/posts/..."` which looks risky but React intercepts them client-side; they were being filtered before we could click them. Added `a[href]` to the candidate selector. `_safeClick` adds `preventDefault` for anchors to prevent browser navigation.
  - Fixed: `_hasOpenCommentSection` no longer checks `[contenteditable]` visibility — Facebook pre-renders the composer for every post; depending on how it is hidden (visibility:hidden, off-screen positioning) `_isVisible()` could return true, causing a false positive that immediately finalizes ALL posts before any click is attempted.
  - Fixed: `_hasOpenCommentSection` now uses a visible "View more/all comments" button as its secondary signal — these only appear once the section is open and partial comments are loaded.
  - Fixed: `_safeClick` now dispatches `pointerdown`+`pointerup` PointerEvents with coordinates before `element.click()` — some React handlers on Facebook respond to pointerdown, and providing realistic coordinates improves compatibility.
  - Extended: poll window from 8 → 15 attempts (15 × 220 ms ≈ 3.3 s) to give network requests more time to deliver comment data.
  - ROOT CAUSE CONFIRMED (via live DOM inspection): "View more comments" buttons are NOT inside `[role="article"]` and are NOT reliably inside the per-post pagelet container. Per-post querySelectorAll misses them entirely. Only a page-level `document.querySelectorAll` reliably finds them.
  - Fixed: added `_globalCommentButtonSweep()` — page-level scan using `innerText` (not aria-label, which is `null` on these buttons). Runs from both `sweepDocument()` and `applyToNodes()`. Marks each button with `data-pf-cp-clicked` to prevent re-clicking. Targets buttons where text contains "comments" + a load-signal word ("view", "see", "previous", etc.) or starts with a count digit.
  - Fixed: IntersectionObserver now waits 250 ms after a post enters the viewport before calling `_tryExpand` — gives React time to attach event handlers before primer clicks.
  - Status: experimental, off by default. Global sweep confirmed working via DOM debug. Primer approach (for posts with 0 comments) still relies on clicking the Comment action button which may or may not trigger comment loading depending on Facebook's current implementation.

6) Feed mode presets + quality scoring
- Status: DONE.
- Implement first-pass quality score heuristics with explicit reason labels.

7) Performance pass
- Add mutation batching, debounce windows, and skip markers for processed nodes.
- Track observer workload metrics in diagnostics mode.
- Hardened: added observer node pre-filter + high-signal prioritization + queue caps.
- Hardened: added main-pipeline node pre-filter/dedupe + batch cap before module dispatch.
- Hardened: added settings-sync serialization to prevent overlapping full-document resweeps.
- Hardened: optimized high-signal node detection and mutation batching efficiency in observer.

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
