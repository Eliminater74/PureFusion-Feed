/**
 * PureFusion Feed - Cleaner Engine
 * 
 * Handles the logic required to identify Spam, Ads, and clutter and remove them.
 * Relies on PF_SELECTOR_MAP and settings defined by user.
 */

class PF_Cleaner {
    constructor(settings) {
        this.settings = settings;
    }

    /**
     * Run a full sweep on the entire document body (usually done on navigation end).
     */
    sweepDocument() {
        PF_Logger.log("Running initial document sweep...");
        this._applyAllFilters(document.body);
    }

    /**
     * Sweep specific nodes recently added by the observer.
     * @param {Array<HTMLElement>} nodes 
     */
    sweepNodes(nodes) {
        for (const node of nodes) {
            this._applyAllFilters(node);
        }
    }

    _applyAllFilters(rootNode) {
        if (!rootNode || !rootNode.querySelectorAll) return;

        if (this.settings.filters.removeAds) this.removeSponsored(rootNode);
        if (this.settings.filters.removeSuggested) this.removeSuggestedPosts(rootNode); // Shared logic for suggested, pymk, groups
        
        if (this.settings.filters.removeColoredBackgrounds) this.removeColoredBackgrounds(rootNode);
        
        if (this.settings.sidebar.hideRightTrending) this.hideTarget(rootNode, PF_SELECTOR_MAP.rightSidebarSponsored, "Right Sidebar Ad");
        
        // Hide features like Reels, Marketplace, Stories if toggled
        if (this.settings.filters.hideReels) this.hideTarget(rootNode, PF_SELECTOR_MAP.reelsTray, "Reels Tray");
        if (this.settings.filters.hideStories) this.hideTarget(rootNode, PF_SELECTOR_MAP.storiesTray, "Stories Tray");
        if (this.settings.filters.hideMarketplace) {
            // General marketplace injections in the feed often share the 'suggested' wrappers or a specific aria-label
            // For safety we catch strings here
            const marketplaceNodes = PF_Helpers.findContains(rootNode, '[role="article"]', 'Marketplace');
            marketplaceNodes.forEach(node => PF_Helpers.hideElement(PF_Helpers.getClosest(node, PF_SELECTOR_MAP.postContainer), "Marketplace Unit"));
        }

        // Apply keyword sweeping
        this.applyKeywordFilters(rootNode);
    }

    /**
     * Hunt for sponsored elements, tracking up to their feed post parent to eradicate.
     * @param {HTMLElement} rootNode 
     */
    removeSponsored(rootNode) {
        let targets = [];
        
        // Facebook uses complex SVG shapes that eventually read "Sponsored" via an aria-label.
        for (const selector of PF_SELECTOR_MAP.sponsoredIndicators) {
            if (selector.includes(':contains')) {
                const text = selector.match(/:contains\("([^"]+)"\)/)[1];
                const parts = selector.split(':');
                const baseSelector = parts[0];
                targets = targets.concat(PF_Helpers.findContains(rootNode, baseSelector, text));
            } else {
                targets = targets.concat(Array.from(rootNode.querySelectorAll(selector)));
            }
        }

        for (const indicator of targets) {
            const postWrapper = PF_Helpers.getClosest(indicator, PF_SELECTOR_MAP.postContainer);
            if (postWrapper) {
                PF_Helpers.hideElement(postWrapper, "Sponsored Post");
            }
        }
    }

    removeSuggestedPosts(rootNode) {
        // Suggested for you
        const suggestedWrapper = rootNode.querySelectorAll(PF_SELECTOR_MAP.suggestedForYouWrapper);
        suggestedWrapper.forEach(node => PF_Helpers.hideElement(node, "Suggested Posts"));

        if (this.settings.filters.removePYMK) {
            const pymkWrapper = rootNode.querySelectorAll(PF_SELECTOR_MAP.peopleYouMayKnow);
            pymkWrapper.forEach(node => PF_Helpers.hideElement(node, "People You May Know"));
        }

        if (this.settings.filters.removeGroupSuggestions) {
            const grpWrapper = rootNode.querySelectorAll(PF_SELECTOR_MAP.suggestedGroups);
            grpWrapper.forEach(node => PF_Helpers.hideElement(node, "Suggested Groups"));
        }
    }

    removeColoredBackgrounds(rootNode) {
        const coloredWrappers = rootNode.querySelectorAll(PF_SELECTOR_MAP.postColoredBackground);
        coloredWrappers.forEach(bg => {
            // Unset background styles forcing text back to standard rendering
            bg.style.backgroundImage = 'none';
            bg.style.backgroundColor = 'transparent';
            bg.style.color = 'var(--primary-text)';
            // Note: Facebook uses complex nested DOM, so this will strip styles but text may need sizing fixed which we handle in UI tweaks.
        });
    }

    applyKeywordFilters(rootNode) {
        const autohide = this.settings.keywords.autohide || [];
        const blocklist = this.settings.keywords.blocklist || [];
        
        if (autohide.length === 0 && blocklist.length === 0) return;

        // Note: For actual post text inspection we look inside `PF_SELECTOR_MAP.postTextBody`
        const textNodes = rootNode.querySelectorAll(PF_SELECTOR_MAP.postTextBody);
        
        textNodes.forEach(textContainer => {
            const textContent = textContainer.textContent.toLowerCase();
            const postWrapper = PF_Helpers.getClosest(textContainer, PF_SELECTOR_MAP.postContainer);
            if (!postWrapper || postWrapper.dataset.pfHidden) return;

            // Check auto-hide (Full silent deletion)
            let hidden = false;
            for (const kw of autohide) {
                if (textContent.includes(kw.toLowerCase())) {
                    PF_Helpers.hideElement(postWrapper, `Keyword Autohide: ${kw}`);
                    hidden = true;
                    break;
                }
            }
            if (hidden) return;

            // Check blocklist (Soft hiding/collapse)
            for (const kw of blocklist) {
                if (textContent.includes(kw.toLowerCase())) {
                    this._collapsePost(postWrapper, kw);
                    break; // stop at first match
                }
            }
        });
    }

    _collapsePost(postNode, matchedKeyword) {
        // Rather than hiding it completely, we dim it out and inject a "Show anyway" button
        if (postNode.dataset.pfCollapsed) return;
        
        // Hide the children
        postNode.dataset.pfCollapsed = 'true';
        postNode.style.position = 'relative';
        
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: var(--disabled-background, rgba(0,0,0,0.8));
            backdrop-filter: blur(8px); z-index: 10;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            border-radius: 8px; font-family: sans-serif; color: white;
        `;
        
        overlay.innerHTML = `
            <div style="margin-bottom: 15px; font-weight: bold;">Filtered by keyword: "${matchedKeyword}"</div>
            <button style="
                background: #6C3FC5; color: white; border: none; padding: 8px 16px; 
                border-radius: 4px; cursor: pointer; font-weight: bold;
            ">Show Anyway</button>
        `;
        
        overlay.querySelector('button').addEventListener('click', () => {
            postNode.removeChild(overlay);
        }, { once: true });

        postNode.appendChild(overlay);
    }

    hideTarget(rootNode, selector, reason) {
        const targets = rootNode.querySelectorAll(selector);
        targets.forEach(node => PF_Helpers.hideElement(node, reason));
    }
}

window.PF_Cleaner = PF_Cleaner;
