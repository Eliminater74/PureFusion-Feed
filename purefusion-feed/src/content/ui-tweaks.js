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
        this.init();
    }

    init() {
        this.styleTag = document.createElement('style');
        this.styleTag.id = 'purefusion-ui-tweaks';
        document.head.appendChild(this.styleTag);
        this.update();
    }

    applyDocumentLevelTweaks() {
        this.update();
    }

    applyToNodes(nodes) {
        // Most UI tweaks are global CSS based, so we just ensure update() is current
        // if settings were to change dynamically.
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
            // Hide the text "Seen" and the tiny profile picture seen icons
            // Note: :contains() is not standard CSS, but we use a polyfill or broader selector
            css += `
                div[role="none"] img.x14yjl9h.xudhj9z,
                span.x1rg5ohu { 
                    opacity: 0 !important; 
                    pointer-events: none !important;
                } \n`;
        }

        if (this.settings.social.hideMessengerTyping) {
            // Hide the three dots animation bubble
            css += `span.x6s0dn4.x78zum5.x135b78x, div.x17zd0t2.x78zum5.x1q0g3np { display: none !important; } \n`;
        }

        // 3. Privacy Blur (Chat List)
        if (this.settings.social.messengerPrivacyBlur) {
            css += `
                [aria-label="Chats"] [role="gridcell"] span, 
                [aria-label="Chats"] [role="gridcell"] h3 { 
                    filter: blur(5px) !important; 
                    transition: filter 0.2s ease;
                }
                [aria-label="Chats"] [role="gridcell"]:hover span, 
                [aria-label="Chats"] [role="gridcell"]:hover h3 { 
                    filter: blur(0) !important; 
                } \n`;
        }

        this.styleTag.textContent = css;
    }
}

// Global export for content-script injection
window.PF_UiTweaks = PF_UiTweaks;
