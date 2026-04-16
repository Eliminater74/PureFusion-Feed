/**
 * PureFusion Feed - UI Tweaks Engine
 * 
 * Handles dynamic CSS injections for visual-only improvements like:
 * - Notification Jewel restyling
 * - Messenger Ghost Mode (Seen/Typing hiding)
 * - Privacy Blur for chat previews
 */

class PF_UiTweaks {
    constructor(settings) {
        this.settings = settings;
        this.styleTag = null;
        this._autofocusGuardBound = false;
        this._lastUserClickTarget = null;
        this._dfmActive = false;
        this._dfmKeyHandler = null;
        // Image Hover Expand state
        this._imgHoverPanel = null;
        this._imgHoverTimer = null;
        this._imgLeaveTimer = null;
        this._imgHoverBound = null;
        this._imgHoverOutBound = null;
        this._panelEnterBound = null;
        this._panelLeaveBound = null;
        this._currentHoveredImg = null;
        // Video Autoplay Control state
        this._videoPlayBound = null;
        this._videoClickBound = null;
        this.init();
    }

    updateSettings(settings) {
        const prevHoverExpand = !!(this.settings?.uiMode?.imageHoverExpand);
        const prevVideoAction = this.settings?.uiMode?.autoplayVideoAction || 'off';
        this.settings = settings;
        // Sync DFM toggle from options page; keyboard-toggled runtime state takes
        // precedence only until the next settings push (by design — options is authoritative).
        this._dfmActive = !!(settings?.uiMode?.distractionFreeMode);
        this._applyDfmClass();
        const nextHoverExpand = !!(settings?.uiMode?.imageHoverExpand);
        if (nextHoverExpand && !prevHoverExpand) this._setupImageHover();
        else if (!nextHoverExpand && prevHoverExpand) this._teardownImageHover();
        const nextVideoAction = settings?.uiMode?.autoplayVideoAction || 'off';
        if (nextVideoAction !== prevVideoAction) {
            this._teardownVideoControl();
            if (nextVideoAction !== 'off') this._setupVideoControl();
        }
        this.update();
    }

    destroy() {
        // Remove DFM keyboard shortcut listener
        if (this._dfmKeyHandler) {
            document.removeEventListener('keydown', this._dfmKeyHandler, true);
            this._dfmKeyHandler = null;
        }
        // Reset DFM class so Facebook looks normal after disable/reload
        this._dfmActive = false;
        document.documentElement.classList.remove('pf-dfm-active');
        // Restore wrapped links so FB redirect URLs work normally
        this._restoreWrappedLinks();
        // Clear timestamp chips
        this._clearAbsoluteTimestampLabels();
        // Tear down image hover expand
        this._teardownImageHover();
        // Tear down video autoplay control
        this._teardownVideoControl();
        // Remove injected styles
        if (this.styleTag && this.styleTag.parentElement) {
            this.styleTag.parentElement.removeChild(this.styleTag);
            this.styleTag = null;
        }
    }

    init() {
        this.styleTag = document.createElement('style');
        this.styleTag.id = 'purefusion-ui-tweaks';
        document.head.appendChild(this.styleTag);
        this._setupAutofocusGuard();
        this._setupDistractionFreeMode();
        if (this.settings?.uiMode?.imageHoverExpand) this._setupImageHover();
        const videoAction = this.settings?.uiMode?.autoplayVideoAction || 'off';
        if (videoAction !== 'off') this._setupVideoControl();
        this.update();
    }

    applyDocumentLevelTweaks() {
        this.update();
        if (this.settings?.uiMode?.showLinkPreviews) {
            this._revealLinkDestinations(null);
        }
        if (this.settings?.uiMode?.autoExpandSeeMore) {
            this._autoExpandSeeMore(null);
        }
    }

    applyToNodes(nodes) {
        // Most UI tweaks are global CSS based — update() keeps the stylesheet current.
        if (this.settings?.uiMode?.fixTimestamps && Array.isArray(nodes) && nodes.length) {
            this._syncAbsoluteTimestamps(nodes);
        }
        if (this.settings?.uiMode?.showLinkPreviews && Array.isArray(nodes) && nodes.length) {
            this._revealLinkDestinations(nodes);
        }
        const sortPref = this.settings?.uiMode?.commentSortDefault;
        if (sortPref && sortPref !== 'All Comments' && Array.isArray(nodes) && nodes.length) {
            this._enforceCommentSort(nodes);
        }
        // Image hover expand uses event delegation — no per-node wiring needed.
        // Clear eligibility cache on new nodes so newly added images are re-evaluated.
        if (this.settings?.uiMode?.imageHoverExpand && Array.isArray(nodes) && nodes.length) {
            nodes.forEach((node) => {
                if (!node || !node.querySelectorAll) return;
                node.querySelectorAll('img[data-pf-hover-eligible]').forEach((img) => {
                    img.removeAttribute('data-pf-hover-eligible');
                });
            });
        }
        // Video autoplay: sweep newly injected video elements.
        const videoAction = this.settings?.uiMode?.autoplayVideoAction || 'off';
        if (videoAction !== 'off' && Array.isArray(nodes) && nodes.length) {
            this._sweepFeedVideos(nodes);
        }
        // Auto-expand "See more" on newly injected post nodes.
        if (this.settings?.uiMode?.autoExpandSeeMore && Array.isArray(nodes) && nodes.length) {
            this._autoExpandSeeMore(nodes);
        }
    }

