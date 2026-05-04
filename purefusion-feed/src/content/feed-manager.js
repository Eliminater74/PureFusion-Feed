/**
 * PureFusion Feed - Feed Manager
 * 
 * Takes over the macro layout and sorting mechanics of the user's Feed.
 * Forces Most Recent, applies layout modes like Compact Mode, and manages overall themes.
 */

class PF_FeedManager {
    constructor(settings) {
        this.settings = settings;
    }

    applyDocumentLevelTweaks() {
        if (this.settings.uiMode.forceMostRecent || this.settings.uiMode.enforceChronologicalFeed) {
            this._enforceChronologicalSort();
        }

        if (this.settings.uiMode.compactMode) {
            document.documentElement.classList.add('pf-compact-mode');
        } else {
            document.documentElement.classList.remove('pf-compact-mode');
        }

        if (this.settings.uiMode.widescreenMode) {
            document.documentElement.classList.add('pf-widescreen-mode');
        } else {
            document.documentElement.classList.remove('pf-widescreen-mode');
        }

        this._applyTheme(this.settings.uiMode.theme);
    }

    _enforceChronologicalSort() {
        // If we are on the base URL and not already sorting by recent
        // NOTE: Redirecting to ?sk=h_chr removes Stories and 'What's on your mind', so we disable this aggressive redirect per user request.
        /*
        if (currentURL === 'https://www.facebook.com/' || currentURL === 'https://www.facebook.com/?sk=h_chr') {
            if (!currentURL.includes('sk=h_chr') && !currentURL.includes('feed=recent')) {
                PF_Logger.warn("PF_FeedManager: Forcing chronological feed. Redirecting cleanly.");
                setTimeout(() => {
                    window.location.replace('https://www.facebook.com/?sk=h_chr');
                }, 500); 
            }
        }
        */
    }

