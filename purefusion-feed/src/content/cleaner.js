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

        if (this.settings.filters.removeAds) {
            this.removeSponsored(rootNode);
            this.removeRightRailAds(rootNode);
        }
        if (this.settings.filters.removeSuggested) this.removeSuggestedPosts(rootNode); // Shared logic for suggested, pymk, groups
        
        if (this.settings.filters.removeColoredBackgrounds) this.removeColoredBackgrounds(rootNode);
        
        if (this.settings.sidebar.hideRightTrending) {
            this.hideTarget(rootNode, PF_SELECTOR_MAP.rightSidebarTrending || '[data-pagelet="RightRail"]', "Right Sidebar Trending");
        }
        
        // Hide features like Reels, Marketplace, Stories if toggled
        if (this.settings.filters.hideReels) this.removeReelsTray(rootNode);
        if (this.settings.filters.hideStories) this.removeStoriesTray(rootNode);
        if (this.settings.filters.hideMarketplace) this.hideTarget(rootNode, PF_SELECTOR_MAP.marketplaceTray || '[data-pagelet*="Marketplace"]', "Marketplace Tray");
        if (this.settings.filters.hideMarketplace) {
            // General marketplace injections in the feed often share the 'suggested' wrappers or a specific aria-label
            // For safety we catch strings here
            const marketplaceNodes = PF_Helpers.findContains(rootNode, '[role="article"]', 'Marketplace');
            marketplaceNodes.forEach(node => PF_Helpers.hideElement(PF_Helpers.getClosest(node, PF_SELECTOR_MAP.postContainer), "Marketplace Unit"));
        }

        // F.B. Purity Parity Feature: Algorithmic Friend Activity (X liked this, Y commented on this)
        // This targets Facebook's attempt to force unrelated posts into your feed based on what your friends interact with.
        if (this.settings.filters.removeFriendActivity) {
            this.removeFriendActivity(rootNode);
        }

        // Apply advanced Clickbait filtering (Phase 10)
        if (this.settings.wellbeing && this.settings.wellbeing.clickbaitBlocker) {
            this.removeClickbait(rootNode);
        }

        // Apply keyword sweeping
        this.applyKeywordFilters(rootNode);
    }

    /**
     * Hunt for side-rail specific ads which Facebook generates using different logic than Feed units.
     * @param {HTMLElement} rootNode 
     */
    removeRightRailAds(rootNode) {
        // Find the right column container
        const rightCol = rootNode.matches('[role="complementary"]') ? rootNode : rootNode.querySelector('[role="complementary"]');
        if (!rightCol) return;

        // 1. Static known containers
        const staticAds = rightCol.querySelectorAll('[data-pagelet="RightRailAdUnits"], [data-pagelet="EgoPane"]');
        staticAds.forEach(ad => PF_Helpers.hideElement(ad, "Right Rail Target"));

        // 2. Deep traverse for obfuscated text injection
        // FB injects "Sponsored" as literal text nodes in the sidebar
        const adSpans = PF_Helpers.findContains(rightCol, 'span, div, h2, h3', 'Sponsored');
        adSpans.forEach(el => {
            // Verify exact match to prevent false positives if someone's name contains the word
            if (el.textContent.trim() === "Sponsored") {
                const targetWrap = PF_Helpers.getClosest(el, 'div[data-pagelet]') || el.parentElement.parentElement;
                if (targetWrap && !targetWrap.dataset.pfHidden) {
                    PF_Helpers.hideElement(targetWrap, "Right Rail Heuristics");
                }
            }
        });
    }

    /**
     * More aggressive hunt for the Reels Tray since Facebook constantly changes the data-pagelet names.
     */
    removeReelsTray(rootNode) {
        // 1. Map Check
        this.hideTarget(rootNode, PF_SELECTOR_MAP.reelsTray, "Reels Target Array");

        // 2. Text Heuristic Check
        // The rootNode is usually the feed post itself during dynamic injection
        const textNodes = PF_Helpers.findContains(rootNode, 'span, h2, h3, div', 'Reels');
        textNodes.forEach(node => {
            const text = node.textContent.trim();
            // Match "Reels", "Reels and short videos", etc., ignoring long sentences
            if (text === 'Reels' || text.includes('Reels and short videos')) {
                // Try to find the specific post wrapper enclosing this element
                const postWrapper = PF_Helpers.getClosest(node, PF_SELECTOR_MAP.postContainer) || node.parentElement.parentElement.parentElement.parentElement;
                if (postWrapper && !postWrapper.dataset.pfHidden) {
                    PF_Helpers.hideElement(postWrapper, "Reels Tray Heuristic");
                }
            }
        });
    }

    /**
     * Aggressively hunts the Stories bar which lacks distinct wrapper names.
     */
    removeStoriesTray(rootNode) {
        // 1. Map Check
        this.hideTarget(rootNode, PF_SELECTOR_MAP.storiesTray, "Stories Target Array");

        // 2. Text Heuristic Check
        // Stories bar almost always contains exactly "Create story"
        const spans = PF_Helpers.findContains(rootNode, 'span, div', 'Create story');
        spans.forEach(node => {
            if (node.textContent.trim() === 'Create story') {
                // Find the main horizontal scrolling wrapper
                // FB uses many nested divs, we want to find the one bounding the entire strip.
                const storyWrap = PF_Helpers.getClosest(node, 'div[data-pagelet]') || node.parentElement.parentElement.parentElement.parentElement.parentElement;
                if (storyWrap && !storyWrap.dataset.pfHidden) {
                    PF_Helpers.hideElement(storyWrap, "Stories Tray Heuristic");
                }
            }
        });
    }

    /**
     * Hunt for sponsored elements, tracking up to their feed post parent to eradicate.
     * @param {HTMLElement} rootNode 
     */
    removeSponsored(rootNode) {
        let targets = [];
        
        // 1. Standard Selector / SVG heuristic
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

        // 2. Advanced aria-labelledby heuristic (Manifest V3 God-Mode)
        // FB often uses: <span aria-labelledby="some-id"></span> ... <span id="some-id">Sponsored</span>
        const labeledElements = rootNode.querySelectorAll('[aria-labelledby]');
        labeledElements.forEach(el => {
            const labelId = el.getAttribute('aria-labelledby');
            const labelNode = document.getElementById(labelId);
            if (labelNode) {
                const text = labelNode.textContent.trim();
                if (text === 'Sponsored' || text === 'Publicidad') {
                    targets.push(el);
                }
            }
        });

        for (const indicator of targets) {
            const postWrapper = PF_Helpers.getClosest(indicator, PF_SELECTOR_MAP.postContainer);
            if (postWrapper) {
                PF_Helpers.hideElement(postWrapper, "Sponsored Post (Heuristic)");
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

    removeFriendActivity(rootNode) {
        // Find headers indicating friend algorithmic activity
        const activityPatterns = ['commented on', 'liked', 'replied to', 'was mentioned in', 'is interested in'];
        
        const authorHeaders = rootNode.querySelectorAll('h3, h4, span > strong');
        authorHeaders.forEach(header => {
            const text = header.parentElement.textContent.toLowerCase();
            for (const pattern of activityPatterns) {
                if (text.includes(pattern)) {
                    // Make sure it's not the user's actual post text. These headers usually sit above the actual post content.
                    const postWrapper = PF_Helpers.getClosest(header, PF_SELECTOR_MAP.postContainer);
                    if (postWrapper) {
                        PF_Helpers.hideElement(postWrapper, `Friend Activity Filter: ${pattern}`);
                    }
                    break;
                }
            }
        });
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

    removeClickbait(rootNode) {
        // Regex patterns matching traditional high-volume viral clickbait
        const clickbaitRegex = /(you won.?t believe|this one trick|what happens next|will shock you|leave you speechless|reason why|this is why)/i;
        
        // Headlines on shared links are typically inside anchor tags or header blocks within the post body
        // But to be thorough we'll just check the base text payload
        const textNodes = rootNode.querySelectorAll(PF_SELECTOR_MAP.postTextBody);
        textNodes.forEach(textContainer => {
            const textContent = textContainer.textContent;
            if (clickbaitRegex.test(textContent)) {
                const postWrapper = PF_Helpers.getClosest(textContainer, PF_SELECTOR_MAP.postContainer);
                if (postWrapper) this._collapsePost(postWrapper, "Clickbait Blocked");
            }
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

            // 2. Friends Only Mode check
            if (this.settings.uiMode.friendsOnlyMode) {
                // If it contains markers of groups, pages, or suggested content.
                if (postWrapper.querySelector('a[href*="/groups/"]') || textContent.includes('suggested for you') || textContent.includes('sponsored') || textContent.includes('join group')) {
                    PF_Helpers.hideElement(postWrapper, "Friends Only Mode: Group/Page Hidden");
                    return;
                }
            }

            // 3. Fundraiser hide Check
            if (this.settings.filters.hideFundraisers) {
                if (textContent.includes('fundraiser') || textContent.includes('donate')) {
                    PF_Helpers.hideElement(postWrapper, "Fundraiser Module");
                    return;
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