    update() {
        let css = '';

        // 1. Notification Jewel Styles
        const jewelStyle = this.settings.uiMode.notificationJewelStyle || 'classic';
        const jewelSelector = 'div[aria-label="Notifications"] span.x100vrsf.x1qhmfi1, div[aria-label="Messenger"] span.x100vrsf.x1qhmfi1';
        
        if (jewelStyle === 'blue') {
            css += `${jewelSelector} { background-color: #0084ff !important; filter: drop-shadow(0 0 2px #0084ff); } \n`;
        } else if (jewelStyle === 'grey') {
            css += `${jewelSelector} { background-color: #4b4b4b !important; opacity: 0.7; } \n`;
        } else if (jewelStyle === 'hidden') {
            css += `${jewelSelector} { display: none !important; } \n`;
        } else if (jewelStyle === 'purple') {
            css += `${jewelSelector} { background-color: #6C3FC5 !important; filter: drop-shadow(0 0 2px #6C3FC5); } \n`;
        }

        // 2. Messenger Ghost Mode (Hiding Seen Receipts & Typing)
        if (this.settings.uiMode.hideMessengerSeen) {
            // Hide only the tiny "Seen" profile pictures and the "Seen" status text
            // Verified safe by specific parent aria-label check
            css += `
                div[aria-label^="Seen by"] img,
                div[aria-label^="Visto por"] img { 
                    opacity: 0 !important; 
                    pointer-events: none !important;
                } \n`;
        }

        if (this.settings.social.hideMessengerTyping) {
            // Hide typing bubbles ONLY inside chat/contact surfaces.
            // Unscoped class-only selectors can collide with feed metadata rows.
            css += `
                [aria-label="Contacts"] span.x6s0dn4.x78zum5.x135b78x,
                [aria-label="Contacts"] div.x17zd0t2.x78zum5.x1q0g3np,
                [aria-label="Chats"] span.x6s0dn4.x78zum5.x135b78x,
                [aria-label="Chats"] div.x17zd0t2.x78zum5.x1q0g3np { display: none !important; }
            \n`;
        }

        // 3. Privacy Blur (Chat List & Headers)
        if (this.settings.social.messengerPrivacyBlur) {
            css += `
                /* messenger.com chat list */
                [aria-label="Chats"] [role="gridcell"] span, 
                [aria-label="Chats"] [role="gridcell"] h3,
                /* fb.com messenger sidebar items */
                [role="grid"] [role="row"] [role="gridcell"] span[dir="auto"],
                /* active chat headers (names) */
                [role="main"] header span,
                [role="main"] header h1 { 
                    filter: blur(6px) !important; 
                    transition: filter 0.3s ease-in-out;
                }
                
                [aria-label="Chats"] [role="gridcell"]:hover span, 
                [aria-label="Chats"] [role="gridcell"]:hover h3,
                [role="grid"] [role="row"] [role="gridcell"]:hover span[dir="auto"],
                [role="main"] header:hover span,
                [role="main"] header:hover h1 { 
                    filter: blur(0) !important; 
                } \n`;
        }
        
        // 4. Layout Hardening (Composer & Sidebar)
        if (this.settings.uiMode.hidePostComposer) {
            css += `${PF_SELECTOR_MAP.postComposer} { display: none !important; } \n`;
        }

        // 5. Font Size Scale (80–150%)
        const fontScale = Number(this.settings.uiMode.fontSizeScale) || 100;
        if (fontScale !== 100 && fontScale >= 80 && fontScale <= 150) {
            css += `html { font-size: ${fontScale}% !important; } \n`;
        }

        // 6. Anonymizer Mode — blur profile pics and author names until hover
        if (this.settings.uiMode.anonymizerMode) {
            css += `
                /* Anonymizer: profile pictures */
                [role="article"] a[role="link"] img,
                [role="complementary"] a[role="link"] img,
                [role="navigation"] a[role="link"] img {
                    filter: blur(8px) !important;
                    transition: filter 0.2s ease;
                }
                [role="article"] a[role="link"]:hover img,
                [role="complementary"] a[role="link"]:hover img,
                [role="navigation"] a[role="link"]:hover img {
                    filter: blur(0) !important;
                }
                /* Anonymizer: post author names */
                [role="article"] h2 a[role="link"],
                [role="article"] h3 a[role="link"] {
                    filter: blur(5px) !important;
                    transition: filter 0.2s ease;
                }
                [role="article"] h2 a[role="link"]:hover,
                [role="article"] h3 a[role="link"]:hover {
                    filter: blur(0) !important;
                }
                /* Anonymizer: right sidebar contact names */
                [role="complementary"] [role="listitem"] a[role="link"] {
                    filter: blur(5px) !important;
                    transition: filter 0.2s ease;
                }
                [role="complementary"] [role="listitem"] a[role="link"]:hover {
                    filter: blur(0) !important;
                }
            \n`;
        }

        css += this._buildCustomStylingCss();

        // Native timestamp stability guard (non-invasive).
        css += `
            [data-pagelet^="FeedUnit_"] a[role="link"][aria-label][href*="story_fbid"],
            [data-pagelet^="FeedUnit_"] a[role="link"][aria-label][href*="/posts/"],
            [data-pagelet^="FeedUnit_"] a[role="link"][aria-label][href*="/permalink/"],
            [data-pagelet^="AdUnit_"] a[role="link"][aria-label][href*="story_fbid"],
            [role="dialog"] a[role="link"][aria-label][href*="story_fbid"] {
                visibility: visible !important;
                opacity: 1 !important;
            }
        `;

        css += `
            .pf-post-date-chip {
                display: inline-flex;
                align-items: center;
                margin: 4px 0 2px;
                padding: 2px 8px;
                border-radius: 999px;
                border: 1px solid rgba(132, 154, 186, 0.36);
                background: rgba(27, 39, 57, 0.22);
                color: var(--secondary-text, #b0b3b8) !important;
                font: 600 11px/1.2 "Segoe UI Variable Text", "Segoe UI", sans-serif;
                white-space: nowrap;
                opacity: 0.94;
            }
        `;

        // Large Emoji/Reaction Normalization — cap oversized inline font-size on feed post text
        if (this.settings?.filters?.removeLargeReactions) {
            css += `
                [data-pagelet^="FeedUnit_"] div[dir="auto"] > span[style*="font-size"],
                [data-pagelet^="FeedUnit_"] [data-ad-preview="message"] > div > span[style*="font-size"],
                [data-pagelet^="FeedUnit_"] [data-ad-comet-preview="message"] > div > span[style*="font-size"] {
                    font-size: 1rem !important;
                }
            \n`;
        }

        // 8. Distraction-Free Mode — hide sidebars, center feed
        css += `
            html.pf-dfm-active [data-pagelet="LeftRail"],
            html.pf-dfm-active [data-pagelet="RightRail"],
            html.pf-dfm-active [role="complementary"],
            html.pf-dfm-active [role="navigation"]:not([aria-label="Facebook"]) {
                display: none !important;
            }
            html.pf-dfm-active [role="main"] {
                max-width: 680px !important;
                margin-left: auto !important;
                margin-right: auto !important;
            }
        \n`;

        // 9. Image Hover Expand panel styles (always injected when feature is on)
        if (this.settings?.uiMode?.imageHoverExpand) {
            css += `
                #pf-img-hover-panel {
                    position: fixed;
                    z-index: 2147483647;
                    background: #1c1e21;
                    border: 1px solid #3a3b3c;
                    border-radius: 12px;
                    padding: 8px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.55);
                    display: none;
                    flex-direction: column;
                    gap: 8px;
                    width: 320px;
                    max-width: calc(100vw - 24px);
                    max-height: 420px;
                    pointer-events: auto;
                    user-select: none;
                }
                #pf-img-hover-panel.pf-img-hover-visible {
                    display: flex;
                }
                #pf-img-hover-panel .pf-ihp-img {
                    width: 100%;
                    max-height: 340px;
                    object-fit: contain;
                    border-radius: 8px;
                    display: block;
                }
                #pf-img-hover-panel .pf-ihp-actions {
                    display: flex;
                    gap: 6px;
                    justify-content: flex-end;
                    flex-shrink: 0;
                }
                #pf-img-hover-panel .pf-ihp-btn {
                    padding: 5px 12px;
                    border-radius: 6px;
                    border: none;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 600;
                    line-height: 1.4;
                    transition: opacity 0.15s;
                }
                #pf-img-hover-panel .pf-ihp-btn:hover { opacity: 0.85; }
                #pf-img-hover-panel .pf-ihp-save { background: #0866ff; color: #fff; }
                #pf-img-hover-panel .pf-ihp-open { background: #3a3b3c; color: #e4e6eb; }
                #pf-img-hover-panel .pf-ihp-close { background: #3a3b3c; color: #e4e6eb; }
            \n`;
        }

        this.styleTag.textContent = css;

        if (this.settings?.uiMode?.fixTimestamps) {
            this._syncAbsoluteTimestamps();
        } else {
            this._clearAbsoluteTimestampLabels();
        }

        if (!this.settings?.uiMode?.showLinkPreviews) {
            this._restoreWrappedLinks();
        }
    }

