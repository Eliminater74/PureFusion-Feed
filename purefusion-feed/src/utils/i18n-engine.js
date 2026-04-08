/**
 * PureFusion Feed - i18n Engine
 * 
 * Scans the DOM for [data-i18n] attributes and translates them using chrome.i18n.
 * Supports:
 *  - innerText (default)
 *  - title (data-i18n-title)
 *  - placeholder (data-i18n-placeholder)
 *  - alt text (data-i18n-alt)
 *  - aria-label (data-i18n-aria-label)
 */

const PF_I18n = {
    /**
     * Initializes translation for the current document
     */
    init() {
        if (typeof chrome === 'undefined' || !chrome.i18n) return;
        
        this.translateDOM();
    },

    /**
     * Scans the document for i18n targets
     */
    translateDOM(root = document) {
        // 1. Text Content
        root.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const msg = chrome.i18n.getMessage(key);
            if (msg) el.textContent = msg;
        });

        // 2. Titles (Tooltips)
        root.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            const msg = chrome.i18n.getMessage(key);
            if (msg) el.title = msg;
        });

        // 3. Placeholders (Inputs)
        root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            const msg = chrome.i18n.getMessage(key);
            if (msg) el.placeholder = msg;
        });

        // 4. Alt attributes (Images)
        root.querySelectorAll('[data-i18n-alt]').forEach(el => {
            const key = el.getAttribute('data-i18n-alt');
            const msg = chrome.i18n.getMessage(key);
            if (msg) el.alt = msg;
        });

        // 5. ARIA labels
        root.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
            const key = el.getAttribute('data-i18n-aria-label');
            const msg = chrome.i18n.getMessage(key);
            if (msg) el.setAttribute('aria-label', msg);
        });
    }
};

// Auto-run on DOM content loaded if we are in an HTML context
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => PF_I18n.init());
}

window.PF_I18n = PF_I18n;
