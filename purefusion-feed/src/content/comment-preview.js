/**
 * PureFusion Feed - Inline Comment Preview
 *
 * Progressively expands comment snippets on visible feed posts without opening
 * the full post modal. If no safe inline trigger is found, this module no-ops.
 */

class PF_CommentPreview {
    constructor(settings) {
        this.settings = settings;
        this.observedPosts = new WeakSet();
        this.processedPosts = new WeakSet();
        this.postAttempts = new WeakMap();
        this.retryTimers = new WeakMap();
        this.intersectionObserver = null;
        this.maxAttemptsPerPost = 4;
        this.maxPostsPerSweep = 30;
        this.minActionGapMs = 1200;
        this.lastActionAt = 0;

        this._syncRuntimeConfig();

        this._initIntersectionObserver();
    }

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
                const posts = node.querySelectorAll(PF_SELECTOR_MAP.postContainer);
                posts.forEach((post) => this._queuePost(post));
            }
        });
    }

    _initIntersectionObserver() {
        if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;

        this.intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;

                const post = entry.target;
                this.intersectionObserver.unobserve(post);
                this._tryExpandInlineComments(post);
            });
        }, {
            root: null,
            rootMargin: '320px 0px',
            threshold: 0.01
        });
    }

    _queuePost(post) {
        if (!post || this.processedPosts.has(post) || this.observedPosts.has(post)) return;
        if (!this._isSafeFeedPostCandidate(post)) return;

        if (this.intersectionObserver) {
            this.intersectionObserver.observe(post);
            this.observedPosts.add(post);
        } else {
            this._tryExpandInlineComments(post);
        }
    }

    _tryExpandInlineComments(post) {
        if (!this._isEnabled()) return;
        if (!post || !document.contains(post)) return;
        if (this.processedPosts.has(post)) return;

        if (this._isCoolingDown()) {
            this._scheduleRetry(post, this._remainingCooldownMs() + 120);
            return;
        }

        const attempts = (this.postAttempts.get(post) || 0) + 1;
        this.postAttempts.set(post, attempts);

        const trigger = this._findInlineCommentTrigger(post);
        if (trigger) {
            if (this._safeClick(trigger)) {
                post.dataset.pfCommentPreview = 'true';
                this._finalizePost(post);
            } else if (attempts < this.maxAttemptsPerPost) {
                this._scheduleRetry(post, this._remainingCooldownMs() + 180);
            }
            return;
        }

        // If comments are not yet inlined, prime the post by opening the
        // inline comment section first, then retry once comments hydrate.
        const primer = this._findInlineCommentPrimer(post);
        if (primer) {
            if (this._safeClick(primer)) {
                this._scheduleRetry(post, 900);
            } else if (attempts < this.maxAttemptsPerPost) {
                this._scheduleRetry(post, this._remainingCooldownMs() + 180);
            }
            return;
        }

        if (attempts < this.maxAttemptsPerPost) {
            this._scheduleRetry(post, 1200);
        } else {
            this._finalizePost(post);
        }
    }

    _scheduleRetry(post, delayMs) {
        if (!post || this.processedPosts.has(post)) return;
        if (this.retryTimers.has(post)) return;

        const timer = setTimeout(() => {
            this.retryTimers.delete(post);
            this._tryExpandInlineComments(post);
        }, delayMs);

        this.retryTimers.set(post, timer);
    }

    _finalizePost(post) {
        const timer = this.retryTimers.get(post);
        if (timer) {
            clearTimeout(timer);
            this.retryTimers.delete(post);
        }
        this.processedPosts.add(post);
    }

    _findInlineCommentTrigger(post) {
        const candidates = post.querySelectorAll('div[role="button"], span[role="button"], button, a[role="link"], [aria-label]');

        for (const el of candidates) {
            if (!this._isSafeCommentActionCandidate(el, post)) continue;

            const text = this._normalizeText(
                el.innerText
                || el.textContent
                || el.getAttribute('aria-label')
                || el.getAttribute('title')
                || ''
            );

            if (!text) continue;
            if (this._isLikelyInlineCommentAction(text)) return el;
        }

        return null;
    }

    _findInlineCommentPrimer(post) {
        const candidates = post.querySelectorAll('div[role="button"], span[role="button"], button, a[role="link"], [aria-label]');

        for (const el of candidates) {
            if (!this._isSafeCommentActionCandidate(el, post)) continue;

            const text = this._normalizeText(
                el.innerText
                || el.textContent
                || el.getAttribute('aria-label')
                || el.getAttribute('title')
                || ''
            );

            if (!text) continue;
            if (this._isLikelyInlineCommentAction(text)) continue;
            if (this._isLikelyCommentPrimerAction(text)) return el;
        }

        const footerCommentButton = this._findFooterCommentButton(post);
        if (footerCommentButton && !this._isRiskyNavigationTarget(footerCommentButton)) {
            return footerCommentButton;
        }

        const positionalCommentButton = this._findCommentActionByPosition(post);
        if (positionalCommentButton && !this._isRiskyNavigationTarget(positionalCommentButton)) {
            return positionalCommentButton;
        }

        return null;
    }

    _findFooterCommentButton(post) {
        const candidates = post.querySelectorAll('div[role="button"], span[role="button"], button, a[role="link"], [aria-label], [title]');
        const commentTokens = [
            'comment', 'comments',
            'comentar', 'comentario', 'comentarios',
            'commenter', 'commentaires',
            'comente', 'comentarios',
            'kommentar', 'kommentare',
            'commenta', 'commenti'
        ];

        for (const el of candidates) {
            if (!this._isSafeCommentActionCandidate(el, post)) continue;

            const label = this._normalizeText(
                el.getAttribute('aria-label')
                || el.getAttribute('title')
                || el.innerText
                || el.textContent
                || ''
            );

            if (!label) continue;
            if (commentTokens.some((token) => label.includes(token))) return el;
        }

        return null;
    }

    _findCommentActionByPosition(post) {
        const groups = post.querySelectorAll('div[role="group"], div[role="toolbar"]');

        for (const group of groups) {
            const buttons = Array.from(group.querySelectorAll('div[role="button"], span[role="button"], button, a[role="link"]'))
                .filter((el) => this._isSafeCommentActionCandidate(el, post));

            if (buttons.length < 3 || buttons.length > 8) continue;

            // The primary action row is typically Like / Comment / Share.
            const likelyComment = buttons[1];
            if (!likelyComment) continue;

            const firstLabel = this._normalizeText(
                buttons[0].innerText
                || buttons[0].textContent
                || buttons[0].getAttribute('aria-label')
                || buttons[0].getAttribute('title')
                || ''
            );

            const thirdLabel = this._normalizeText(
                (buttons[2] && (buttons[2].innerText
                || buttons[2].textContent
                || buttons[2].getAttribute('aria-label')
                || buttons[2].getAttribute('title')))
                || ''
            );

            const hasLikeSignal = this._containsAnyToken(firstLabel, [
                'like', 'likes', 'me gusta', 'reaccionar',
                'j aime', 'aime',
                'curtir', 'gosto',
                'gefallt', 'gefallt mir',
                'mi piace'
            ]);

            const hasShareSignal = this._containsAnyToken(thirdLabel, [
                'share', 'shared', 'compartir', 'compartido',
                'partager', 'partage',
                'compartilhar',
                'teilen',
                'condividi', 'condividere'
            ]);

            if (!hasLikeSignal && !hasShareSignal) continue;

            const label = this._normalizeText(
                likelyComment.innerText
                || likelyComment.textContent
                || likelyComment.getAttribute('aria-label')
                || likelyComment.getAttribute('title')
                || ''
            );

            // Accept if it clearly says comment, or if it's action-row-like with no text.
            if (this._isLikelyCommentPrimerAction(label) || label === '') {
                return likelyComment;
            }
        }

        return null;
    }

    _isLikelyInlineCommentAction(text) {
        const patterns = [
            /(view|see|ver)\s+(more|previous|mas|más|anteriores?)\s+comments?/i,
            /(view|ver)\s+comments?/i,
            /(view|see|ver)\s+(more|previous|mas|más|anteriores?)\s+comentarios?/i,
            /(view|ver)\s+comentarios?/i,
            /(voir|afficher)\s+(plus|les)\s+de\s+commentaires?/i,
            /(ver|mostrar)\s+mais\s+comentarios?/i,
            /(mehr|alle|fruhere|frühere)\s+kommentare\s+anzeigen/i,
            /(mostra|vedi)\s+(altri|piu)\s+commenti/i,
            /\b\d+[\d.,]*\s+comments?\b/i,
            /\b\d+[\d.,]*\s+comentarios?\b/i,
            /\b\d+[\d.,]*\s+commentaires?\b/i,
            /\b\d+[\d.,]*\s+kommentare\b/i,
            /\b\d+[\d.,]*\s+commenti\b/i
        ];

        return patterns.some((re) => re.test(text));
    }

    _isLikelyCommentPrimerAction(text) {
        const patterns = [
            /^comment$/i,
            /^comments$/i,
            /^comentar$/i,
            /^comentario$/i,
            /^comentarios$/i,
            /^commenter$/i,
            /^commentaire$/i,
            /^commentaires$/i,
            /^comente$/i,
            /^kommentar$/i,
            /^kommentare$/i,
            /^commenta$/i,
            /^commenti$/i,
            /leave a comment/i,
            /write a comment/i,
            /escribe un comentario/i,
            /ecrire un commentaire/i,
            /escrever um comentario/i,
            /kommentar schreiben/i,
            /scrivi un commento/i
        ];

        return patterns.some((re) => re.test(text));
    }

    _isRiskyNavigationTarget(el) {
        if (!el) return false;

        const anchor = el.matches('a[href]') ? el : el.closest('a[href]');
        if (!anchor) return false;

        const href = (anchor.getAttribute('href') || '').toLowerCase();
        if (!href) return false;

        const target = (anchor.getAttribute('target') || '').toLowerCase();
        if (target && target !== '_self') return true;

        // Safe-ish anchors used as button wrappers
        if (href === '#' || href.startsWith('javascript:')) return false;

        // Avoid opening full post pages/reels/videos.
        const risky = [
            '/posts/',
            '/permalink/',
            '/videos/',
            '/watch/',
            '/reel/',
            '/photo/',
            '/photos/',
            '/story.php',
            '/events/',
            'story_fbid=',
            'comment_id='
        ];

        if (risky.some((token) => href.includes(token))) return true;

        let parsed;
        try {
            parsed = new URL(href, window.location.origin);
        } catch (err) {
            return true;
        }

        const host = String(parsed.hostname || '').toLowerCase();
        if (!host) return true;

        const isFacebookHost = host === 'facebook.com'
            || host.endsWith('.facebook.com')
            || host === 'm.facebook.com';

        return !isFacebookHost;
    }

    _isSafeFeedPostCandidate(post) {
        if (!post || !post.matches) return false;
        if (post.dataset?.pfHidden === 'true') return false;
        if (post.matches('[role="dialog"], [aria-modal="true"]')) return false;

        if (post.matches('[data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"]')) return true;

        const hasArticle = !!post.querySelector('[role="article"]');
        const actionCount = post.querySelectorAll('a[role="link"], a[href], [role="button"], button').length;
        return hasArticle && actionCount >= 6;
    }

    _isSafeCommentActionCandidate(el, post) {
        if (!el || !post || !post.contains(el)) return false;
        if (!this._isVisible(el)) return false;
        if (el.closest('[contenteditable="true"], [role="textbox"], textarea, input')) return false;
        if (el.closest('[role="menu"], [aria-haspopup="menu"]')) return false;
        if (this._isRiskyNavigationTarget(el)) return false;
        return true;
    }

    _containsAnyToken(text, tokens) {
        if (!text || !Array.isArray(tokens) || tokens.length === 0) return false;
        return tokens.some((token) => text.includes(token));
    }

    _safeClick(el) {
        if (this._isCoolingDown()) return false;

        try {
            const target = (el.closest && (el.closest('div[role="button"], span[role="button"], button, a[role="link"]') || el)) || el;

            ['mousedown', 'mouseup', 'click'].forEach((type) => {
                target.dispatchEvent(new MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    view: window
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
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    _normalizeText(text) {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    _isEnabled() {
        return !!this.settings?.social?.autoCommentPreview && this._isSurfaceAllowed();
    }

    _syncRuntimeConfig() {
        const social = this.settings?.social || {};

        this.maxAttemptsPerPost = this._clampInt(social.commentPreviewRetryCap, 1, 10, 4);
        this.maxPostsPerSweep = this._clampInt(social.commentPreviewMaxPostsPerSweep, 10, 60, 30);
        this.minActionGapMs = this._clampInt(social.commentPreviewCooldownMs, 300, 5000, 1200);
    }

    _clampInt(value, min, max, fallback) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(min, Math.min(max, Math.round(parsed)));
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
        const key = this._getCurrentSurfaceKey();

        switch (key) {
            case 'home': return social.commentPreviewAllowHome !== false;
            case 'groups': return !!social.commentPreviewAllowGroups;
            case 'watch': return !!social.commentPreviewAllowWatch;
            case 'marketplace': return !!social.commentPreviewAllowMarketplace;
            case 'notifications': return !!social.commentPreviewAllowNotifications;
            default: return !!social.commentPreviewAllowOther;
        }
    }

    _getCurrentSurfaceKey() {
        const pathname = String(window?.location?.pathname || '/').toLowerCase();

        if (pathname === '/' || pathname === '/home.php') return 'home';
        if (pathname.startsWith('/groups')) return 'groups';
        if (pathname.startsWith('/watch')) return 'watch';
        if (pathname.startsWith('/marketplace')) return 'marketplace';
        if (pathname.startsWith('/notifications')) return 'notifications';
        return 'other';
    }
}

window.PF_CommentPreview = PF_CommentPreview;