    // ── Link Destination Reveal ────────────────────────────────────────────────

    _revealLinkDestinations(nodes) {
        const roots = this._resolveTimestampRoots(nodes);
        roots.forEach((root) => {
            if (!root || !root.querySelectorAll) return;
            const links = root.querySelectorAll(
                'a[href*="l.facebook.com/l.php"]:not([data-pf-revealed]),' +
                'a[href*="lm.facebook.com/l.php"]:not([data-pf-revealed])'
            );
            links.forEach((link) => {
                const href = link.getAttribute('href') || '';
                let realUrl = '';
                try {
                    const parsed = new URL(href);
                    const u = parsed.searchParams.get('u');
                    if (u && /^https?:\/\//i.test(u)) realUrl = u;
                } catch { /* malformed href — skip */ }
                if (!realUrl) return;
                link.setAttribute('data-pf-original-href', href);
                link.setAttribute('href', realUrl);
                link.setAttribute('data-pf-revealed', '1');
            });
        });
    }

    _restoreWrappedLinks() {
        document.querySelectorAll('a[data-pf-revealed]').forEach((link) => {
            const orig = link.getAttribute('data-pf-original-href');
            if (orig) link.setAttribute('href', orig);
            link.removeAttribute('data-pf-original-href');
            link.removeAttribute('data-pf-revealed');
        });
    }

    // ── Distraction-Free Mode ─────────────────────────────────────────────────

    _setupDistractionFreeMode() {
        // Apply the persisted setting on load
        this._dfmActive = !!(this.settings?.uiMode?.distractionFreeMode);
        this._applyDfmClass();

        // Register Alt+Shift+F keyboard shortcut (one handler, stored for cleanup)
        this._dfmKeyHandler = (e) => {
            if (e.altKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
                e.preventDefault();
                this._dfmActive = !this._dfmActive;
                this._applyDfmClass();
                PF_Logger.info(`PF_UiTweaks: Distraction-Free Mode ${this._dfmActive ? 'ON' : 'OFF'}`);
            }
        };
        document.addEventListener('keydown', this._dfmKeyHandler, true);
    }

    _applyDfmClass() {
        if (this._dfmActive) {
            document.documentElement.classList.add('pf-dfm-active');
        } else {
            document.documentElement.classList.remove('pf-dfm-active');
        }
    }

    // ── Comment Sort Enforcement ───────────────────────────────────────────────

    _enforceCommentSort(nodes) {
        const pref = this.settings?.uiMode?.commentSortDefault;
        if (!pref || pref === 'All Comments') return;

        // Map setting values to FB menu item text patterns (EN)
        const targetMap = {
            'Newest':       ['newest', 'most recent'],
            'Top Comments': ['most relevant', 'top comments']
        };
        const targets = targetMap[pref];
        if (!targets) return;

        // Text content that uniquely identifies the comment sort button
        const sortLabels = ['most relevant', 'all comments', 'newest', 'top comments', 'most recent'];

        const roots = this._resolveTimestampRoots(nodes);
        roots.forEach((root) => {
            if (!root || !root.querySelectorAll) return;

            const articles = (root.matches && root.matches('[role="article"]'))
                ? [root]
                : Array.from(root.querySelectorAll('[role="article"]'));

            articles.forEach((article) => {
                if (article.dataset.pfSortEnforced) return;

                const sortBtn = this._findCommentSortButton(article, sortLabels);
                if (!sortBtn) return;

                const currentText = sortBtn.textContent.trim().toLowerCase();
                if (targets.some((t) => currentText === t)) {
                    article.dataset.pfSortEnforced = '1';
                    return; // Already showing preferred sort
                }

                // Mark before the async click to prevent re-entry on observer callbacks
                article.dataset.pfSortEnforced = '1';

                setTimeout(() => {
                    if (!sortBtn.isConnected) return;
                    sortBtn.click();
                    setTimeout(() => {
                        const menus = document.querySelectorAll('[role="menu"]:not([data-pf-menu-handled])');
                        menus.forEach((menu) => {
                            menu.setAttribute('data-pf-menu-handled', '1');
                            const items = menu.querySelectorAll('[role="menuitem"]');
                            for (const item of items) {
                                if (targets.some((t) => item.textContent.trim().toLowerCase().includes(t))) {
                                    item.click();
                                    break;
                                }
                            }
                        });
                    }, 200);
                }, 350);
            });
        });
    }

    _findCommentSortButton(article, sortLabels) {
        // Comment sort buttons are [role="button"] with aria-haspopup whose full
        // text content matches a known sort label — this distinguishes them from
        // the broader set of aria-haspopup menus on FB (Like picker, share menus, etc.)
        const candidates = article.querySelectorAll('[role="button"][aria-haspopup]');
        for (const btn of candidates) {
            if (sortLabels.includes(btn.textContent.trim().toLowerCase())) return btn;
        }
        return null;
    }

    _syncAbsoluteTimestamps(nodes = null) {
        const roots = this._resolveTimestampRoots(nodes);

        roots.forEach((root) => {
            if (!root || !root.querySelectorAll) return;

            root.querySelectorAll('.pf-abs-date-label').forEach((legacy) => legacy.remove());
            root.querySelectorAll('a.pf-abs-date-anchor').forEach((legacyAnchor) => {
                this._clearAnchorAbsoluteLabel(legacyAnchor);
            });

            const anchors = root.querySelectorAll('a[role="link"][aria-label], a[href][aria-label]');
            anchors.forEach((anchor) => {
                if (!anchor || !anchor.isConnected) return;
                if (anchor.closest('.pf-insight-chip, #pf-feed-report-panel, #pf-session-timer')) return;

                const host = this._resolveTimestampHost(anchor);
                if (!host) {
                    this._clearAnchorAbsoluteLabel(anchor);
                    return;
                }

                if (!this._isLikelyTimestampAnchor(anchor, host)) {
                    this._clearAnchorAbsoluteLabel(anchor);
                    return;
                }

                const absoluteText = this._extractAbsoluteTimestampText(anchor);
                if (!absoluteText) {
                    this._clearAnchorAbsoluteLabel(anchor);
                    return;
                }

                const currentText = String(anchor.getAttribute('data-pf-abs-date') || '');
                if (currentText === absoluteText && anchor.classList.contains('pf-abs-date-anchor')) {
                    this._upsertPostDateChip(host, absoluteText);
                    return;
                }

                anchor.classList.add('pf-abs-date-anchor');
                anchor.setAttribute('data-pf-abs-date', absoluteText);
                this._upsertPostDateChip(host, absoluteText);
            });
        });
    }

    _resolveTimestampHost(anchor) {
        if (!anchor || !anchor.closest) return null;

        const postHost = anchor.closest('[data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"], [role="article"]');
        if (postHost) return postHost;

        const dialog = anchor.closest('[role="dialog"]');
        if (!dialog) return null;

        const dialogArticle = dialog.querySelector('[role="article"], [data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"]');
        return dialogArticle || dialog;
    }

    _upsertPostDateChip(host, absoluteText) {
        if (!host || !host.querySelector) return null;

        let chip = host.querySelector('.pf-post-date-chip');
        if (!chip) {
            chip = document.createElement('div');
            chip.className = 'pf-post-date-chip';

            const heading = host.querySelector('h2, h3, h4, [role="heading"]');
            const headingContainer = heading && heading.closest ? heading.closest('div') : null;

            if (headingContainer && headingContainer.parentElement && headingContainer.parentElement !== host) {
                headingContainer.insertAdjacentElement('afterend', chip);
            } else {
                host.insertAdjacentElement('afterbegin', chip);
            }
        }

        const text = `Posted: ${absoluteText}`;
        if (chip.textContent !== text) chip.textContent = text;
        return chip;
    }

    _resolveTimestampRoots(nodes) {
        if (!Array.isArray(nodes) || !nodes.length) {
            return [document];
        }

        const roots = [];
        const seen = new Set();

        nodes.forEach((node) => {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
            if (seen.has(node)) return;
            seen.add(node);
            roots.push(node);
        });

        return roots.length ? roots : [document];
    }

    _isLikelyTimestampAnchor(anchor, host) {
        const text = String(anchor.textContent || '').trim().toLowerCase();
        const aria = String(anchor.getAttribute('aria-label') || '').trim().toLowerCase();
        const href = String(anchor.getAttribute('href') || '').toLowerCase();

        if (!aria || aria.length < 6 || aria.length > 140) return false;

        // Avoid mutating broad author/page links or action links.
        const textWordCount = text ? text.split(/\s+/).length : 0;
        if (textWordCount > 4 || text.length > 28) return false;

        const likelyPostLink = [
            '/posts/', '/permalink/', '/videos/', '/photo', '/photos/', '/reel/', '/story.php', 'story_fbid=', 'fbid='
        ].some((token) => href.includes(token));

        const relativeText = /^(\d+[smhdwy]|\d+\s*(sec|min|h|d|w|mo|y|yr)s?|now|just now|ayer|hoy|today|yesterday)$/i.test(text);
        const dateLikeText = /\d{1,2}[:.]\d{2}|\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|ene|abr|ago|dic)|\d{4}/i.test(text);
        const hasDateHints = /\d{4}|\d{1,2}:\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|ene|feb|mar|abr|may|jun|jul|ago|sept|oct|nov|dic|am|pm/i.test(aria);

        if (!relativeText && !dateLikeText) return false;
        if (!likelyPostLink && !hasDateHints) return false;

        if (anchor.getBoundingClientRect && host.getBoundingClientRect) {
            const aRect = anchor.getBoundingClientRect();
            const hRect = host.getBoundingClientRect();
            const topDelta = aRect.top - hRect.top;

            if (topDelta < -12 || topDelta > 280) return false;
            if (aRect.width > 220 || aRect.height > 32) return false;
        }

        return true;
    }

