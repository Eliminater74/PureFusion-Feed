/**
 * PureFusion Feed - Inline Comment Preview (v2 hardened)
 *
 * Progressively expands comment snippets on visible feed posts without opening
 * the full post modal or triggering page navigation.
 *
 * KEY FINDINGS (from live DOM inspection):
 *  - Facebook hides button labels via CSS — `innerText` is empty on action-row
 *    buttons. Detection MUST use `aria-label` / `title` as the primary signal.
 *  - When a post's comment section is open, multiple [role="article"] elements
 *    appear inside the post wrapper (1 for the post body, 1+ for each comment).
 *    A visible [contenteditable] / [role="textbox"] also indicates an open section.
 *    NOTE: [role="complementary"] is the PAGE-LEVEL right sidebar — it is NOT
 *    a reliable in-post comment section indicator. Do not use it for this purpose.
 *  - The stats-row "X Comments" element (above Like/Comment/Share) is the most
 *    reliable click trigger — it opens the inline comment thread directly.
 *  - The action-row "Comment" button click opens only the text composer, NOT
 *    existing comments. It serves as a primer that causes FB to render the
 *    comment section, after which we poll for the inline trigger.
 *
 * OFF BY DEFAULT. Experimental/beta — must be explicitly enabled.
 */

class PF_PostIDResolver {
    static resolve(post) {
        if (!post || !post.querySelector) return null;

        // 1. Data-pagelet (usually contains 'FeedUnit_' followed by numeric ID)
        const pagelet = post.dataset.pagelet || '';
        const pageletMatch = pagelet.match(/\d{10,}/);
        if (pageletMatch) return pageletMatch[0];

        // 2. Share button data / href
        const shareBtn = post.querySelector('div[aria-label="Send this to friends or post it on your profile."] button, a[href*="sharer.php"]');
        if (shareBtn) {
            const href = shareBtn.getAttribute('href') || '';
            const idMatch = href.match(/[&\?]id=(\d+)/) || href.match(/%2Fposts%2F(\d+)/);
            if (idMatch) return idMatch[1];
        }

        // 3. Post timestamp link
        const tsLink = post.querySelector('a[href*="/posts/"], a[href*="/groups/"]');
        if (tsLink) {
            const href = tsLink.getAttribute('href') || '';
            const idMatch = href.match(/\/posts\/(\d+)/) || href.match(/\/permalink\/(\d+)/) || href.match(/multi_permalinks=(\d+)/);
            if (idMatch) return idMatch[1];
        }

        return null;
    }
}

class PF_CommentFetcher {
    static async fetch(postId) {
        try {
            const dtsg = this._getDtsg();
            if (!dtsg) throw new Error('Auth token (fb_dtsg) not found');

            // doc_id for "Comment Thread Query" (Standard as of 2024-2025 Comet)
            // Note: This ID might shift, but it's the current stable one for full expansion.
            const docId = '7556094577800045'; 

            const variables = {
                feedback_id: btoa('feedback:' + postId),
                count: 3,
                cursor: null,
                orderby: 'RANKED_RELEVANT'
            };

            const body = new URLSearchParams();
            body.append('av', this._getAvatarId());
            body.append('fb_dtsg', dtsg);
            body.append('fb_api_caller_class', 'RelayModern');
            body.append('fb_api_req_friendly_name', 'CometUFICommentsPaginationQuery');
            body.append('variables', JSON.stringify(variables));
            body.append('doc_id', docId);

            const response = await fetch('/api/graphql/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            return this._parseResponse(data);
        } catch (err) {
            console.warn('[PureFusion] Comment fetch failed:', err);
            return null;
        }
    }

    static _getDtsg() {
        // Method 1: Hidden input
        let token = document.querySelector('input[name="fb_dtsg"]')?.value;
        if (token) return token;

        // Method 2: Script dump (Regex)
        for (const s of document.scripts) {
            const m = s.textContent.match(/"DTSGInitialData",\[\],\{"token":"(.*?)"\}/);
            if (m) return m[1];
        }
        return null;
    }

    static _getAvatarId() {
        // Extracts the currently logged in user ID
        const cookieId = document.cookie.match(/c_user=(\d+)/);
        return cookieId ? cookieId[1] : '0';
    }

    static _parseResponse(data) {
        const comments = [];
        try {
            const edges = data?.data?.node?.comments?.edges || [];
            for (const edge of edges) {
                const node = edge.node;
                comments.push({
                    id: node.id,
                    author: node.author?.name || 'Anonymous',
                    text: node.body?.text || '',
                    avatar: node.author?.profile_picture?.uri || ''
                });
            }
        } catch (e) {}
        return comments;
    }
}

class PF_CommentPreview {
    constructor(settings) {
        this.settings = settings;
        this.observedPosts  = new WeakSet();
        this.processedPosts = new WeakSet();
        this.postAttempts   = new WeakMap();
        this.retryTimers    = new WeakMap();
        this.pollTimers     = new WeakMap();
        this.intersectionObserver = null;

        // Runtime config — overridden by _syncRuntimeConfig()
        this.maxAttemptsPerPost     = 4;
        this.maxPostsPerSweep       = 30;
        this.minActionGapMs         = 1200;
        this.pollIntervalMs         = 220;
        this.maxPollAttempts        = 15;   // 15 × 220 ms ≈ 3.3 s adaptive window
        this.lastActionAt           = 0;
        this.strategy               = 'fetch'; // 'fetch' (v3) or 'click' (v2 legacy)
        this.injectedShells         = new WeakMap();
        this.fetchCache             = new Map();

        this._syncRuntimeConfig();
        this._initIntersectionObserver();
    }

