/**
 * PureFusion Feed - UI Tweaks
 * 
 * Handles micro-interactions and layout fixes across the Facebook UI.
 * E.g., anti-phishing link expansion, font scaling, disabling autofocus.
 */

class PF_UiTweaks {
    constructor(settings) {
        this.settings = settings;
    }

    applyDocumentLevelTweaks() {
        if (this.settings.uiMode.fontSizeScale !== 100) {
            this._applyFontScale(this.settings.uiMode.fontSizeScale);
        }

        this._applyCompactWidescreen();
        this._applyAnonymizer();

        if (this.settings.uiMode.disableCommentAutofocus) {
            this._disableAutofocus();
        }

        if (this.settings.uiMode.distractionFreeMode) {
            this.toggleReadingMode(true);
        }

        this._setupKeyboardShortcuts();
        this._startResilientWorkers();
    }

    /**
     * Applied against new nodes from the MutationObserver
     */
    applyToNodes(nodes) {
        nodes.forEach(node => {
            if (this.settings.uiMode.fixTimestamps) {
                this._convertTimestamps(node);
            }
            if (this.settings.uiMode.showLinkPreviews) {
                this._addLinkPreviews(node);
            }
        });
    }

    /**
     * Virtual continuous worker to handle React's asynchronous lazy-loading
     * which often bypasses traditional MutationObserver scoping.
     */
    _startResilientWorkers() {
        setInterval(() => {
            if (this.settings.uiMode.commentSortDefault !== 'Most relevant') {
                this._enforceCommentSortResilient();
            }
        }, 1500);
    }

    _applyFontScale(percentage) {
        // Facebook's root relies on rems usually mapped to 1em.
        const headerContainer = document.querySelector(PF_SELECTOR_MAP.headerContainer);
        // We scale the main document font roughly globally via inline css var overrides
        document.documentElement.style.setProperty('--pf-font-scale', `${percentage / 100}`);
        document.body.style.fontSize = `${percentage}%`;
    }

    _applyAnonymizer() {
        const id = 'pf-anonymizer-style';
        let style = document.getElementById(id);
        
        if (this.settings.uiMode.anonymizerMode) {
            if (!style) {
                style = document.createElement('style');
                style.id = id;
                // aggressive blurring for svg profile images and anchor tags for user names (auto direction handling)
                style.textContent = `
                    svg image, img[src*="scontent"], a[href*="/user/"] span[dir="auto"], h3 span[dir="auto"] {
                        filter: blur(8px) !important;
                        pointer-events: none !important;
                        user-select: none !important;
                    }
                `;
                document.head.appendChild(style);
            }
        } else if (style) {
            style.remove();
        }
    }

    _disableAutofocus() {
        // Facebook uses React's autoFocus or script programmatic focus on new feeds
        // We capture the focus event on the capturing phase and kill it if it's hitting a comment box
        document.addEventListener('focus', (e) => {
            if (e.target && e.target.matches && e.target.matches(PF_SELECTOR_MAP.commentInputBox)) {
                // Determine if this was organically clicked or auto-focused via code
                // A quick hack: see if mouse is down or just released on it
                if (!window._pf_mouseIsDown) {
                    e.target.blur();
                    PF_Logger.info("PF_UiTweaks: Intercepted and blocked comment auto-focus");
                }
            }
        }, true);
        
        document.addEventListener('mousedown', () => window._pf_mouseIsDown = true);
        document.addEventListener('mouseup', () => { setTimeout(() => window._pf_mouseIsDown = false, 100); });
    }