    _extractAbsoluteTimestampText(anchor) {
        const candidates = [
            anchor.getAttribute('aria-label'),
            anchor.getAttribute('title'),
            anchor.querySelector && anchor.querySelector('[aria-label]') ? anchor.querySelector('[aria-label]').getAttribute('aria-label') : '',
            anchor.querySelector && anchor.querySelector('[title]') ? anchor.querySelector('[title]').getAttribute('title') : ''
        ];

        for (const rawCandidate of candidates) {
            const cleaned = String(rawCandidate || '').replace(/\s+/g, ' ').trim();
            if (!cleaned || cleaned.length < 6 || cleaned.length > 140) continue;
            if (!/\d/.test(cleaned)) continue;
            return cleaned;
        }

        return '';
    }

    _clearAbsoluteTimestampLabels() {
        document.querySelectorAll('.pf-abs-date-label').forEach((el) => el.remove());
        document.querySelectorAll('.pf-post-date-chip').forEach((el) => el.remove());
        document.querySelectorAll('a.pf-abs-date-anchor').forEach((anchor) => {
            this._clearAnchorAbsoluteLabel(anchor);
        });
    }

    _clearAnchorAbsoluteLabel(anchor) {
        if (!anchor || !anchor.classList) return;
        if (anchor.classList.contains('pf-abs-date-anchor')) {
            anchor.classList.remove('pf-abs-date-anchor');
        }
        if (anchor.hasAttribute && anchor.hasAttribute('data-pf-abs-date')) {
            anchor.removeAttribute('data-pf-abs-date');
        }
    }