    // ── Public API ──────────────────────────────────────────────────────────

    updateSettings(settings) {
        this.settings = settings;
        this._syncRuntimeConfig();
    }

    sweepDocument() {
        if (!this._isEnabled()) return;

        // Fast-path: click any visible "View more comments" / "X Comments" buttons
        // that are already in the DOM and within the visible viewport area.
        this._globalCommentButtonSweep();

        const seen  = new WeakSet();
        let   count = 0;

        const queueIfNew = (post) => {
            if (count >= this.maxPostsPerSweep || seen.has(post)) return;
            seen.add(post);
            this._queuePost(post);
            count += 1;
        };

        // Primary: pagelet-based post wrappers (home feed, search results, etc.)
        document.querySelectorAll(PF_SELECTOR_MAP.postContainer).forEach(queueIfNew);

        // Secondary: Group / Page / Watch feed posts — walk feed-direct children
        // that contain a [role="article"] to find the actual post wrapper.
        document.querySelectorAll('[role="feed"] > div').forEach((child) => {
            if (child.querySelector('[role="article"]')) queueIfNew(child);
        });

        // Tertiary: Facebook's Comet DOM exposes [role="article"] directly on post
        // containers even when pagelet attributes and [role="feed"] are absent.
        // Skip nested articles (comment articles inside a parent post article).
        document.querySelectorAll('[role="article"]').forEach((el) => {
            if (!el.parentElement?.closest('[role="article"]')) queueIfNew(el);
        });
    }

    applyToNodes(nodes) {
        if (!this._isEnabled()) return;

        // Re-run the global sweep on every new batch of nodes (infinite scroll).
        this._globalCommentButtonSweep();

        nodes.forEach((node) => {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

            if (node.matches) {
                if (node.matches(PF_SELECTOR_MAP.postContainer)) {
                    this._queuePost(node);
                }
                // Also catch top-level article elements (Facebook Comet feed)
                if (node.matches('[role="article"]') &&
                    !node.parentElement?.closest('[role="article"]')) {
                    this._queuePost(node);
                }
            }

            if (node.querySelectorAll) {
                node.querySelectorAll(PF_SELECTOR_MAP.postContainer)
                    .forEach((post) => this._queuePost(post));
                // Nested article scan
                node.querySelectorAll('[role="article"]').forEach((el) => {
                    if (!el.parentElement?.closest('[role="article"]')) {
                        this._queuePost(el);
                    }
                });
            }
        });
    }


