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
        this.intersectionObserver = null;

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

        const trigger = this._findInlineCommentTrigger(post);
        if (trigger) {
            this._safeClick(trigger);
            post.dataset.pfCommentPreview = 'true';
        }

        this.processedPosts.add(post);
    }

    _findInlineCommentTrigger(post) {
        const candidates = post.querySelectorAll('div[role="button"], span[role="button"], button, [aria-label]');

        for (const el of candidates) {
            if (!this._isVisible(el)) continue;
            if (el.closest('a[href]')) continue;

            const text = this._normalizeText(
                el.innerText
                || el.textContent
                || el.getAttribute('aria-label')
                || ''
            );

            if (!text) continue;
            if (this._isLikelyInlineCommentAction(text)) return el;
        }

        return null;
    }

    _isLikelyInlineCommentAction(text) {
        const patterns = [
            /(view|see|ver)\s+(more|previous|mas|más|anteriores?)\s+comments?/i,
            /(view|ver)\s+comments?/i,
            /(view|see|ver)\s+(more|previous|mas|más|anteriores?)\s+comentarios?/i,
            /(view|ver)\s+comentarios?/i
        ];

        return patterns.some((re) => re.test(text));
    }

    _safeClick(el) {
        try {
            el.click();
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
