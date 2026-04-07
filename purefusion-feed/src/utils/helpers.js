/**
 * PureFusion Feed - General Helpers
 * 
 * Reusable utility functions for DOM manipulation, string matching, etc.
 */

const PF_Helpers = {
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
    }
};

window.PF_Helpers = PF_Helpers;