    /**
     * Page-level scan for comment expansion buttons.
     *
     * Covers two distinct button types:
     *
     *  A) innerText-visible buttons — "View more comments", "View all comments",
     *     "See previous comments", "47 comments" inline trigger.
     *
     *  B) Stats-row comment count icon — the speech bubble showing "1.4K" ABOVE
     *     the Like/Comment/Share bar. Its innerText is just "1.4K" (no "comments"
     *     word), but its aria-label is "1,400 Comments". We check aria-label BEFORE
     *     innerText so this button is found even when innerText has no "comments".
     *
     * SELECTOR NOTE: We deliberately do NOT use [aria-label*="comment"] in the
     * CSS selector — that matches the composer textbox (role="textbox") and other
     * non-button containers. We keep the selector narrow (only elements with an
     * explicit interactive role or anchor href) and do the aria-label text check
     * inside the loop. Stats-row buttons nearly always carry role="button" or are
     * anchors, so the narrow selector still catches them.
     *
     * ONE CLICK PER SWEEP: We fire at most one click per call and stop. This
     * prevents simultaneously expanding every visible post's comment section.
     *
     * VIEWPORT RESTRICTION: Only act on elements near the current scroll position
     * (±500 px) — posts the user is actively viewing.
     */
    _globalCommentButtonSweep() {
        if (this._isCoolingDown()) return;

        // Live DOM inspection confirmed: Facebook's stats-row comment count is a
        // PLAIN SPAN with no role — e.g. <span>22 comments</span> inside the
        // "197 reactions · 22 comments" row. It is NOT a div[role="button"].
        // Check plain spans for exact count match BEFORE the role-based scan.
        if (this._globalStatsSpanSweep()) return;

        const candidates = document.querySelectorAll(
            'div[role="button"], span[role="button"], button, a[role="link"], a[href]'
        );

        for (const btn of candidates) {
            if (btn.dataset.pfCpClicked) continue;
            if (!this._isVisible(btn)) continue;

            // Skip the comment composer / textbox — it's not a button we should click.
            if (btn.matches('[contenteditable], [role="textbox"], textarea, input')) continue;
            if (btn.closest('[contenteditable], [role="textbox"], textarea, input')) continue;

            // Viewport restriction — only expand posts the user is currently viewing.
            const rect = btn.getBoundingClientRect();
            if (rect.bottom < -500 || rect.top > window.innerHeight + 500) continue;

            // Build the best-available label string.
            // CRITICAL: aria-label must be checked FIRST. The stats-row speech-bubble
            // button has innerText="1.4K" (just the count) but aria-label="1,400 Comments".
            // Checking innerText first would miss it entirely.
            const ariaLabel = this._normalizeText(
                btn.getAttribute ? (btn.getAttribute('aria-label') || '') : ''
            );
            const titleAttr = this._normalizeText(
                btn.getAttribute ? (btn.getAttribute('title') || '') : ''
            );
            const innerTxt  = (btn.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();

            let matchText = '';
            if (/\bcomments?\b/.test(ariaLabel)) {
                matchText = ariaLabel;
            } else if (/\bcomments?\b/.test(titleAttr)) {
                matchText = titleAttr;
            } else if (/\bcomments?\b/.test(innerTxt)) {
                matchText = innerTxt;
            }

            if (!matchText || matchText.length > 120) continue;

            // Must carry a load-word OR a leading digit count. This rejects:
            //   "Leave a comment"  → no load word, no leading digit → skipped ✓
            //   "Comment"          → no load word, no leading digit → skipped ✓
            //   "Write a comment"  → no load word, no leading digit → skipped ✓
            //   "1,400 Comments"   → leading digit → allowed ✓
            //   "View 22 comments" → load word "view" → allowed ✓
            const hasLoadWord     = /\b(view|see|load|show|previous|more|all)\b/.test(matchText);
            const hasLeadingCount = /^\d/.test(matchText);

            if (!hasLoadWord && !hasLeadingCount) continue;

            // Skip external links (never navigate away from Facebook).
            if (btn.tagName === 'A') {
                const href = (btn.getAttribute('href') || '').toLowerCase();
                if (href && href.startsWith('http') && !href.includes('facebook.com')) continue;
            }

            btn.dataset.pfCpClicked = '1';

            // _safeClick walks up to the nearest clickable ancestor (catching cases
            // where btn is a child div inside <a href>), adds navigation prevention
            // for anchors, and fires the full pointer-event sequence.
            const clicked = this._safeClick(btn);
            if (!clicked) {
                // Cooling down — undo the mark and stop the sweep.
                delete btn.dataset.pfCpClicked;
            }

            // One click per sweep regardless of outcome — stop here.
            // The next sweep (triggered by timer or mutation) will handle the
            // next post in the viewport.
            return;
        }
    }

    /**
     * Secondary scan: finds plain <span> elements whose trimmed innerText exactly
     * matches the comment-count pattern (e.g. "22 comments", "1.4K Comments").
     *
     * Facebook's stats-row renders comment counts as plain spans with React fiber
     * handlers — no explicit role="button", no aria-label, no tabindex. Clicking
     * the span fires React's event delegation and triggers inline comment loading
     * exactly like a user click would.
     *
     * Returns true if a click was fired (caller should stop further scanning).
     */
    _globalStatsSpanSweep() {
        // Exactly "N comments" — the specific comment-count segment.
        // Does NOT match "197 reactions · 22 comments" (too long) or
        // "Leave a comment" (no leading digit).
        const exactCountRe = /^\d[\d,.]*(k|m)?\s+comments?$/i;

        const spans = document.querySelectorAll('span');
        for (const span of spans) {
            if (span.dataset.pfCpClicked) continue;

            const rect = span.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if (rect.bottom < -500 || rect.top > window.innerHeight + 500) continue;

            const text = (span.innerText || '').trim();
            if (!exactCountRe.test(text)) continue;

            span.dataset.pfCpClicked = '1';
            const savedScrollY = window.scrollY;
            try { span.click(); } catch (_) { /* ignore */ }
            this._restoreScrollAndBlur(savedScrollY);
            return true;
        }
        return false;
    }

    /**
     * After clicking any comment trigger, Facebook may:
     *  1. Auto-focus the comment composer (causing the keyboard to pop or the
     *     page to scroll to the text box).
     *  2. Programmatically scroll the viewport to the newly expanded section.
     *
     * We fight both by restoring the saved scroll position and blurring any
     * newly focused text input, repeatedly across a short window to beat React's
     * async setState → layout → scroll pipeline.
     */
    _restoreScrollAndBlur(savedScrollY) {
        [60, 180, 380, 700].forEach((delay) => {
            setTimeout(() => {
                // Restore scroll if it jumped by more than 80 px.
                if (Math.abs(window.scrollY - savedScrollY) > 80) {
                    window.scrollTo({ top: savedScrollY, behavior: 'instant' });
                }
                // Blur any text input that auto-focused (the comment composer).
                const focused = document.activeElement;
                if (focused && focused !== document.body) {
                    if (focused.matches(
                        '[role="textbox"], textarea, input, [contenteditable="true"]'
                    )) {
                        focused.blur();
                    }
                }
            }, delay);
        });
    }

    // ── Intersection + queuing ──────────────────────────────────────────────

    _initIntersectionObserver() {
        if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;

        this.intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const post = entry.target;
                this.intersectionObserver.unobserve(post);
                // Brief delay: allow React to finish hydrating the post's event
                // handlers before we attempt any programmatic click.
                setTimeout(() => this._tryExpand(post), 250);
            });
        }, {
            root: null,
            rootMargin: '320px 0px',
            threshold: 0.01
        });
    }

    _queuePost(post) {
        if (!post) return;
        if (this.processedPosts.has(post) || this.observedPosts.has(post)) return;

        if (!this._isSafeFeedPostCandidate(post)) return;

        post.dataset.pfCpStatus = 'queued';

        if (this.intersectionObserver) {
            this.intersectionObserver.observe(post);
            this.observedPosts.add(post);
        } else {
            this._tryExpand(post);
        }
    }

    // ── Core expand logic ───────────────────────────────────────────────────

    /**
     * Main entry point per post. Three-step cascade:
     *
     *  Step 1 — Stats-row comment count trigger (most reliable)
     *           Finds the "X Comments" clickable above the action bar and clicks
     *           it directly. Then polls for the comment section to appear.
     *
     *  Step 2 — Inline "View X comments" trigger
     *           Finds an already-rendered inline expand button and clicks it.
     *
     *  Step 3 — Action-row primer (fallback)
     *           Clicks the "Leave a comment" / "Comment" button to cause FB to
     *           render the section, then polls adaptively for comments to appear.
     */
    _tryExpand(post) {
        if (!this._isEnabled()) return;
        if (!post || !document.contains(post)) return;
        if (this.processedPosts.has(post)) return;

        // Already expanded — nothing to do.
        if (this._hasOpenCommentSection(post)) {
            this._finalizePost(post);
            return;
        }

        if (this._isCoolingDown()) {
            this._scheduleRetry(post, this._remainingCooldownMs() + 150);
            return;
        }

        // ── Strategy Routing ──────────────────────────────────────────────
        if (this.strategy === 'fetch') {
            this._runFetchExpansion(post);
            return;
        }

        const attempts = (this.postAttempts.get(post) || 0) + 1;
        this.postAttempts.set(post, attempts);

        // ── Step 1: stats-row comment count ─────────────────────────────────
        const countTrigger = this._findCommentCountTrigger(post);
        if (countTrigger) {
            if (this._safeClick(countTrigger)) {
                post.dataset.pfCommentPreview = 'triggered';
                post.dataset.pfCpStatus = 'triggered-count';
                this._pollForCommentSection(post);
            } else if (attempts < this.maxAttemptsPerPost) {
                this._scheduleRetry(post, this._remainingCooldownMs() + 180);
            } else {
                this._finalizePost(post);
            }
            return;
        }

        // ── Step 2: already-rendered inline trigger ──────────────────────────
        const inlineTrigger = this._findInlineCommentTrigger(post);
        if (inlineTrigger) {
            if (this._safeClick(inlineTrigger)) {
                post.dataset.pfCommentPreview = 'true';
                post.dataset.pfCpStatus = 'triggered-inline';
                this._pollForCommentSection(post);
            } else if (attempts < this.maxAttemptsPerPost) {
                this._scheduleRetry(post, this._remainingCooldownMs() + 180);
            } else {
                this._finalizePost(post);
            }
            return;
        }

        // ── Step 3: action-row primer ────────────────────────────────────────
        const primer = this._findActionRowCommentButton(post);
        if (primer) {
            if (this._safeClick(primer)) {
                // Prime click fired — poll adaptively for comment section to load.
                post.dataset.pfCpStatus = 'triggered-primer';
                this._pollForCommentSection(post);
            } else if (attempts < this.maxAttemptsPerPost) {
                this._scheduleRetry(post, this._remainingCooldownMs() + 180);
            } else {
                this._finalizePost(post);
            }
            return;
        }

        // Nothing found yet.
        post.dataset.pfCpStatus = 'no-trigger';
        this._finalizePost(post);
    }

    // ── Fetch Strategy (v3) ─────────────────────────────────────────────────

    async _runFetchExpansion(post) {
        if (this.processedPosts.has(post)) return;

        const postId = PF_PostIDResolver.resolve(post);
        if (!postId) {
            post.dataset.pfCpStatus = 'err-no-id';
            this._finalizePost(post);
            return;
        }

        // Cache check
        if (this.fetchCache.has(postId)) {
            this._injectCommentShell(post, this.fetchCache.get(postId));
            return;
        }

        post.dataset.pfCpStatus = 'fetching';
        
        // Inject shell EARLY with loading state
        const shell = this._injectCommentShell(post, null); 
        
        const comments = await PF_CommentFetcher.fetch(postId);
        
        if (comments && comments.length > 0) {
            this.fetchCache.set(postId, comments);
            this._updateCommentShell(post, shell, comments);
            post.dataset.pfCpStatus = 'fetched';
        } else {
            post.dataset.pfCpStatus = 'err-fetch-empty';
            if (shell) shell.remove();
        }

        this._finalizePost(post);
    }

    _injectCommentShell(post, comments) {
        if (!post) return null;

        // Find a good injection point (usually after the action bar)
        const actionBar = post.querySelector('div[role="toolbar"], div.x6s0dn4.x78zum5.x1q0g3np.x1iyjqo2');
        if (!actionBar) return null;

        // Prevent double injection
        const existing = post.querySelector('.pf-comment-preview-shell');
        if (existing) return existing;

        const shell = document.createElement('div');
        shell.className = 'pf-comment-preview-shell';
        shell.innerHTML = `
            <div class="pf-comment-preview-header">
                <span class="pf-comment-preview-title">Quick Insight</span>
                <span class="pf-comment-preview-meta">Top Comments</span>
            </div>
            <div class="pf-comment-preview-body">
                <div class="pf-comment-preview-loader"></div>
            </div>
        `;

        this._applyShellStyles(shell);
        actionBar.parentElement.insertBefore(shell, actionBar.nextSibling);
        
        if (comments) {
            this._updateCommentShell(post, shell, comments);
        }

        return shell;
    }

    _updateCommentShell(post, shell, comments) {
        if (!shell || !comments) return;

        const body = shell.querySelector('.pf-comment-preview-body');
        if (!body) return;

        body.innerHTML = comments.map(c => `
            <div class="pf-comment-item">
                <img src="${c.avatar}" class="pf-comment-avatar" onerror="this.src='https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png'">
                <div class="pf-comment-content">
                    <div class="pf-comment-author">${c.author}</div>
                    <div class="pf-comment-text">${c.text}</div>
                </div>
            </div>
        `).join('');
    }

    _applyShellStyles(el) {
        // High-end translucent design consistent with PureFusion aesthetics
        Object.assign(el.style, {
            margin: '10px 16px',
            padding: '12px',
            backgroundColor: 'rgba(28, 32, 44, 0.65)',
            backdropFilter: 'blur(8px)',
            borderRadius: '12px',
            border: '1px solid rgba(120, 132, 154, 0.2)',
            fontFamily: '"Segoe UI Variable Text", "Segoe UI", sans-serif',
            color: '#e4e6eb',
            fontSize: '13px',
            lineHeight: '1.4',
            animation: 'pfFadeIn 0.3s ease-out'
        });

        const styleId = 'pf-comment-preview-extra-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                @keyframes pfFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
                .pf-comment-preview-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px; }
                .pf-comment-preview-title { font-weight: 700; font-size: 11px; text-transform: uppercase; color: #1877f2; letter-spacing: 0.5px; }
                .pf-comment-preview-meta { font-size: 10px; color: #b0b3b8; }
                .pf-comment-item { display: flex; gap: 10px; margin-bottom: 8px; }
                .pf-comment-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.1); }
                .pf-comment-author { font-weight: 700; font-size: 12px; color: #e4e6eb; }
                .pf-comment-text { font-size: 12px; color: #b0b3b8; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
                .pf-comment-preview-loader { height: 40px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent); background-size: 200% 100%; animation: pfShimmer 1.5s infinite; border-radius: 6px; }
                @keyframes pfShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
            `;
            document.head.appendChild(style);
        }
    }

    // ── Adaptive polling ────────────────────────────────────────────────────

    /**
     * After a primer/count-trigger click, poll every `pollIntervalMs` until
     * either the comment section appears or the poll budget is exhausted.
     * If a "View X comments" inline trigger appears mid-poll, click it.
     */
    _pollForCommentSection(post, attempt = 0) {
        if (this.processedPosts.has(post)) return;
        if (!document.contains(post)) { this._finalizePost(post); return; }

        if (this._hasOpenCommentSection(post)) {
            this._finalizePost(post);
            return;
        }

        // Check if the inline "View X comments" button has appeared since primer.
        const inlineTrigger = this._findInlineCommentTrigger(post);
        if (inlineTrigger && !this._isCoolingDown()) {
            if (this._safeClick(inlineTrigger)) {
                post.dataset.pfCommentPreview = 'true';
                // Continue polling to confirm section loaded.
                this._schedulePoll(post, attempt + 1);
                return;
            }
        }

        if (attempt < this.maxPollAttempts) {
            this._schedulePoll(post, attempt + 1);
        } else {
            this._finalizePost(post);
        }
    }

    _schedulePoll(post, attempt) {
        if (this.processedPosts.has(post)) return;
        if (this.pollTimers.has(post)) return;

        const timer = setTimeout(() => {
            this.pollTimers.delete(post);
            this._pollForCommentSection(post, attempt);
        }, this.pollIntervalMs);

        this.pollTimers.set(post, timer);
    }

    _scheduleRetry(post, delayMs) {
        if (!post || this.processedPosts.has(post)) return;
        if (this.retryTimers.has(post)) return;

        const timer = setTimeout(() => {
            this.retryTimers.delete(post);
            this._tryExpand(post);
        }, delayMs);

        this.retryTimers.set(post, timer);
    }

    _finalizePost(post) {
        const retryTimer = this.retryTimers.get(post);
        if (retryTimer) { clearTimeout(retryTimer); this.retryTimers.delete(post); }

        const pollTimer = this.pollTimers.get(post);
        if (pollTimer) { clearTimeout(pollTimer); this.pollTimers.delete(post); }

        // Stamp the final status for DOM inspection in DevTools.
        // Only overwrite 'queued' / 'retrying-N' — preserve meaningful triggered/expanded states.
        const cur = post.dataset.pfCpStatus || '';
        if (!cur || cur === 'queued' || cur.startsWith('retrying-')) {
            post.dataset.pfCpStatus = 'done-no-trigger';
        } else {
            post.dataset.pfCpStatus = 'done';
        }

        this.processedPosts.add(post);
    }

    // ── Detection: is the comment section already open? ─────────────────────

    /**
     * Returns true if the post's inline comment section is already open/loaded.
     *
     * NOTE: [role="complementary"] is the PAGE-LEVEL right sidebar — it will
     * never appear inside an individual post element. Do NOT use it here.
     *
     * NOTE: Do NOT check [contenteditable] visibility here. Facebook pre-renders
     * the comment composer (contenteditable) for every post, even before the
     * section is opened. Depending on how it's hidden (visibility:hidden,
     * off-screen positioning, etc.) _isVisible() may return true for it, which
     * would cause a false positive that finalizes posts without any click.
     *
     * Reliable signals:
     *   - Multiple [role="article"] elements: post body (1) + comment articles (2+).
     *   - A visible "View more comments" / "View X comments" button: these only
     *     appear once the comment section is open and partial comments are loaded.
     */
    _hasOpenCommentSection(post) {
        if (!post || !post.querySelector) return false;

        // Multiple articles = post body (1) + at least one comment article (2+)
        if (post.querySelectorAll('[role="article"]').length > 1) return true;

        // A "View more comments" / inline expand button is only rendered once
        // the comment section is open — reliable secondary signal.
        const buttons = post.querySelectorAll('div[role="button"], span[role="button"]');
        for (const btn of buttons) {
            if (!this._isVisible(btn)) continue;
            const label = this._extractLabel(btn);
            if (label && this._isInlineCommentExpandLabel(label)) return true;
        }

        return false;
    }

    // ── Detection: stats-row comment count trigger ──────────────────────────

    /**
     * The "X Comments" element above the Like/Comment/Share bar is the most
     * reliable inline expansion trigger. It opens the comment thread without
     * navigating away. It is usually a div[role="button"] or a span acting as
     * a button, with aria-label containing the count.
     *
     * Priority: aria-label → title → textContent
     */
    _findCommentCountTrigger(post) {
        if (!post || !post.querySelectorAll) return null;

        // Cast a wide net — FB's stats-row comment count is often:
        //  - a plain <a href="/posts/..."> link (React intercepts it client-side)
        //  - a div/span with tabindex="0" but no role
        //  - an element with a descriptive aria-label
        // We intentionally do NOT call _isRiskyNavTarget here: the comment-count
        // link's href (/posts/...) looks "risky" but React prevents navigation and
        // handles it inline. _safeClick adds preventDefault for anchors.
        const candidates = post.querySelectorAll(
            'div[role="button"], span[role="button"], button, a[role="link"], a[href], [aria-label], [tabindex="0"]'
        );

        for (const el of candidates) {
            if (!this._isSafeActionCandidate(el, post)) continue;

            const label = this._extractLabel(el);
            if (!label) continue;

            if (this._isCommentCountLabel(label)) return el;
        }

        return null;
    }

    _isCommentCountLabel(text) {
        // "47 Comments", "1 Comment", "See all 12 comments", "View 3 comments"
        // Also handles: "47 comentarios", "47 Kommentare", "47 commentaires", etc.
        return /^(\d[\d,.]*(k|m)?\s+)?(comments?|comentarios?|commentaires?|kommentare|commenti|коментар|تعليق)$/i.test(text)
            || /^(see all|view all?|ver todos?|voir tous?|alle sehen|vedi tutti?)\s+\d[\d,.]*(k|m)?\s+(comments?|comentarios?|commentaires?|kommentare|commenti)$/i.test(text)
            || /^\d[\d,.]*(k|m)?\s+(comments?|comentarios?|commentaires?|kommentare|commenti)$/i.test(text);
    }

    // ── Detection: inline "View X more comments" button ─────────────────────

    /**
     * Once the comment section is primed/open, FB renders "View X more comments"
     * links inside the thread. These are safe to click — they load more comments
     * inline without navigation.
     */
    _findInlineCommentTrigger(post) {
        const candidates = post.querySelectorAll(
            'div[role="button"], span[role="button"], button, a[role="link"], [aria-label]'
        );

        for (const el of candidates) {
            if (!this._isSafeActionCandidate(el, post)) continue;

            const label = this._extractLabel(el);
            if (!label) continue;

            if (this._isInlineCommentExpandLabel(label)) return el;
        }

        return null;
    }

    _isInlineCommentExpandLabel(text) {
        const patterns = [
            // "View X more comments" / "View previous comments"
            /(view|see|ver)\s+(more|previous|mas|más|anteriores?)\s+comments?/i,
            /(view|ver)\s+all?\s+comments?/i,
            /(voir|afficher)\s+(plus|tous?)\s+(de\s+)?commentaires?/i,
            /(ver|mostrar)\s+(mais|todos)\s+comentarios?/i,
            /(mehr|alle|fruhere|frühere)\s+kommentare\s+(anzeigen|laden)?/i,
            /(mostra|vedi)\s+(altri|tutti|piu)\s+commenti/i,
            // Count patterns: "View 5 more comments"
            /\bview\s+\d+\s+more\s+comments?\b/i,
            /\bver\s+\d+\s+(más|mas)\s+comentarios?\b/i,
            // Numeric-only: "47 Comments" in inline context
            /^\d[\d,.]*(k|m)?\s+(more\s+)?(comments?|comentarios?|commentaires?|kommentare|commenti)$/i,
        ];

        return patterns.some((re) => re.test(text));
    }

    // ── Detection: action-row "Comment" button (primer) ──────────────────────

    /**
     * The action-row Comment button opens the composer. FB hides its label via
     * CSS — `innerText` is typically empty. We MUST use aria-label / title.
     *
     * Validation: confirm the button is in a Like/Comment/Share row by checking
     * that adjacent buttons carry Like or Share signals.
     */
    _findActionRowCommentButton(post) {
        // First pass: direct aria-label match for "Comment"
        const directMatch = this._findDirectCommentButton(post);
        if (directMatch) return directMatch;

        // Second pass: positional (2nd button in Like/Comment/Share toolbar)
        return this._findPositionalCommentButton(post);
    }

    _findDirectCommentButton(post) {
        const commentTokens = [
            'comment', 'comments', 'leave a comment', 'write a comment',
            'comentar', 'comentario', 'comentarios', 'escribe un comentario',
            'commenter', 'commentaire', 'commentaires', 'écrire un commentaire',
            'comente', 'escrever um comentário',
            'kommentar', 'kommentare', 'kommentar schreiben',
            'commenta', 'commenti', 'scrivi un commento',
        ];

        const candidates = post.querySelectorAll(
            'div[role="button"], span[role="button"], button, a[role="link"], [aria-label]'
        );

        for (const el of candidates) {
            if (!this._isSafeActionCandidate(el, post)) continue;
            if (this._isRiskyNavTarget(el)) continue;

            // Use aria-label / title preferentially (FB hides button text)
            const label = this._extractLabel(el);
            if (!label) continue;

            if (commentTokens.some((token) => label === token || label.startsWith(token + ' '))) {
                return el;
            }
        }

        return null;
    }

    _findPositionalCommentButton(post) {
        // FB uses both explicit toolbar roles AND plain div rows for the action bar.
        // Cast a wider net: any element with multiple role="button" children that
        // looks like a Like/Comment/Share row.
        const toolbars = post.querySelectorAll(
            'div[role="group"], div[role="toolbar"], div[role="list"]'
        );

        // Also consider direct flex children of the post that contain 3+ buttons
        const fallbackRows = [];
        if (post.querySelectorAll) {
            post.querySelectorAll('div, li').forEach((el) => {
                if (el.querySelectorAll('[role="button"], button').length >= 3) {
                    fallbackRows.push(el);
                }
            });
        }

        const candidates = [...Array.from(toolbars), ...fallbackRows.slice(0, 5)];

        for (const toolbar of candidates) {
            const buttons = Array.from(
                toolbar.querySelectorAll('div[role="button"], span[role="button"], button, a[role="link"]')
            ).filter((el) => this._isSafeActionCandidate(el, post));

            // Like / Comment / Share row has 3–5 buttons
            if (buttons.length < 3 || buttons.length > 8) continue;

            const firstLabel  = this._extractLabel(buttons[0]);
            const secondLabel = this._extractLabel(buttons[1]);
            const thirdLabel  = buttons[2] ? this._extractLabel(buttons[2]) : '';

            const hasLike = this._containsAnyToken(firstLabel, [
                'like', 'likes', 'me gusta', 'reaccionar',
                "j'aime", 'aime', 'curtir', 'gosto',
                'gefällt mir', 'gefallt mir', 'mi piace',
            ]);
            const hasShare = this._containsAnyToken(thirdLabel, [
                'share', 'compartir', 'partager', 'compartilhar',
                'teilen', 'condividi',
            ]);

            // Must recognise at least the Like or Share bookend
            if (!hasLike && !hasShare) continue;

            // The Comment button (slot 2) — accept even if label is empty (icon-only)
            const candidate = buttons[1];
            if (!candidate) continue;

            // Reject if the label clearly points to something else
            const hasWrongLabel = this._containsAnyToken(secondLabel, [
                'like', 'share', 'compartir', 'partager', 'teilen',
                'send', 'report', 'repost',
            ]);
            if (hasWrongLabel) continue;

            if (!this._isRiskyNavTarget(candidate)) return candidate;
        }

        return null;
    }

    // ── Shared helpers ──────────────────────────────────────────────────────

    /**
     * Extract the best available text label from an element.
     * Priority: aria-label → title → innerText → textContent
     * Facebook hides button text visually — aria-label MUST come first.
     */
    _extractLabel(el) {
        if (!el) return '';

        const candidates = [
            el.getAttribute && el.getAttribute('aria-label'),
            el.getAttribute && el.getAttribute('title'),
            el.innerText,
            el.textContent,
        ];

        for (const raw of candidates) {
            const normalized = this._normalizeText(raw || '');
            if (normalized && normalized.length >= 2 && normalized.length <= 120) {
                return normalized;
            }
        }

        // Also check the first-level clickable child (FB sometimes nests labels)
        const child = el.querySelector && el.querySelector('[aria-label], [title]');
        if (child) {
            const childLabel = this._normalizeText(
                child.getAttribute('aria-label') || child.getAttribute('title') || ''
            );
            if (childLabel && childLabel.length >= 2 && childLabel.length <= 120) {
                return childLabel;
            }
        }

        return '';
    }

    _isSafeFeedPostCandidate(post) {
        if (!post || !post.matches) return false;
        if (post.dataset?.pfHidden === 'true') return false;
        if (post.matches('[role="dialog"], [aria-modal="true"]')) return false;

        // Pagelet-based wrappers are always valid (home feed, ads, etc.)
        if (post.matches('[data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"], [data-pagelet^="GroupsFeedUnit_"], [data-pagelet^="GroupFeedUnit_"]')) return true;

        // Facebook no longer reliably uses [role="article"] inside post wrappers
        // (confirmed via live DOM inspection — articles=0 for all feed candidates).
        // Fall back to action-count heuristic alone.
        const actionCount = post.querySelectorAll('a[role="link"], a[href], [role="button"], button').length;

        // Require at least 3 interactive elements (Like, Comment, Send minimum)
        // but cap at 60 to avoid selecting the entire page container.
        return actionCount >= 3 && actionCount <= 60;
    }

    _isSafeActionCandidate(el, post) {
        if (!el || !post || !post.contains(el)) return false;
        if (!this._isVisible(el)) return false;
        if (el.closest('[contenteditable="true"], [role="textbox"], textarea, input')) return false;
        if (el.closest('[role="menu"], [aria-haspopup="menu"]')) return false;
        // Exclude elements inside the page-level right sidebar / complementary region
        // (e.g. "Sponsored" sidebar ads that share the same post-like markup)
        if (el.closest('[role="complementary"]')) return false;
        return true;
    }

    _isRiskyNavTarget(el) {
        if (!el) return false;

        const anchor = el.matches('a[href]') ? el : el.closest('a[href]');
        if (!anchor) return false;

        const href   = (anchor.getAttribute('href') || '').toLowerCase();
        if (!href) return false;

        const target = (anchor.getAttribute('target') || '').toLowerCase();
        if (target && target !== '_self') return true;

        if (href === '#' || href.startsWith('javascript:')) return false;

        const riskyTokens = [
            '/posts/', '/permalink/', '/videos/', '/watch/', '/reel/',
            '/photo/', '/photos/', '/story.php', '/events/',
            'story_fbid=', 'comment_id=',
        ];
        if (riskyTokens.some((token) => href.includes(token))) return true;

        let parsed;
        try { parsed = new URL(href, window.location.origin); } catch { return true; }

        const host = String(parsed.hostname || '').toLowerCase();
        if (!host) return true;

        const isFBHost = host === 'facebook.com'
            || host.endsWith('.facebook.com')
            || host === 'm.facebook.com';

        return !isFBHost;
    }

    _safeClick(el) {
        if (this._isCoolingDown()) return false;

        // Capture scroll position BEFORE the click so we can restore it if
        // Facebook auto-scrolls to the newly expanded comment section.
        const savedScrollY = window.scrollY;

        try {
            // Walk up to find the nearest clickable ancestor — avoids clicking a
            // child icon/svg when the parent button is the actual handler.
            // Include a[href] so stats-row comment-count links are resolved.
            const target = (el.closest && (
                el.closest('div[role="button"], span[role="button"], button, a[role="link"], a[href]') || el
            )) || el;

            const isAnchor  = target.tagName === 'A';
            const isRoleBtn = !isAnchor && target.getAttribute && target.getAttribute('role') === 'button';

            // For anchor targets: add a capture-phase preventDefault so the
            // browser doesn't navigate. React's handler still fires because
            // React uses bubble-phase delegation and reads defaultPrevented only
            // for its own router — comment-section expansion uses a different path.
            let preventNav = null;
            if (isAnchor) {
                preventNav = (e) => e.preventDefault();
                target.addEventListener('click', preventNav, { once: true, capture: true });
            }

            // Send a pointer-down/up sequence before click. Some React handlers on
            // Facebook are wired to pointerdown, not click. Providing the full
            // sequence maximises compatibility without needing isTrusted.
            const rect = target.getBoundingClientRect();
            const cx = Math.round(rect.left + rect.width  / 2);
            const cy = Math.round(rect.top  + rect.height / 2);
            const ptrOpts = { bubbles: true, cancelable: true, view: window,
                              clientX: cx, clientY: cy, pointerId: 1, isPrimary: true };
            target.dispatchEvent(new PointerEvent('pointerdown', ptrOpts));
            target.dispatchEvent(new PointerEvent('pointerup',   ptrOpts));
            target.click();

            // Belt-and-suspenders for role="button" elements: React-based interactive
            // elements often have keyboard handlers (Enter/Space) that are separate
            // from their click handlers. Firing a keydown Enter after the click
            // increases the chance that at least one of the handler paths fires.
            if (isRoleBtn) {
                try { target.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
                const kOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
                                bubbles: true, cancelable: true, view: window };
                target.dispatchEvent(new KeyboardEvent('keydown', kOpts));
                target.dispatchEvent(new KeyboardEvent('keyup',   kOpts));
            }

            // Belt-and-suspenders: clean up the nav guard if click() somehow
            // didn't fire the event.
            if (preventNav) {
                setTimeout(() => target.removeEventListener('click', preventNav, true), 100);
            }

            this.lastActionAt = Date.now();

            // Prevent Facebook from auto-scrolling the viewport to the newly
            // expanded comment composer and from stealing keyboard focus.
            this._restoreScrollAndBlur(savedScrollY);

            return true;
        } catch (_) {
            return false;
        }
    }

    _isVisible(el) {
        if (!el.getBoundingClientRect) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    _normalizeText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    _containsAnyToken(text, tokens) {
        if (!text || !Array.isArray(tokens)) return false;
        return tokens.some((token) => text.includes(token));
    }

    // ── Cooldown + surface ──────────────────────────────────────────────────

    _isEnabled() {
        return !!this.settings?.social?.autoCommentPreview && this._isSurfaceAllowed();
    }

    _isCoolingDown() {
        if (!this.lastActionAt) return false;
        return (Date.now() - this.lastActionAt) < this.minActionGapMs;
    }

    _remainingCooldownMs() {
        if (!this.lastActionAt) return 0;
        return Math.max(0, this.minActionGapMs - (Date.now() - this.lastActionAt));
    }

    _isSurfaceAllowed() {
        const social = this.settings?.social || {};
        switch (this._currentSurface()) {
            case 'home':          return social.commentPreviewAllowHome !== false;
            case 'groups':        return !!social.commentPreviewAllowGroups;
            case 'watch':         return !!social.commentPreviewAllowWatch;
            case 'marketplace':   return !!social.commentPreviewAllowMarketplace;
            case 'notifications': return !!social.commentPreviewAllowNotifications;
            default:              return !!social.commentPreviewAllowOther;
        }
    }

    _currentSurface() {
        const p = String(window?.location?.pathname || '/').toLowerCase();
        if (p === '/' || p === '/home.php') return 'home';
        if (p.startsWith('/groups'))        return 'groups';
        if (p.startsWith('/watch'))         return 'watch';
        if (p.startsWith('/marketplace'))   return 'marketplace';
        if (p.startsWith('/notifications')) return 'notifications';
        return 'other';
    }

    _syncRuntimeConfig() {
        const s = this.settings?.social || {};
        this.maxAttemptsPerPost = this._clamp(s.commentPreviewRetryCap, 1, 10, 4);
        this.maxPostsPerSweep   = this._clamp(s.commentPreviewMaxPostsPerSweep, 10, 60, 30);
        this.minActionGapMs     = this._clamp(s.commentPreviewCooldownMs, 300, 5000, 1200);
        
        // Default to fetch (v3) unless explicitly set to click (v2)
        this.strategy = s.commentPreviewStrategy === 'click' ? 'click' : 'fetch';
    }

    _clamp(value, min, max, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, Math.round(n)));
    }
}

window.PF_CommentPreview = PF_CommentPreview;
