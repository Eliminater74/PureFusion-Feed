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
        return Array.from(elements).filter(element => {
            return element.textContent && element.textContent.includes(text);
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
        node.style.setProperty('display', 'none', 'important');
        node.dataset.pfHidden = 'true';
        node.dataset.pfReason = reason;
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
        if (!message || typeof document === 'undefined') return;

        if (!this._toastContainer || !document.contains(this._toastContainer)) {
            this._injectToastStyles();
            this._toastContainer = document.createElement('div');
            this._toastContainer.id = 'pf-toast-container';
            document.body.appendChild(this._toastContainer);
        }

        const toast = document.createElement('div');
        toast.className = `pf-toast pf-toast-${type}`;

        const icons = {
            success: '✓',
            error: '!',
            warn: '!',
            info: 'i'
        };

        toast.innerHTML = `
            <span class="pf-toast-icon">${icons[type] || icons.info}</span>
            <span class="pf-toast-message">${message}</span>
        `;

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
        `;

        document.head.appendChild(style);
    }
};

window.PF_Helpers = PF_Helpers;