    /**
     * Prevents Facebook from programmatically hijacking focus to the comment
     * textbox (e.g. after clicking Like/Share or after React re-renders the post).
     * Only blocks programmatic focuses — user clicks on the textbox still work.
     */
    _setupAutofocusGuard() {
        if (this._autofocusGuardBound) return;
        this._autofocusGuardBound = true;

        // Track the last element the user actually clicked so we can distinguish
        // user-initiated focus from programmatic autofocus.
        document.addEventListener('mousedown', (e) => {
            this._lastUserClickTarget = e.target || null;
        }, true);

        document.addEventListener('focus', (e) => {
            if (!this.settings?.uiMode?.disableCommentAutofocus) return;

            const target = e.target;
            if (!target || !target.matches) return;
            if (!target.matches('[role="textbox"][contenteditable="true"]')) return;

            // Allow focus when the user explicitly clicked on or inside the textbox
            const last = this._lastUserClickTarget;
            const isUserInitiated = last && (
                last === target ||
                target.contains(last) ||
                last.contains(target)
            );

            if (!isUserInitiated) {
                // Schedule the blur as a microtask so it runs after the browser's
                // focus machinery completes — otherwise some browsers ignore it.
                Promise.resolve().then(() => {
                    if (document.activeElement === target) target.blur();
                });
            }
        }, true);
    }

    _buildCustomStylingCss() {
        const ui = this.settings?.uiMode;
        if (!ui) return '';

        const preset = PF_SELECTOR_MAP.stylePresets[ui.theme];
        let css = '';

        // If we have a preset, we use its defaults unless custom styling is enabled.
        // Actually, F.B. Purity model is: Preset is a starting point, Custom Styling Enable overrides/extends.
        if (preset) {
            css += `\n/* PureFusion Preset: ${ui.theme} */\n`;
            if (preset.font) css += `body, [role="main"], [role="feed"] { font-family: ${preset.font} !important; }\n`;
            if (preset.accent) {
                css += `:root { --pf-custom-accent: ${preset.accent}; }\n`;
                css += `a, [role="link"] { color: var(--pf-custom-accent) !important; }\n`;
            }
            if (preset.text) css += `body, [role="main"], [role="feed"], [role="article"] { color: ${preset.text} !important; }\n`;
            if (preset.cardBg) css += `[role="feed"] [role="article"], [data-pagelet^="FeedUnit_"] [role="article"] { background-color: ${preset.cardBg} !important; }\n`;
            if (preset.bodyBg) css += `body { background: ${preset.bodyBg} !important; }\n`;
            if (preset.customCss) css += preset.customCss + '\n';
        }

        if (!ui.customStylingEnabled) return css;

        const fontFamily = this._sanitizeFontFamilyValue(ui.customFontFamily);
        if (fontFamily) {
            css += `body, [role="main"], [role="feed"] { font-family: ${fontFamily} !important; }\n`;
        }

        const accent = this._normalizeColor(ui.customAccentColor);
        if (accent) {
            css += `:root { --pf-custom-accent: ${accent}; }\n`;
            css += `a, [role="link"] { color: var(--pf-custom-accent) !important; }\n`;
            css += `[role="button"]:focus-visible, button:focus-visible { outline-color: var(--pf-custom-accent) !important; }\n`;
        }

        const textColor = this._normalizeColor(ui.customTextColor);
        if (textColor) {
            css += `:root { --pf-custom-text-color: ${textColor}; }\n`;
            css += `body, [role="main"], [role="feed"], [role="article"] { color: var(--pf-custom-text-color) !important; }\n`;
        }

        const cardBackground = this._normalizeColor(ui.customCardBackground);
        if (cardBackground) {
            css += `:root { --pf-custom-card-bg: ${cardBackground}; }\n`;
            css += `[role="feed"] [role="article"], [data-pagelet^="FeedUnit_"] [role="article"] { background-color: var(--pf-custom-card-bg) !important; }\n`;
        }

        const background = this._sanitizeBackgroundValue(ui.customBackground);
        if (background) {
            css += `body { background: ${background} !important; }\n`;
        }

        const customCss = this._sanitizeCustomCss(ui.customCss);
        if (customCss) {
            css += `\n/* PureFusion user custom CSS */\n${customCss}\n`;
        }

        return css;
    }

