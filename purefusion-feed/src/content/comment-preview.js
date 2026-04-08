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
        this.maxAttemptsPerPost = 8;

        this._initIntersectionObserver();
    }

    updateSettings(settings) {
        this.settings = settings;
    }

    sweepDocument() {
        if (!this._isEnabled()) return;

        const posts = document.querySelectorAll(PF_SELECTOR_MAP.postContainer);
        let count = 0;

        posts.forEach((post) => {
            if (count >= 30) return;
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
        if (post.matches && post.matches('[role="dialog"]')) return;

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

        const attempts = (this.postAttempts.get(post) || 0) + 1;
        this.postAttempts.set(post, attempts);

        const trigger = this._findInlineCommentTrigger(post);
        if (trigger) {
            this._safeClick(trigger);
            post.dataset.pfCommentPreview = 'true';
            this._finalizePost(post);
            return;
        }

        // If comments are not yet inlined, prime the post by opening the
        // inline comment section first, then retry once comments hydrate.
        const primer = this._findInlineCommentPrimer(post);
        if (primer) {
            this._safeClick(primer);
            this._scheduleRetry(post, 900);
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
            if (!this._isVisible(el)) continue;
            if (this._isRiskyNavigationTarget(el)) continue;

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
            if (!this._isVisible(el)) continue;
            if (this._isRiskyNavigationTarget(el)) continue;
            if (el.closest('[contenteditable="true"], [role="textbox"]')) continue;

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
        const commentTokens = ['comment', 'comments', 'comentar', 'comentario', 'comentarios'];

        for (const el of candidates) {
            if (!this._isVisible(el)) continue;

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
                .filter((el) => this._isVisible(el));

            if (buttons.length < 3 || buttons.length > 8) continue;

            // The primary action row is typically Like / Comment / Share.
            const likelyComment = buttons[1];
            if (!likelyComment) continue;

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
            /\b\d+[\d.,]*\s+comments?\b/i,
            /\b\d+[\d.,]*\s+comentarios?\b/i
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
            /leave a comment/i,
            /write a comment/i,
            /escribe un comentario/i
        ];

        return patterns.some((re) => re.test(text));
    }

    _isRiskyNavigationTarget(el) {
        if (!el) return false;

        const anchor = el.matches('a[href]') ? el : el.closest('a[href]');
        if (!anchor) return false;

        const href = (anchor.getAttribute('href') || '').toLowerCase();
        if (!href) return false;

        // Safe-ish anchors used as button wrappers
        if (href === '#' || href.startsWith('javascript:')) return false;

        // Avoid opening full post pages/reels/videos.
        const risky = [
            '/posts/',
            '/permalink/',
            '/videos/',
            '/watch/',
            '/reel/',
            'story_fbid=',
            'comment_id='
        ];

        return risky.some((token) => href.includes(token));
    }

    _safeClick(el) {
        try {
            const target = (el.closest && (el.closest('div[role="button"], span[role="button"], button, a[role="link"]') || el)) || el;

            ['mousedown', 'mouseup', 'click'].forEach((type) => {
                target.dispatchEvent(new MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    view: window
                }));
            });
        } catch (err) {
            PF_Logger.warn('PF_CommentPreview: click failed.', err);
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
        return !!this.settings?.social?.autoCommentPreview;
    }
}

window.PF_CommentPreview = PF_CommentPreview;
