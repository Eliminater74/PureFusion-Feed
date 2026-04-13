/**
 * PureFusion Feed - General Helpers
 * 
 * Reusable utility functions for DOM manipulation, string matching, etc.
 */

const PF_Helpers = {
    _toastContainer: null,

    /**
     * Standard debounce function to throttle intense observer events.
     * @param {Function} func The function to execute
     * @param {number} wait Milliseconds to wait
     * @returns {Function}
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Polyfill-like logic to find elements containing specific text strings.
     * Standard document.querySelectorAll does not support :contains() natively.
     * @param {HTMLElement} root Node to search within
     * @param {string} selector Basic CSS selector to filter element types
     * @param {string} text Exact or partial text to find
     * @returns {Array<HTMLElement>} Array of matching elements
     */
    findContains(root, selector, text) {
        const elements = root.querySelectorAll(selector);
        // Strip zero-width / invisible chars that FB injects to defeat text matching
        const strip = (s) => String(s || '').replace(/[\u00ad\u200b-\u200f\u2028\u2029\u202a-\u202f\u2060\u2061\ufeff]/g, '');
        const needle = strip(text).toLowerCase();
        return Array.from(elements).filter(element => {
            if (!element.textContent) return false;
            return strip(element.textContent).toLowerCase().includes(needle);
        });
    },

    /**
     * Climbs up the DOM tree from a given element to find the nearest parent
     * that matches the given selector.
     * @param {HTMLElement} element Starting node
     * @param {string} parentSelector CSS Selector to match
     * @param {number} maxDepth Stop searching after N traversals to prevent infinite loops
     * @returns {HTMLElement|null} The matched parent, or null if not found
     */
    getClosest(element, parentSelector, maxDepth = 20) {
        let depth = 0;
        let current = element;
        while (current && current !== document.documentElement && depth < maxDepth) {
            if (current.matches && current.matches(parentSelector)) {
                return current;
            }
            current = current.parentElement;
            depth++;
        }
        return null;
    },

    /**
     * Hide an element securely by overriding its state
     * @param {HTMLElement} node 
     * @param {string} reason Optional string explaining why it was hidden (for debugging)
     */
    hideElement(node, reason = "Filtered") {
        if (!node) return;
        if (node.matches && node.matches('html, body, [role="main"], [role="feed"], [role="banner"], [role="navigation"], [role="complementary"]')) return;
        if (node.querySelector && (node.querySelector('[role="feed"]') || node.querySelector('[role="main"]') || node.querySelector('[role="navigation"]') || node.querySelector('[role="complementary"]'))) return;

        if (node.getBoundingClientRect) {
            const rect = node.getBoundingClientRect();
            if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.7) return;
            if (rect.width > window.innerWidth * 0.45 && rect.height > window.innerHeight * 0.55) return;
        }

        node.style.setProperty('display', 'none', 'important');
        node.dataset.pfHidden = 'true';
        node.dataset.pfReason = reason;

        try {
            window.dispatchEvent(new CustomEvent('pf:element_hidden', {
                detail: {
                    reason,
                    tag: node.tagName || 'UNKNOWN',
                    role: node.getAttribute ? (node.getAttribute('role') || '') : '',
                    pagelet: node.getAttribute ? (node.getAttribute('data-pagelet') || '') : ''
                }
            }));
        } catch (err) {
            // no-op for diagnostics event failures
        }
    },

    /**
     * Soft dim an element (used by AI Low Relevance system)
     * @param {HTMLElement} node 
     */
    dimElement(node) {
        if (!node) return;
        node.style.setProperty('opacity', '0.3', 'important');
        node.style.setProperty('transition', 'opacity 0.2s', 'important');
        node.dataset.pfDimmed = 'true';
        
        // Remove dim on hover so user can still see it if they try
        node.addEventListener('mouseenter', () => node.style.setProperty('opacity', '1', 'important'), { once: true });
        node.addEventListener('mouseleave', () => node.style.setProperty('opacity', '0.3', 'important'));
    },

    showToast(message, type = 'info', timeout = 3200) {
        this._renderToast({
            message,
            type,
            timeout
        });
    },

    showActionToast(message, actionLabel, onAction, type = 'info', timeout = 5200) {
        this._renderToast({
            message,
            type,
            timeout,
            actionLabel,
            onAction
        });
    },

    _renderToast({ message, type = 'info', timeout = 3200, actionLabel = '', onAction = null } = {}) {
        if (!message || typeof document === 'undefined') return;

        if (!this._toastContainer || !document.contains(this._toastContainer)) {
            this._injectToastStyles();
            this._toastContainer = document.createElement('div');
            this._toastContainer.id = 'pf-toast-container';
            document.body.appendChild(this._toastContainer);
        }

        const toast = document.createElement('div');
        toast.className = `pf-toast pf-toast-${type}`;
        const hasAction = !!(actionLabel && typeof onAction === 'function');
        if (hasAction) toast.classList.add('pf-toast-actionable');

        const icons = {
            success: '✓',
            error: '!',
            warn: '!',
            info: 'i'
        };

        const iconEl = document.createElement('span');
        iconEl.className = 'pf-toast-icon';
        iconEl.textContent = icons[type] || icons.info;

        const bodyEl = document.createElement('span');
        bodyEl.className = 'pf-toast-message';
        bodyEl.textContent = String(message);

        toast.appendChild(iconEl);
        toast.appendChild(bodyEl);

        if (hasAction) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pf-toast-action';
            btn.textContent = String(actionLabel);
            btn.addEventListener('click', () => {
                try {
                    onAction();
                } catch (err) {
                    // no-op
                }
                toast.classList.remove('pf-toast-visible');
                setTimeout(() => toast.remove(), 220);
            });
            toast.appendChild(btn);
        }

        this._toastContainer.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('pf-toast-visible');
        });

        setTimeout(() => {
            toast.classList.remove('pf-toast-visible');
            setTimeout(() => toast.remove(), 220);
        }, timeout);
    },

    _injectToastStyles() {
        if (document.getElementById('pf-toast-styles')) return;

        const style = document.createElement('style');
        style.id = 'pf-toast-styles';
        style.textContent = `
            #pf-toast-container {
                position: fixed;
                right: 18px;
                bottom: 18px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                z-index: 2147483647;
                pointer-events: none;
                max-width: min(360px, calc(100vw - 24px));
            }

            .pf-toast {
                display: flex;
                align-items: flex-start;
                gap: 8px;
                padding: 10px 12px;
                border-radius: 10px;
                background: rgba(22, 24, 29, 0.96);
                border: 1px solid #3a3d45;
                color: #e8ecf3;
                font: 600 12px/1.35 "Segoe UI Variable Text", "Segoe UI", Tahoma, sans-serif;
                box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
                transform: translateY(8px);
                opacity: 0;
                transition: opacity 0.2s ease, transform 0.2s ease;
            }

            .pf-toast-actionable {
                pointer-events: auto;
            }

            .pf-toast-action {
                margin-left: auto;
                border: 1px solid rgba(121, 235, 255, 0.62);
                background: rgba(0, 212, 255, 0.14);
                color: #79ebff;
                border-radius: 8px;
                padding: 4px 8px;
                font: 700 11px/1.2 "Segoe UI Variable Text", "Segoe UI", Tahoma, sans-serif;
                cursor: pointer;
            }

            .pf-toast-action:hover {
                background: rgba(0, 212, 255, 0.2);
            }

            .pf-toast-visible {
                opacity: 1;
                transform: translateY(0);
            }

            .pf-toast-icon {
                width: 16px;
                height: 16px;
                border-radius: 999px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 11px;
                font-weight: 800;
                flex-shrink: 0;
                margin-top: 1px;
            }

            .pf-toast-info .pf-toast-icon {
                background: rgba(0, 212, 255, 0.2);
                color: #00d4ff;
            }

            .pf-toast-success .pf-toast-icon {
                background: rgba(52, 199, 89, 0.2);
                color: #34c759;
            }

            .pf-toast-warn .pf-toast-icon {
                background: rgba(255, 170, 0, 0.22);
                color: #ffb020;
            }

            .pf-toast-error .pf-toast-icon {
                background: rgba(255, 84, 89, 0.22);
                color: #ff5459;
            }

            @media (prefers-reduced-motion: reduce) {
                .pf-toast {
                    transition: none;
                    transform: none;
                }
            }
        `;

        document.head.appendChild(style);
    }
};

window.PF_Helpers = PF_Helpers;
