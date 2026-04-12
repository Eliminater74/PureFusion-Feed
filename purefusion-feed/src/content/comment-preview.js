/**
 * PureFusion Feed - Inline Comment Preview (v2 hardened)
 *
 * Progressively expands comment snippets on visible feed posts without opening
 * the full post modal or triggering page navigation.
 *
 * KEY FINDINGS (from live DOM inspection):
 *  - Facebook hides button labels via CSS — `innerText` is empty on action-row
 *    buttons. Detection MUST use `aria-label` / `title` as the primary signal.
 *  - When a post's comment section is open, the comment container is given
 *    `role="complementary"`. This is the reliable "comments loaded" indicator.
 *  - The stats-row "X Comments" element (above Like/Comment/Share) is the most
 *    reliable click trigger — it opens the inline comment thread directly.
 *  - The action-row "Comment" button click opens only the text composer, NOT
 *    existing comments. It serves as a primer that causes FB to render the
 *    comment section, after which we poll for the inline trigger.
 *
 * OFF BY DEFAULT. Experimental/beta — must be explicitly enabled.
 */

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
        this.maxPollAttempts        = 8;    // 8 × 220 ms ≈ 1.76 s adaptive window
        this.lastActionAt           = 0;

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

        const posts = document.querySelectorAll(PF_SELECTOR_MAP.postContainer);
        let count = 0;

        posts.forEach((post) => {
            if (count >= this.maxPostsPerSweep) return;
            this._queuePost(post);
            count += 1;
        });
    }

    applyToNodes(nodes) {
        if (!this._isEnabled()) return;

        nodes.forEach((node) => {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

            if (node.matches && node.matches(PF_SELECTOR_MAP.postContainer)) {
                this._queuePost(node);
            }

            if (node.querySelectorAll) {
                node.querySelectorAll(PF_SELECTOR_MAP.postContainer)
                    .forEach((post) => this._queuePost(post));
            }
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
                this._tryExpand(post);
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
     *           Clicks the "Comment" button to cause FB to render the section,
     *           then polls adaptively for the inline trigger to appear.
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

        const attempts = (this.postAttempts.get(post) || 0) + 1;
        this.postAttempts.set(post, attempts);

        // ── Step 1: stats-row comment count ─────────────────────────────────
        const countTrigger = this._findCommentCountTrigger(post);
        if (countTrigger) {
            if (this._safeClick(countTrigger)) {
                post.dataset.pfCommentPreview = 'triggered';
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
                this._pollForCommentSection(post);
            } else if (attempts < this.maxAttemptsPerPost) {
                this._scheduleRetry(post, this._remainingCooldownMs() + 180);
            } else {
                this._finalizePost(post);
            }
            return;
        }

        // Nothing found yet — retry if budget allows.
        if (attempts < this.maxAttemptsPerPost) {
            this._scheduleRetry(post, 1400);
        } else {
            this._finalizePost(post);
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

        this.processedPosts.add(post);
    }

    // ── Detection: is the comment section already open? ─────────────────────

    /**
     * Facebook marks the open comment section container with role="complementary".
     * Confirmed via live DOM inspection — this is the reliable signal.
     */
    _hasOpenCommentSection(post) {
        if (!post || !post.querySelector) return false;

        // Primary: complementary role (confirmed in live FB DOM)
        if (post.querySelector('[role="complementary"]')) return true;

        // Secondary: multiple [role="article"] means at least one comment loaded
        // (the post body is one article; comments add more inside the same wrapper)
        const articles = post.querySelectorAll('[role="article"]');
        if (articles.length > 1) return true;

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

        const candidates = post.querySelectorAll(
            'div[role="button"], span[role="button"], a[role="link"], [aria-label]'
        );

        for (const el of candidates) {
            if (!this._isSafeActionCandidate(el, post)) continue;
            if (this._isRiskyNavTarget(el)) continue;

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
        const toolbars = post.querySelectorAll('div[role="group"], div[role="toolbar"]');

        for (const toolbar of toolbars) {
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

        if (post.matches('[data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"]')) return true;

        const hasArticle   = !!post.querySelector('[role="article"]');
        const actionCount  = post.querySelectorAll('a[role="link"], a[href], [role="button"], button').length;
        return hasArticle && actionCount >= 4;
    }

    _isSafeActionCandidate(el, post) {
        if (!el || !post || !post.contains(el)) return false;
        if (!this._isVisible(el)) return false;
        if (el.closest('[contenteditable="true"], [role="textbox"], textarea, input')) return false;
        if (el.closest('[role="menu"], [aria-haspopup="menu"]')) return false;
        // Exclude comment composer rows
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

        try {
            const target = (el.closest && (
                el.closest('div[role="button"], span[role="button"], button, a[role="link"]') || el
            )) || el;

            ['mousedown', 'mouseup', 'click'].forEach((type) => {
                target.dispatchEvent(new MouseEvent(type, {
                    bubbles: true, cancelable: true, view: window
                }));
            });

            this.lastActionAt = Date.now();
            return true;
        } catch (err) {
            PF_Logger.warn('PF_CommentPreview: click failed.', err);
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
        this.maxAttemptsPerPost = this._clamp(s.commentPreviewRetryCap,        1,  10, 4);
        this.maxPostsPerSweep   = this._clamp(s.commentPreviewMaxPostsPerSweep, 10, 60, 30);
        this.minActionGapMs     = this._clamp(s.commentPreviewCooldownMs,       300, 5000, 1200);
    }

    _clamp(value, min, max, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, Math.round(n)));
    }
}

window.PF_CommentPreview = PF_CommentPreview;