    _setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Alt + Shift + F => Reading Mode
            if (e.altKey && e.shiftKey && e.code === 'KeyF') {
                const isReadingMode = document.documentElement.classList.contains('pf-reading-mode');
                this.toggleReadingMode(!isReadingMode);
                PF_Logger.info(`Toggled Distraction-Free Reading Mode: ${!isReadingMode}`);
            }
        });
    }

    toggleReadingMode(forceEnable) {
        if (forceEnable) {
            document.documentElement.classList.add('pf-reading-mode');
        } else {
            document.documentElement.classList.remove('pf-reading-mode');
        }
    }

    _convertTimestamps(rootNode) {
        if (!rootNode.querySelectorAll) return;
        const timeLinks = rootNode.querySelectorAll(PF_SELECTOR_MAP.postTimestamp);
        timeLinks.forEach(timeEl => {
            // Facebook often obscures the actual unix time in a hidden tooltip or data node, 
            // but the element is wrapped in a hovered span.
            // For this implementation, we catch the Hovercard payload or aria-label often containing exact time.
            let timeStr = "";
            
            // Try to find full text from parent wrapper aria-label? (Requires current fb dom mapping)
            const parentHasAria = PF_Helpers.getClosest(timeEl, '[aria-label]');
            if (parentHasAria && parentHasAria.getAttribute('aria-label') && parentHasAria.getAttribute('aria-label').match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i)) {
               timeStr = parentHasAria.getAttribute('aria-label');
            }

            if (timeStr && timeEl.textContent !== timeStr && timeStr.length > 5 && timeStr.length < 35) {
                timeEl.textContent = timeStr; // Overwrite "3 hrs" with "January 14 at 10:02 AM"
                timeEl.dataset.pfTimeFixed = "true";
            }
        });
    }

    _addLinkPreviews(rootNode) {
        if (!rootNode.querySelectorAll) return;
        // Find external links that Facebook attempts to proxy
        const links = rootNode.querySelectorAll('a[href*="l.facebook.com/l.php"]');
        links.forEach(link => {
            if (link.dataset.pfLinkRevealed) return;
            try {
                // Decode the link
                const urlParams = new URLSearchParams(link.href.split('?')[1]);
                const actualUrl = urlParams.get('u');
                if (actualUrl) {
                    const cleanDomain = new URL(actualUrl).hostname;
                    // Inject a tiny span next to the link
                    const domainBadge = document.createElement('span');
                    domainBadge.style.cssText = `
                        background: #ffd700; color: #333; font-size: 10px; font-weight: bold;
                        padding: 2px 4px; border-radius: 3px; margin-left: 5px; opacity: 0.8;
                    `;
                    domainBadge.textContent = '🔗 ' + cleanDomain;
                    link.appendChild(domainBadge);
                    link.title = `Destination: ${actualUrl}`;
                }
            } catch(e) {
                // Malformed URL, ignore
            }
            link.dataset.pfLinkRevealed = "true";
        });
    }

    _enforceCommentSortResilient() {
        const targetSort = this.settings.uiMode.commentSortDefault; // e.g. "All Comments"
        
        // Find ALL sort dropdown triggers currently on the page
        const triggers = document.querySelectorAll(PF_SELECTOR_MAP.commentFilterTrigger + ', div[role="button"]');
        
        triggers.forEach(trigger => {
            const textContent = trigger.textContent.trim().toLowerCase();
            const targetLower = targetSort.toLowerCase();
            
            if ((textContent.includes('most relevant') || textContent.includes('top comments') || textContent.includes('all comments')) 
                && !textContent.includes(targetLower) 
                && !trigger.dataset.pfSortEnforced) {
                
                trigger.dataset.pfSortEnforced = "true"; 
                PF_Logger.info(`PF_UiTweaks: Auto-clicking to change sort to ${targetSort}`);
                
                trigger.style.borderBottom = "2px dashed #00D4FF";

                trigger.click();

                setTimeout(() => {
                    const menuItems = Array.from(document.body.querySelectorAll('span[dir="auto"], span'));
                    
                    let clicked = false;
                    for (const item of menuItems) {
                        if (item.textContent.trim().toLowerCase() === targetSort.toLowerCase()) {
                            const clickable = item.closest('[role="menuitem"]') || item.closest('[role="menuitemradio"]') || item;
                            const menu = item.closest('[role="menu"]');
                            if (menu) {
                                clickable.click();
                                clicked = true;
                                trigger.style.borderBottom = "none";
                                break;
                            }
                        }
                    }

                    if (!clicked) {
                        trigger.style.borderBottom = "2px solid red"; 
                        document.body.click(); 
                    }
                }, 400); 
            }
        });
    }

    // Note: Auto-expand comments logic was completely removed.
    // Facebook DOM is totally hostile to click automation.
}

window.PF_UiTweaks = PF_UiTweaks;
