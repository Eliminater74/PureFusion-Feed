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
        if (this.settings.uiMode.forceMostRecent) {
            this._enforceChronologicalSort();
        }

        if (this.settings.uiMode.compactMode) {
            document.documentElement.classList.add('pf-compact-mode');
        } else {
            document.documentElement.classList.remove('pf-compact-mode');
        }

        this._applyTheme(this.settings.uiMode.theme);
    }

    _enforceChronologicalSort() {
        const currentURL = window.location.href;
        
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
                cssVars = `
                    :root, .__fb-dark-mode {
                        --surface-background: #000000 !important;
                        --primary-button-background: #00D4FF !important;
                        --primary-text: #FFFFFF !important;
                        --secondary-text: #AAAAAA !important;
                        --highlight-bg: #111111 !important;
                    }
                    body { background-color: #000000 !important; }
                    ${PF_SELECTOR_MAP.postContainer} { border: 1px solid #333 !important; }
                `;
                break;
            case 'classicBlue':
                // Classic pre-2020 Facebook blue top bar
                cssVars = `
                    :root {
                        --header-background: #3b5998 !important;
                        --primary-button-background: #3b5998 !important;
                    }
                    ${PF_SELECTOR_MAP.headerContainer} { background-color: #3b5998 !important; }
                    ${PF_SELECTOR_MAP.headerContainer} svg { fill: #FFFFFF !important; }
                    ${PF_SELECTOR_MAP.leftSidebar} { background-color: #e9eaed !important; }
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
