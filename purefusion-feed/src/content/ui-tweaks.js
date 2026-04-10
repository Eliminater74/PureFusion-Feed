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
            // Hide only the tiny "Seen" profile pictures and the "Seen" status text
            // Verified safe by specific parent aria-label check
            css += `
                div[aria-label^="Seen by"] img,
                div[aria-label^="Visto por"] img { 
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

        css += this._buildCustomStylingCss();

        this.styleTag.textContent = css;
    }

    _buildCustomStylingCss() {
        const ui = this.settings?.uiMode;
        if (!ui || !ui.customStylingEnabled) return '';

        let css = '';

        const fontFamily = String(ui.customFontFamily || '').trim();
        if (fontFamily && fontFamily.length <= 140) {
            css += `body, [role="main"], [role="feed"] { font-family: ${fontFamily} !important; }\n`;
        }

        const accent = this._normalizeColor(ui.customAccentColor);
        if (accent) {
            css += `a, [role="link"] { color: ${accent} !important; }\n`;
            css += `[role="button"]:focus-visible, button:focus-visible { outline-color: ${accent} !important; }\n`;
        }

        const background = this._sanitizeBackgroundValue(ui.customBackground);
        if (background) {
            css += `body { background: ${background} !important; }\n`;
        }

        const customCss = this._sanitizeCustomCss(ui.customCss);
        if (customCss) {
            css += `\n/* PureFusion custom CSS */\n${customCss}\n`;
        }

        return css;
    }

    _sanitizeCustomCss(value) {
        let css = String(value || '');
        if (!css) return '';

        css = css.replace(/<\/?style[^>]*>/gi, '');
        css = css.replace(/@import/gi, '');
        css = css.replace(/javascript:/gi, '');
        css = css.replace(/expression\s*\(/gi, '');

        if (css.length > 12000) {
            css = css.slice(0, 12000);
        }

        return css.trim();
    }

    _sanitizeBackgroundValue(value) {
        const background = String(value || '').trim();
        if (!background || background.length > 180) return '';

        if (/javascript:|expression\s*\(/i.test(background)) return '';

        return background;
    }

    _normalizeColor(value) {
        const color = String(value || '').trim();
        if (!color || color.length > 40) return '';

        const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
        const rgb = /^rgba?\([\d\s.,%]+\)$/i;
        const hsl = /^hsla?\([\d\s.,%]+\)$/i;

        if (hex.test(color) || rgb.test(color) || hsl.test(color)) return color;

        return '';
    }
}

// Global export for content-script injection
window.PF_UiTweaks = PF_UiTweaks;