    _applyTheme(themeName) {
        // Facebook's vanilla DOM uses CSS custom properties mapping.
        // We inject a standard style block to override core colors.

        const themeId = 'pf-theme-vars';
        let styleNode = document.getElementById(themeId);
        if (!styleNode) {
            styleNode = document.createElement('style');
            styleNode.id = themeId;
            document.head.appendChild(styleNode);
        }

        let cssVars = '';

        /*
           Color Palette Targets based on FB's standard variable names (Often --surface-background, --primary-text, etc.)
           If FB obfuscates these, we use a wide-brush approach on standard tags.
        */

        switch(themeName) {
            case 'darkPro':
                cssVars = `
                    :root, .__fb-dark-mode {
                        --surface-background: #18191A !important;
                        --primary-button-background: #6C3FC5 !important;
                        --primary-text: #E4E6EB !important;
                        --secondary-text: #B0B3B8 !important;
                        --highlight-bg: #242526 !important;
                    }
                `;
                break;

            case 'amoled':
                // Accent: #BB86FC (Material You purple — consistent with selector-map.js stylePresets.amoled)
                cssVars = `
                    :root, .__fb-dark-mode {
                        --surface-background: #000000 !important;
                        --primary-button-background: #BB86FC !important;
                        --primary-text: #FFFFFF !important;
                        --secondary-text: #CCCCCC !important;
                        --highlight-bg: #0A0A0A !important;
                    }
                    html, body { background-color: #000000 !important; }
                    /* Post cards — true black with subtle separator */
                    ${PF_SELECTOR_MAP.postContainer} {
                        background-color: #000000 !important;
                        border: 1px solid #1e1e1e !important;
                    }
                    /* Reaction bar and comment input wells */
                    [role="article"] [role="toolbar"],
                    [role="article"] [data-ad-preview="message"],
                    [role="article"] [data-ad-comet-preview="message"] {
                        background-color: #000000 !important;
                    }
                    /* Dividers between sections */
                    [role="article"] hr, [role="article"] [role="separator"] {
                        border-color: #1a1a1a !important;
                    }
                    /* Right rail and sidebars */
                    [role="complementary"] { background-color: #000000 !important; }
                    /* Chip surface overrides for AMOLED — deepen from default dark */
                    .pf-insight-chip {
                        background: rgba(8, 8, 8, 0.98) !important;
                        border-color: rgba(187, 134, 252, 0.4) !important;
                        color: #e8d8ff !important;
                    }
                    .pf-insight-chip.pf-insight-ok  { border-color: rgba(187, 134, 252, 0.55) !important; background: rgba(20, 6, 38, 0.98) !important; }
                    .pf-insight-chip.pf-insight-warn { border-color: rgba(255, 209, 102, 0.55) !important; background: rgba(28, 18, 0, 0.98) !important; }
                    .pf-insight-chip.pf-insight-high { border-color: rgba(255, 120, 140, 0.6) !important; background: rgba(30, 0, 8, 0.98) !important; }
                    .pf-insight-status  { background: rgba(187, 134, 252, 0.12) !important; border-color: rgba(187, 134, 252, 0.4) !important; }
                    .pf-insight-toggle  { background: rgba(20, 10, 36, 0.98) !important; color: #e8d8ff !important; border-color: rgba(187, 134, 252, 0.45) !important; }
                    .pf-insight-summary { color: #e8d8ff !important; }
                    .pf-insight-meta, .pf-insight-details, .pf-insight-details p, .pf-insight-section-title { color: #ccbbee !important; }
                    .pf-post-date-chip  { background: rgba(12, 5, 22, 0.92) !important; border-color: rgba(187, 134, 252, 0.3) !important; color: #c9a8ff !important; }
                `;
                break;

            case 'classicBlue':
                // Classic pre-2020 Facebook blue top bar — light surface
                cssVars = `
                    :root {
                        --header-background: #3b5998 !important;
                        --primary-button-background: #3b5998 !important;
                    }
                    ${PF_SELECTOR_MAP.headerContainer} { background-color: #3b5998 !important; }
                    ${PF_SELECTOR_MAP.headerContainer} svg { fill: #FFFFFF !important; }
                    ${PF_SELECTOR_MAP.leftSidebar} { background-color: #e9eaed !important; }
                    /* Chip overrides for light classicBlue surface */
                    .pf-insight-chip {
                        background: rgba(233, 238, 249, 0.97) !important;
                        border-color: rgba(59, 89, 152, 0.42) !important;
                        color: #1d2d5e !important;
                    }
                    .pf-insight-chip.pf-insight-ok   { background: rgba(218, 232, 255, 0.96) !important; }
                    .pf-insight-chip.pf-insight-warn  { background: rgba(255, 248, 215, 0.96) !important; border-color: rgba(160, 110, 0, 0.4) !important; }
                    .pf-insight-chip.pf-insight-high  { background: rgba(255, 224, 224, 0.96) !important; border-color: rgba(160, 40, 40, 0.4) !important; }
                    .pf-insight-status  { background: rgba(59, 89, 152, 0.12) !important; border-color: rgba(59, 89, 152, 0.36) !important; color: #1d2d5e !important; }
                    .pf-insight-toggle  { background: rgba(255, 255, 255, 0.9) !important; color: #1d2d5e !important; border-color: rgba(59, 89, 152, 0.4) !important; }
                    .pf-insight-summary { color: #1d2d5e !important; }
                    .pf-insight-meta, .pf-insight-details, .pf-insight-details p, .pf-insight-section-title { color: #3a4f7a !important; }
                    .pf-insight-details { border-top-color: rgba(59, 89, 152, 0.25) !important; }
                    .pf-post-date-chip  { background: rgba(225, 232, 248, 0.88) !important; border-color: rgba(59, 89, 152, 0.3) !important; color: #2a3f74 !important; }
                `;
                break;

            case 'zen':
                // Zen is applied via selector-map.js stylePresets. The theme switch
                // here only needs to override the chip surface so it reads on white cards.
                cssVars = `
                    /* Chip overrides for Zen light surface */
                    .pf-insight-chip {
                        background: rgba(255, 255, 255, 0.97) !important;
                        border-color: rgba(192, 204, 216, 0.7) !important;
                        color: #24292f !important;
                    }
                    .pf-insight-chip.pf-insight-ok   { background: rgba(240, 249, 255, 0.97) !important; border-color: rgba(50, 160, 200, 0.45) !important; }
                    .pf-insight-chip.pf-insight-warn  { background: rgba(255, 252, 235, 0.97) !important; border-color: rgba(150, 110, 0, 0.38) !important; }
                    .pf-insight-chip.pf-insight-high  { background: rgba(255, 238, 238, 0.97) !important; border-color: rgba(148, 40, 40, 0.38) !important; }
                    .pf-insight-status  { background: rgba(200, 215, 230, 0.5) !important; border-color: rgba(120, 150, 180, 0.5) !important; color: #24292f !important; }
                    .pf-insight-toggle  { background: rgba(245, 248, 252, 0.95) !important; color: #24292f !important; border-color: rgba(120, 150, 180, 0.5) !important; }
                    .pf-insight-summary { color: #24292f !important; }
                    .pf-insight-meta, .pf-insight-details, .pf-insight-details p, .pf-insight-section-title { color: #444c56 !important; }
                    .pf-insight-details { border-top-color: rgba(120, 150, 180, 0.22) !important; }
                    .pf-post-date-chip  { background: rgba(240, 244, 248, 0.9) !important; border-color: rgba(160, 180, 200, 0.45) !important; color: #444c56 !important; }
                `;
                break;

            case 'pastel':
                // Soft warm palette — low visual fatigue, ideal for long sessions
                cssVars = `
                    :root {
                        --surface-background: #f5f0ea !important;
                        --primary-button-background: #b58b8b !important;
                        --primary-text: #3d3530 !important;
                        --secondary-text: #786c66 !important;
                        --highlight-bg: #ede8e2 !important;
                    }
                    html, body { background-color: #f5f0ea !important; }
                    ${PF_SELECTOR_MAP.postContainer} {
                        background-color: #fffef8 !important;
                        border: 1px solid rgba(180, 158, 148, 0.28) !important;
                        box-shadow: 0 1px 4px rgba(100, 80, 72, 0.07) !important;
                    }
                    ${PF_SELECTOR_MAP.headerContainer} {
                        background-color: #ede8e2 !important;
                        border-bottom: 1px solid rgba(180, 158, 148, 0.3) !important;
                    }
                    ${PF_SELECTOR_MAP.rightSidebar} { background-color: #f5f0ea !important; }
                    /* Chip overrides for Pastel warm-light surface */
                    .pf-insight-chip {
                        background: rgba(255, 252, 244, 0.97) !important;
                        border-color: rgba(180, 140, 130, 0.42) !important;
                        color: #3d3530 !important;
                    }
                    .pf-insight-chip.pf-insight-ok   { background: rgba(240, 250, 244, 0.97) !important; border-color: rgba(100, 160, 120, 0.42) !important; }
                    .pf-insight-chip.pf-insight-warn  { background: rgba(255, 252, 232, 0.97) !important; border-color: rgba(160, 120, 40, 0.38) !important; }
                    .pf-insight-chip.pf-insight-high  { background: rgba(255, 238, 236, 0.97) !important; border-color: rgba(180, 80, 80, 0.38) !important; }
                    .pf-insight-status  { background: rgba(180, 140, 130, 0.14) !important; border-color: rgba(180, 140, 130, 0.42) !important; color: #3d3530 !important; }
                    .pf-insight-toggle  { background: rgba(255, 252, 244, 0.95) !important; color: #3d3530 !important; border-color: rgba(180, 140, 130, 0.44) !important; }
                    .pf-insight-summary { color: #3d3530 !important; }
                    .pf-insight-meta, .pf-insight-details, .pf-insight-details p, .pf-insight-section-title { color: #5c4e48 !important; }
                    .pf-insight-details { border-top-color: rgba(180, 140, 130, 0.22) !important; }
                    .pf-post-date-chip  { background: rgba(240, 234, 226, 0.9) !important; border-color: rgba(180, 140, 130, 0.38) !important; color: #5c4e48 !important; }
                `;
                break;

            case 'default':
            default:
                cssVars = ''; // Clear overrides
                break;
        }

        styleNode.textContent = cssVars;
        if (cssVars) {
            PF_Logger.info(`PF_FeedManager: Injected Theme -> ${themeName}`);
        }
    }
}

window.PF_FeedManager = PF_FeedManager;