    _sanitizeCustomCss(value) {
        let css = String(value || '');
        if (!css) return '';

        css = css.replace(/<\/?style[^>]*>/gi, '');
        css = css.replace(/@import/gi, '');
        css = css.replace(/@charset/gi, '');
        css = css.replace(/@namespace/gi, '');
        css = css.replace(/javascript:/gi, '');
        css = css.replace(/vbscript:/gi, '');
        css = css.replace(/expression\s*\(/gi, '');
        css = css.replace(/-moz-binding\s*:/gi, '');
        css = css.replace(/\bbehavior\s*:/gi, '');
        css = css.replace(/url\s*\([^)]*\)/gi, '');

        css = this._removeCriticalHideRules(css);

        if (css.length > 12000) {
            css = css.slice(0, 12000);
        }

        return css.trim();
    }

    _removeCriticalHideRules(css) {
        if (!css) return '';

        const hideDeclaration = /(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$)|max-height\s*:\s*0(?:\D|$)|height\s*:\s*0(?:\D|$))/i;

        return css.replace(/([^{}]+)\{([^{}]*)\}/g, (fullRule, selector, declarations) => {
            const normalizedSelector = String(selector || '').replace(/["']/g, '').toLowerCase();
            const hasCriticalRole = normalizedSelector.includes('[role=main]')
                || normalizedSelector.includes('[role=feed]')
                || normalizedSelector.includes('[role=banner]')
                || normalizedSelector.includes('[role=navigation]')
                || normalizedSelector.includes('[role=complementary]');

            const hasRootCritical = /(^|[\s,>+~])html([#.\[:\s>+~]|$)|(^|[\s,>+~])body([#.\[:\s>+~]|$)/i.test(selector);
            if (!hasCriticalRole && !hasRootCritical) return fullRule;

            if (!hideDeclaration.test(declarations)) return fullRule;
            return '';
        });
    }

    _sanitizeBackgroundValue(value) {
        const background = String(value || '').trim();
        if (!background || background.length > 180) return '';

        if (/javascript:|vbscript:|expression\s*\(|url\s*\(|@import|;|\{|\}/i.test(background)) return '';

        const allowedPatterns = [
            /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
            /^rgba?\([\d\s.,%]+\)$/i,
            /^hsla?\([\d\s.,%]+\)$/i,
            /^(linear|radial|conic)-gradient\(.+\)$/i,
            /^var\(--[a-z0-9_-]+\)$/i,
            /^(transparent|currentcolor|inherit|initial|unset)$/i,
            /^[a-z]{3,24}$/i
        ];

        if (!allowedPatterns.some((rx) => rx.test(background))) return '';

        return background;
    }

    _sanitizeFontFamilyValue(value) {
        const fontFamily = String(value || '').trim();
        if (!fontFamily || fontFamily.length > 140) return '';

        if (/url\s*\(|javascript:|@import|;|\{|\}/i.test(fontFamily)) return '';
        if (!/^[a-z0-9\s,'"._()-]+$/i.test(fontFamily)) return '';

        return fontFamily;
    }

    _normalizeColor(value) {
        const color = String(value || '').trim();
        if (!color || color.length > 40) return '';

        const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
        const rgb = /^rgba?\([\d\s.,%]+\)$/i;
        const hsl = /^hsla?\([\d\s.,%]+\)$/i;

        if (hex.test(color) || rgb.test(color) || hsl.test(color)) return color;

        return '';
    }

    // ── Auto-Expand "See More" ────────────────────────────────────────────────

    _autoExpandSeeMore(nodes) {
        // Multi-locale "See more" button text — exact match prevents accidental expansion
        // of "See more comments", "See more reactions", or other multi-word variants.
        const SEE_MORE_RE = /^(see more|ver m[aá]s|voir plus|voir la suite|mehr anzeigen|meer weergeven|se mer|vis mere|vedi altro|mostra di pi[uù]|ver mais|xem th[eê]m)$/i;

        const roots = (Array.isArray(nodes) && nodes.length) ? nodes : [document];
        roots.forEach((root) => {
            if (!root || !root.querySelectorAll) return;
            // Scope strictly to feed articles. Excludes dialogs, header, sidebar.
            root.querySelectorAll(
                '[role="article"] [role="button"]:not([data-pf-see-more-done])'
            ).forEach((btn) => {
                const text = (btn.textContent || '').trim();
                if (!SEE_MORE_RE.test(text)) return;
                // Mark immediately to prevent duplicate processing on rapid MutationObserver calls
                btn.setAttribute('data-pf-see-more-done', '1');
                // Small delay lets FB finish rendering the article before we click
                setTimeout(() => {
                    if (btn.isConnected) btn.click();
                }, 180);
            });
        });
    }

    // ── Video Autoplay Control ────────────────────────────────────────────────

    _setupVideoControl() {
        if (this._videoPlayBound) return; // Already wired

        // Track explicit user clicks on video players so we don't re-pause user-initiated plays
        this._videoClickBound = (e) => {
            const video = e.target.closest('video');
            if (video) {
                video.setAttribute('data-pf-user-play', '1');
                // Clear the flag after a short window — once play fires we've read it
                setTimeout(() => video.removeAttribute('data-pf-user-play'), 600);
            }
        };
        document.addEventListener('click', this._videoClickBound, true);

        this._videoPlayBound = (e) => this._onVideoPlay(e);
        // Capture phase so we intercept the play event before FB's own handlers
        document.addEventListener('play', this._videoPlayBound, true);
        // Apply to any videos already playing on the page
        this._sweepFeedVideos([document]);
    }

    _teardownVideoControl() {
        if (this._videoPlayBound) {
            document.removeEventListener('play', this._videoPlayBound, true);
            this._videoPlayBound = null;
        }
        if (this._videoClickBound) {
            document.removeEventListener('click', this._videoClickBound, true);
            this._videoClickBound = null;
        }
        // Restore any videos we muted so they behave normally when feature is off
        document.querySelectorAll('video[data-pf-muted]').forEach((video) => {
            video.muted = false;
            video.removeAttribute('data-pf-muted');
        });
        // Remove paused markers (clean up; we can't reliably un-pause FB-managed videos)
        document.querySelectorAll('video[data-pf-paused]').forEach((video) => {
            video.removeAttribute('data-pf-paused');
        });
    }

    _onVideoPlay(e) {
        const video = e.target;
        if (!video || video.tagName !== 'VIDEO') return;
        // Only act on feed/content videos — skip Messenger, header, dialogs
        if (!video.closest('[role="main"]')) return;
        if (video.closest('[role="navigation"], [role="banner"], [data-pagelet="LeftRail"], [data-pagelet="RightRail"]')) return;
        // Skip videos the user explicitly clicked to play
        if (video.getAttribute('data-pf-user-play') === '1') return;
        this._applyVideoAction(video);
    }

    _applyVideoAction(video) {
        const action = this.settings?.uiMode?.autoplayVideoAction || 'off';
        if (action === 'mute') {
            if (!video.muted) {
                video.muted = true;
                video.setAttribute('data-pf-muted', '1');
            }
        } else if (action === 'pause') {
            video.setAttribute('data-pf-paused', '1');
            // requestAnimationFrame defers the pause until after FB's play event handling finishes
            requestAnimationFrame(() => {
                if (video.getAttribute('data-pf-paused') === '1' && !video.paused) {
                    video.pause();
                }
            });
        }
    }

    _sweepFeedVideos(roots) {
        const action = this.settings?.uiMode?.autoplayVideoAction || 'off';
        if (action === 'off') return;
        const list = Array.isArray(roots) ? roots : [roots];
        list.forEach((root) => {
            if (!root || !root.querySelectorAll) return;
            root.querySelectorAll('video').forEach((video) => {
                if (!video.closest('[role="main"]')) return;
                if (video.closest('[role="navigation"], [role="banner"], [data-pagelet="LeftRail"], [data-pagelet="RightRail"]')) return;
                if (!video.paused) this._applyVideoAction(video);
            });
        });
    }

    // ── Image Hover Expand ────────────────────────────────────────────────────

    _setupImageHover() {
        if (this._imgHoverBound) return; // Already wired

        // Build the floating panel
        const panel = document.createElement('div');
        panel.id = 'pf-img-hover-panel';
        panel.innerHTML = `
            <img class="pf-ihp-img" src="" alt="">
            <div class="pf-ihp-actions">
                <button class="pf-ihp-btn pf-ihp-save" title="Save image">⬇ Save</button>
                <button class="pf-ihp-btn pf-ihp-open" title="Open in new tab">↗ Open</button>
                <button class="pf-ihp-btn pf-ihp-close" title="Close">× Close</button>
            </div>
        `;
        document.body.appendChild(panel);
        this._imgHoverPanel = panel;

        // Panel button handlers
        panel.querySelector('.pf-ihp-save').addEventListener('click', () => {
            const src = panel.dataset.src;
            if (src) this._saveImage(src);
        });
        panel.querySelector('.pf-ihp-open').addEventListener('click', () => {
            const src = panel.dataset.src;
            if (src) window.open(src, '_blank', 'noopener,noreferrer');
        });
        panel.querySelector('.pf-ihp-close').addEventListener('click', () => {
            this._dismissImgPreview();
        });

        // Event delegation on document for feed images
        this._imgHoverBound = (e) => this._onImgHoverOver(e);
        this._imgHoverOutBound = (e) => this._onImgHoverOut(e);
        document.addEventListener('mouseover', this._imgHoverBound);
        document.addEventListener('mouseout', this._imgHoverOutBound);

        // Keep panel alive while mouse is inside it
        this._panelEnterBound = () => {
            clearTimeout(this._imgLeaveTimer);
            this._imgLeaveTimer = null;
        };
        this._panelLeaveBound = () => {
            clearTimeout(this._imgLeaveTimer);
            this._imgLeaveTimer = setTimeout(() => this._dismissImgPreview(), 250);
        };
        panel.addEventListener('mouseenter', this._panelEnterBound);
        panel.addEventListener('mouseleave', this._panelLeaveBound);
    }

    _teardownImageHover() {
        clearTimeout(this._imgHoverTimer);
        clearTimeout(this._imgLeaveTimer);
        this._imgHoverTimer = null;
        this._imgLeaveTimer = null;
        this._currentHoveredImg = null;

        if (this._imgHoverBound) {
            document.removeEventListener('mouseover', this._imgHoverBound);
            this._imgHoverBound = null;
        }
        if (this._imgHoverOutBound) {
            document.removeEventListener('mouseout', this._imgHoverOutBound);
            this._imgHoverOutBound = null;
        }

        if (this._imgHoverPanel) {
            if (this._panelEnterBound) this._imgHoverPanel.removeEventListener('mouseenter', this._panelEnterBound);
            if (this._panelLeaveBound) this._imgHoverPanel.removeEventListener('mouseleave', this._panelLeaveBound);
            if (this._imgHoverPanel.parentElement) this._imgHoverPanel.parentElement.removeChild(this._imgHoverPanel);
            this._imgHoverPanel = null;
        }
        this._panelEnterBound = null;
        this._panelLeaveBound = null;

        // Remove eligibility cache markers
        document.querySelectorAll('img[data-pf-hover-eligible]').forEach((img) => {
            img.removeAttribute('data-pf-hover-eligible');
        });
    }

    _onImgHoverOver(e) {
        const img = e.target;
        if (!img || img.tagName !== 'IMG') return;
        if (!this._isEligibleFeedImage(img)) return;

        clearTimeout(this._imgLeaveTimer);
        this._imgLeaveTimer = null;
        this._currentHoveredImg = img;

        // If already showing this image, cancel any leave timer and stay
        const hiRes = this._getHighResFbUrl(img.src || img.currentSrc || '');
        if (this._imgHoverPanel && this._imgHoverPanel.dataset.src === hiRes &&
            this._imgHoverPanel.classList.contains('pf-img-hover-visible')) return;

        clearTimeout(this._imgHoverTimer);
        this._imgHoverTimer = setTimeout(() => {
            this._showImgPreview(img);
        }, 350);
    }

    _onImgHoverOut(e) {
        if (e.target !== this._currentHoveredImg) return;

        // If the mouse is moving into the panel, keep the preview alive
        if (e.relatedTarget && this._imgHoverPanel && this._imgHoverPanel.contains(e.relatedTarget)) return;

        clearTimeout(this._imgHoverTimer);
        this._imgHoverTimer = null;
        this._currentHoveredImg = null;

        clearTimeout(this._imgLeaveTimer);
        this._imgLeaveTimer = setTimeout(() => this._dismissImgPreview(), 250);
    }

    _showImgPreview(img) {
        if (!this._imgHoverPanel) return;
        const src = img.src || img.currentSrc || '';
        const hiRes = this._getHighResFbUrl(src);
        if (!hiRes) return;

        const panel = this._imgHoverPanel;
        const previewImg = panel.querySelector('.pf-ihp-img');
        panel.dataset.src = hiRes;
        previewImg.src = hiRes;
        panel.classList.add('pf-img-hover-visible');

        // Position panel: prefer right of image, fall back to left
        const rect = img.getBoundingClientRect();
        const PANEL_W = 336; // 320 content + 16 padding
        const PANEL_H = 420;
        const vpW = window.innerWidth;
        const vpH = window.innerHeight;
        const GAP = 12;

        let left = rect.right + GAP;
        if (left + PANEL_W > vpW - 8) {
            left = rect.left - PANEL_W - GAP;
        }
        left = Math.max(8, Math.min(left, vpW - PANEL_W - 8));

        let top = rect.top + (rect.height / 2) - (PANEL_H / 2);
        top = Math.max(8, Math.min(top, vpH - PANEL_H - 8));

        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
    }

    _dismissImgPreview() {
        if (!this._imgHoverPanel) return;
        this._imgHoverPanel.classList.remove('pf-img-hover-visible');
        this._imgHoverPanel.dataset.src = '';
        const previewImg = this._imgHoverPanel.querySelector('.pf-ihp-img');
        if (previewImg) previewImg.src = '';
        clearTimeout(this._imgLeaveTimer);
        this._imgLeaveTimer = null;
    }

    _isEligibleFeedImage(img) {
        // Only cache confirmed-eligible results. Negative results are NOT cached because:
        // (a) offsetWidth may be 0 while the image is still loading/rendering, and
        // (b) aria-hidden / ancestor state can change as FB mutates the DOM.
        if (img.getAttribute('data-pf-hover-eligible') === '1') return true;

        // Must have a real src (not empty, not a data URI)
        const src = img.src || img.currentSrc || '';
        if (!src || src.startsWith('data:')) return false;

        // Skip the panel's own preview image
        if (this._imgHoverPanel && this._imgHoverPanel.contains(img)) return false;

        // Exclude navigation, header, and side-rail elements — not feed content
        if (img.closest('[role="navigation"], [role="banner"], [data-pagelet="LeftRail"], [data-pagelet="RightRail"]')) return false;

        // Must be somewhere in the main content area (home, profile, group, watch all qualify)
        if (!img.closest('[role="main"], [role="article"], [role="feed"]')) return false;

        // Reject clearly tiny elements — but only if offsetWidth is actually measured (> 0).
        // If both are 0 the image may still be loading; allow it through so it isn't permanently skipped.
        const w = img.offsetWidth || img.naturalWidth || 0;
        const h = img.offsetHeight || img.naturalHeight || 0;
        if (w > 0 && w < 80) return false;
        if (h > 0 && h < 60) return false;

        img.setAttribute('data-pf-hover-eligible', '1');
        return true;
    }

    _getHighResFbUrl(src) {
        if (!src || src.startsWith('data:')) return src;
        try {
            // Remove dimension path segments: /s320x320/, /p320x320/, /c0.0.320.320a.320/
            let url = src.replace(/\/[spc]\d+x\d+(?:\.\d+\.\d+\.\d+(?:\.\d+)?)?(?=\/)/, '');
            // Upgrade low-quality suffixes _s, _t, _q → _n (high resolution)
            url = url.replace(/_(s|t|q)(\.(jpg|jpeg|png|webp))(\?|$)/i, '_n$2$4');
            return url;
        } catch {
            return src;
        }
    }

    async _saveImage(src) {
        try {
            const response = await fetch(src, { mode: 'cors' });
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            // Derive filename from URL path, stripping query strings
            const namePart = src.split('/').pop().split('?')[0] || 'purefusion_image';
            a.download = namePart;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
        } catch {
            // CORS or network failure — open in new tab as fallback
            window.open(src, '_blank', 'noopener,noreferrer');
        }
    }
}

// Global export for content-script injection
window.PF_UiTweaks = PF_UiTweaks;
