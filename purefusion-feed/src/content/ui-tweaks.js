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

        if (this.settings.uiMode.disableCommentAutofocus) {
            this._disableAutofocus();
        }

        if (this.settings.uiMode.distractionFreeMode) {
            this.toggleReadingMode(true);
        }

        this._setupKeyboardShortcuts();
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
            if (this.settings.uiMode.commentSortDefault !== 'Most relevant') {
                // Facebook's default is usually "Most relevant". If user wants something else,
                // we trigger the change when a comment payload drops in.
                this._enforceCommentSort(node);
            }
        });
    }

    _applyFontScale(percentage) {
        // Facebook's root relies on rems usually mapped to 1em.
        const headerContainer = document.querySelector(PF_SELECTOR_MAP.headerContainer);
        // We scale the main document font roughly globally via inline css var overrides
        document.documentElement.style.setProperty('--pf-font-scale', `${percentage / 100}`);
        document.body.style.fontSize = `${percentage}%`;
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

    _enforceCommentSort(rootNode) {
        if (!rootNode.querySelectorAll) return;
        const targetSort = this.settings.uiMode.commentSortDefault; // e.g. "All Comments"
        
        // Find the sort dropdown trigger button
        const triggers = rootNode.querySelectorAll(PF_SELECTOR_MAP.commentFilterTrigger + ', div[role="button"]');
        triggers.forEach(trigger => {
            // Check if this button actually controls comment sorting
            const textContent = trigger.textContent.trim();
            if ((textContent.includes('Most relevant') || textContent.includes('Top comments') || textContent.includes('All comments')) 
                && trigger.textContent !== targetSort 
                && !trigger.dataset.pfSortEnforced) {
                
                trigger.dataset.pfSortEnforced = "true"; 
                PF_Logger.info(`PF_UiTweaks: Auto-clicking to change sort from ${textContent} to ${targetSort}`);
                
                // Emphasize visually that PF is taking control
                trigger.style.borderBottom = "2px dashed #00D4FF";

                // 1. Click to open the React Portal menu
                trigger.click();

                // 2. Wait for the Portal to mount at document level
                setTimeout(() => {
                    const menuItems = Array.from(document.querySelectorAll('div[role="menuitem"], div[role="menuitemradio"]'));
                    
                    let clicked = false;
                    for (const item of menuItems) {
                        if (item.textContent.trim().toLowerCase() === targetSort.toLowerCase()) {
                            item.click();
                            clicked = true;
                            // Clean up visual indicator on success
                            trigger.style.borderBottom = "none";
                            break;
                        }
                    }

                    // 3. If we failed to find it for some reason, click away to close the dropdown
                    if (!clicked) {
                        trigger.style.borderBottom = "2px solid red"; // Warning flag
                        document.body.click(); 
                    }
                }, 200);
            }
        });
    }
}

window.PF_UiTweaks = PF_UiTweaks;
