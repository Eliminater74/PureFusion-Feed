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

    updateSettings(settings) {
        this.settings = settings;
        this.update();
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
        if (this.settings?.uiMode?.fixTimestamps) {
            this._syncAbsoluteTimestamps(nodes);
        }
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

        css += `
            .pf-post-date-chip {
                display: inline-flex;
                align-items: center;
                margin: 4px 0 2px;
                padding: 2px 8px;
                border-radius: 999px;
                border: 1px solid rgba(132, 154, 186, 0.36);
                background: rgba(27, 39, 57, 0.22);
                color: var(--secondary-text, #b0b3b8) !important;
                font: 600 11px/1.2 "Segoe UI Variable Text", "Segoe UI", sans-serif;
                white-space: nowrap;
                opacity: 0.94;
            }
        `;

        this.styleTag.textContent = css;

        if (this.settings?.uiMode?.fixTimestamps) {
            this._syncAbsoluteTimestamps();
        } else {
            this._clearAbsoluteTimestampLabels();
        }
    }

    _syncAbsoluteTimestamps(nodes = null) {
        const roots = this._resolveTimestampRoots(nodes);

        roots.forEach((root) => {
            if (!root || !root.querySelectorAll) return;

            root.querySelectorAll('.pf-abs-date-label').forEach((legacy) => legacy.remove());
            root.querySelectorAll('a.pf-abs-date-anchor').forEach((legacyAnchor) => {
                this._clearAnchorAbsoluteLabel(legacyAnchor);
            });

            const anchors = root.querySelectorAll('a[role="link"][aria-label], a[href][aria-label]');
            anchors.forEach((anchor) => {
                if (!anchor || !anchor.isConnected) return;
                if (anchor.closest('.pf-insight-chip, #pf-feed-report-panel, #pf-session-timer')) return;

                const host = this._resolveTimestampHost(anchor);
                if (!host) {
                    this._clearAnchorAbsoluteLabel(anchor);
                    return;
                }

                if (!this._isLikelyTimestampAnchor(anchor, host)) {
                    this._clearAnchorAbsoluteLabel(anchor);
                    return;
                }

                const absoluteText = this._extractAbsoluteTimestampText(anchor);
                if (!absoluteText) {
                    this._clearAnchorAbsoluteLabel(anchor);
                    return;
                }

                const currentText = String(anchor.getAttribute('data-pf-abs-date') || '');
                if (currentText === absoluteText && anchor.classList.contains('pf-abs-date-anchor')) {
                    this._upsertPostDateChip(host, absoluteText);
                    return;
                }

                anchor.classList.add('pf-abs-date-anchor');
                anchor.setAttribute('data-pf-abs-date', absoluteText);
                this._upsertPostDateChip(host, absoluteText);
            });
        });
    }

    _resolveTimestampHost(anchor) {
        if (!anchor || !anchor.closest) return null;

        const postHost = anchor.closest('[data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"], [role="article"]');
        if (postHost) return postHost;

        const dialog = anchor.closest('[role="dialog"]');
        if (!dialog) return null;

        const dialogArticle = dialog.querySelector('[role="article"], [data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"]');
        return dialogArticle || dialog;
    }

    _upsertPostDateChip(host, absoluteText) {
        if (!host || !host.querySelector) return null;

        let chip = host.querySelector('.pf-post-date-chip');
        if (!chip) {
            chip = document.createElement('div');
            chip.className = 'pf-post-date-chip';

            const heading = host.querySelector('h2, h3, h4, [role="heading"]');
            const headingContainer = heading && heading.closest ? heading.closest('div') : null;

            if (headingContainer && headingContainer.parentElement && headingContainer.parentElement !== host) {
                headingContainer.insertAdjacentElement('afterend', chip);
            } else {
                host.insertAdjacentElement('afterbegin', chip);
            }
        }

        const text = `Posted: ${absoluteText}`;
        if (chip.textContent !== text) chip.textContent = text;
        return chip;
    }

    _resolveTimestampRoots(nodes) {
        if (!Array.isArray(nodes) || !nodes.length) {
            return [document];
        }

        const roots = [];
        const seen = new Set();

        nodes.forEach((node) => {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
            if (seen.has(node)) return;
            seen.add(node);
            roots.push(node);
        });

        return roots.length ? roots : [document];
    }

    _isLikelyTimestampAnchor(anchor, host) {
        const text = String(anchor.textContent || '').trim().toLowerCase();
        const aria = String(anchor.getAttribute('aria-label') || '').trim().toLowerCase();
        const href = String(anchor.getAttribute('href') || '').toLowerCase();

        if (!aria || aria.length < 6 || aria.length > 140) return false;

        // Avoid mutating broad author/page links or action links.
        const textWordCount = text ? text.split(/\s+/).length : 0;
        if (textWordCount > 4 || text.length > 28) return false;

        const likelyPostLink = [
            '/posts/', '/permalink/', '/videos/', '/photo', '/photos/', '/reel/', '/story.php', 'story_fbid=', 'fbid='
        ].some((token) => href.includes(token));

        const relativeText = /^(\d+[smhdwy]|\d+\s*(sec|min|h|d|w|mo|y|yr)s?|now|just now|ayer|hoy|today|yesterday)$/i.test(text);
        const dateLikeText = /\d{1,2}[:.]\d{2}|\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|ene|abr|ago|dic)|\d{4}/i.test(text);
        const hasDateHints = /\d{4}|\d{1,2}:\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|ene|feb|mar|abr|may|jun|jul|ago|sept|oct|nov|dic|am|pm/i.test(aria);

        if (!relativeText && !dateLikeText) return false;
        if (!likelyPostLink && !hasDateHints) return false;

        if (anchor.getBoundingClientRect && host.getBoundingClientRect) {
            const aRect = anchor.getBoundingClientRect();
            const hRect = host.getBoundingClientRect();
            const topDelta = aRect.top - hRect.top;

            if (topDelta < -12 || topDelta > 280) return false;
            if (aRect.width > 220 || aRect.height > 32) return false;
        }

        return true;
    }

    _extractAbsoluteTimestampText(anchor) {
        const candidates = [
            anchor.getAttribute('aria-label'),
            anchor.getAttribute('title'),
            anchor.querySelector && anchor.querySelector('[aria-label]') ? anchor.querySelector('[aria-label]').getAttribute('aria-label') : '',
            anchor.querySelector && anchor.querySelector('[title]') ? anchor.querySelector('[title]').getAttribute('title') : ''
        ];

        for (const rawCandidate of candidates) {
            const cleaned = String(rawCandidate || '').replace(/\s+/g, ' ').trim();
            if (!cleaned || cleaned.length < 6 || cleaned.length > 140) continue;
            if (!/\d/.test(cleaned)) continue;
            return cleaned;
        }

        return '';
    }

    _clearAbsoluteTimestampLabels() {
        document.querySelectorAll('.pf-abs-date-label').forEach((el) => el.remove());
        document.querySelectorAll('.pf-post-date-chip').forEach((el) => el.remove());
        document.querySelectorAll('a.pf-abs-date-anchor').forEach((anchor) => {
            this._clearAnchorAbsoluteLabel(anchor);
        });
    }

    _clearAnchorAbsoluteLabel(anchor) {
        if (!anchor || !anchor.classList) return;
        if (anchor.classList.contains('pf-abs-date-anchor')) {
            anchor.classList.remove('pf-abs-date-anchor');
        }
        if (anchor.hasAttribute && anchor.hasAttribute('data-pf-abs-date')) {
            anchor.removeAttribute('data-pf-abs-date');
        }
    }

    _buildCustomStylingCss() {
        const ui = this.settings?.uiMode;
        if (!ui || !ui.customStylingEnabled) return '';

        let css = '';

        const fontFamily = this._sanitizeFontFamilyValue(ui.customFontFamily);
        if (fontFamily) {
            css += `body, [role="main"], [role="feed"] { font-family: ${fontFamily} !important; }\n`;
        }

        const accent = this._normalizeColor(ui.customAccentColor);
        if (accent) {
            css += `:root { --pf-custom-accent: ${accent}; }\n`;
            css += `a, [role="link"] { color: var(--pf-custom-accent) !important; }\n`;
            css += `[role="button"]:focus-visible, button:focus-visible { outline-color: var(--pf-custom-accent) !important; }\n`;
        }

        const textColor = this._normalizeColor(ui.customTextColor);
        if (textColor) {
            css += `:root { --pf-custom-text-color: ${textColor}; }\n`;
            css += `body, [role="main"], [role="feed"], [role="article"] { color: var(--pf-custom-text-color) !important; }\n`;
        }

        const cardBackground = this._normalizeColor(ui.customCardBackground);
        if (cardBackground) {
            css += `:root { --pf-custom-card-bg: ${cardBackground}; }\n`;
            css += `[role="feed"] [role="article"], [data-pagelet^="FeedUnit_"] [role="article"] { background-color: var(--pf-custom-card-bg) !important; }\n`;
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
        css = css.replace(/@charset/gi, '');
        css = css.replace(/@namespace/gi, '');
        css = css.replace(/javascript:/gi, '');
        css = css.replace(/vbscript:/gi, '');
        css = css.replace(/expression\s*\(/gi, '');
        css = css.replace(/-moz-binding\s*:/gi, '');
        css = css.replace(/\bbehavior\s*:/gi, '');
        css = css.replace(/url\s*\([^)]*\)/gi, '');

        css = this._removeCriticalHideRules(css);

        if (css.length > 12000) {
            css = css.slice(0, 12000);
        }

        return css.trim();
    }

    _removeCriticalHideRules(css) {
        if (!css) return '';

        const hideDeclaration = /(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$)|max-height\s*:\s*0(?:\D|$)|height\s*:\s*0(?:\D|$))/i;

        return css.replace(/([^{}]+)\{([^{}]*)\}/g, (fullRule, selector, declarations) => {
            const normalizedSelector = String(selector || '').replace(/["']/g, '').toLowerCase();
            const hasCriticalRole = normalizedSelector.includes('[role=main]')
                || normalizedSelector.includes('[role=feed]')
                || normalizedSelector.includes('[role=banner]')
                || normalizedSelector.includes('[role=navigation]')
                || normalizedSelector.includes('[role=complementary]');

            const hasRootCritical = /(^|[\s,>+~])html([#.\[:\s>+~]|$)|(^|[\s,>+~])body([#.\[:\s>+~]|$)/i.test(selector);
            if (!hasCriticalRole && !hasRootCritical) return fullRule;

            if (!hideDeclaration.test(declarations)) return fullRule;
            return '';
        });
    }

    _sanitizeBackgroundValue(value) {
        const background = String(value || '').trim();
        if (!background || background.length > 180) return '';

        if (/javascript:|vbscript:|expression\s*\(|url\s*\(|@import|;|\{|\}/i.test(background)) return '';

        const allowedPatterns = [
            /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
            /^rgba?\([\d\s.,%]+\)$/i,
            /^hsla?\([\d\s.,%]+\)$/i,
            /^(linear|radial|conic)-gradient\(.+\)$/i,
            /^var\(--[a-z0-9_-]+\)$/i,
            /^(transparent|currentcolor|inherit|initial|unset)$/i,
            /^[a-z]{3,24}$/i
        ];

        if (!allowedPatterns.some((rx) => rx.test(background))) return '';

        return background;
    }

    _sanitizeFontFamilyValue(value) {
        const fontFamily = String(value || '').trim();
        if (!fontFamily || fontFamily.length > 140) return '';

        if (/url\s*\(|javascript:|@import|;|\{|\}/i.test(fontFamily)) return '';
        if (!/^[a-z0-9\s,'"._()-]+$/i.test(fontFamily)) return '';

        return fontFamily;
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
