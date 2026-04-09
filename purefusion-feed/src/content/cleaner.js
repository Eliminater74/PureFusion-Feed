/**
 * PureFusion Feed - Cleaner Engine
 * 
 * Handles the logic required to identify Spam, Ads, and clutter and remove them.
 * Relies on PF_SELECTOR_MAP and settings defined by user.
 */

class PF_Cleaner {
    constructor(settings) {
        this.settings = settings;
        this._undoStyleInjected = false;
        this._panicMode = false;
        this.sponsoredTokens = [
            'sponsored',
            'publicidad',
            'patrocinado',
            'patrocinada',
            'sponsorise',
            'sponsorisee',
            'sponsorizzato',
            'gesponsert'
        ];
        this._injectUndoChipStyles();
    }

    updateSettings(settings) {
        this.settings = settings;
    }

    _injectUndoChipStyles() {
        if (this._undoStyleInjected || document.getElementById('pf-undo-chip-styles')) return;

        const style = document.createElement('style');
        style.id = 'pf-undo-chip-styles';
        style.textContent = `
            .pf-hidden-chip {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin: 8px 0;
                padding: 10px 12px;
                border-radius: 10px;
                border: 1px solid rgba(120, 132, 154, 0.3);
                background: rgba(25, 29, 39, 0.88);
                color: #e8edf8;
                font: 600 12px/1.3 "Segoe UI Variable Text", "Segoe UI", sans-serif;
            }

            .pf-hidden-chip-actions {
                display: inline-flex;
                gap: 8px;
                flex-wrap: wrap;
            }

            .pf-hidden-chip button {
                border: 1px solid rgba(120, 132, 154, 0.4);
                background: rgba(35, 41, 56, 0.9);
                color: #dbe6fa;
                border-radius: 999px;
                padding: 4px 10px;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
            }

            .pf-hidden-chip button:hover {
                border-color: rgba(18, 200, 220, 0.7);
                color: #9deeff;
            }
        `;
        document.head.appendChild(style);
        this._undoStyleInjected = true;
    }

    /**
     * Run a full sweep on the entire document body (usually done on navigation end).
     */
    sweepDocument() {
        PF_Logger.log("Running initial document sweep...");
        this._applyAllFilters(document.body);
        this._checkFeedRecovery();
    }

    /**
     * Sweep specific nodes recently added by the observer.
     * @param {Array<HTMLElement>} nodes 
     */
    sweepNodes(nodes) {
        for (const node of nodes) {
            this._applyAllFilters(node);
        }
        this._checkFeedRecovery();
    }

    _applyAllFilters(rootNode) {
        if (!rootNode || !rootNode.querySelectorAll) return;

        this._restoreCriticalContainers();
        if (this._panicMode) return;

        if (this.settings.filters.removeAds) {
            this.removeSponsored(rootNode);
            this.removeRightRailAds(rootNode);
        }
        if (this.settings.filters.removeSuggested) this.removeSuggestedPosts(rootNode); // Shared logic for suggested, pymk, groups

        if (this._hasStoryActivityFiltersEnabled()) {
            this.removeStoryActivityPosts(rootNode);
        }
        
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
            marketplaceNodes.forEach(node => this._hidePostNode(PF_Helpers.getClosest(node, PF_SELECTOR_MAP.postContainer), "Marketplace Unit"));
        }

        // F.B. Purity Parity Feature: Algorithmic Friend Activity (X liked this, Y commented on this)
        // This targets Facebook's attempt to force unrelated posts into your feed based on what your friends interact with.
        if (this.settings.social.hideMetaAI) {
            this.removeMetaAI(rootNode);
        }

        // Apply advanced Clickbait filtering (Phase 10)
        if (this.settings.wellbeing && this.settings.wellbeing.clickbaitBlocker) {
            this.removeClickbait(rootNode);
        }

        // Apply keyword sweeping
        this.applyKeywordFilters(rootNode);
    }

    _hasStoryActivityFiltersEnabled() {
        // Emergency stability guard:
        // Story activity filtering is temporarily disabled until selector-based
        // matching replaces the current text-heuristic approach.
        return false;
    }

    removeStoryActivityPosts(rootNode) {
        const sf = this.settings?.storyFilters;
        if (!sf) return;

        const strictPostSelector = '[data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"]';

        const rules = [
            {
                enabled: sf.hideBecameFriends,
                reason: 'Story Type: Became Friends',
                rx: /\b(became friends|are now friends|celebrating friendship|ahora son amigos)\b/
            },
            {
                enabled: sf.hideJoinedGroups,
                reason: 'Story Type: Joined Groups',
                rx: /\b(joined (a )?group|se unio a(l)? (un )?grupo)\b/
            },
            {
                enabled: sf.hideCommentedOnThis,
                reason: 'Story Type: Commented On This',
                rx: /\b(commented on this|ha comentado|comento en esto)\b/
            },
            {
                enabled: sf.hideLikedThis,
                reason: 'Story Type: Liked This',
                rx: /\b(liked this|reacted to this|le gusto esto|reacciono a esto)\b/
            },
            {
                enabled: sf.hideAttendingEvents,
                reason: 'Story Type: Event Attendance',
                rx: /\b(attending an event|attended an event|is interested in (an )?event|is going to (an )?event|interesado en (un )?evento|asistira a (un )?evento|asistio a (un )?evento)\b/
            },
            {
                enabled: sf.hideSharedMemories,
                reason: 'Story Type: Shared Memory',
                rx: /\b(shared a memory|your memories on facebook|compartio un recuerdo|recuerdos en facebook)\b/
            }
        ].filter((r) => r.enabled);

        if (!rules.length) return;

        const postCandidates = this._getPostCandidates(rootNode);
        const matchedPosts = [];
        let scannedCount = 0;

        postCandidates.forEach((postWrapper) => {
            if (!postWrapper || postWrapper.dataset.pfHidden) return;
            if (!postWrapper.matches || !postWrapper.matches(strictPostSelector)) return;
            if (!this._isLikelySingleFeedPost(postWrapper)) return;

            scannedCount++;

            const headerText = this._extractStoryHeaderText(postWrapper);
            if (!headerText) return;

            for (const rule of rules) {
                if (rule.rx.test(headerText)) {
                    matchedPosts.push({ node: postWrapper, reason: rule.reason });
                    break;
                }
            }
        });

        if (!matchedPosts.length) return;

        // Safety valve: if matching is abnormally high, bail out to avoid accidental feed wipe.
        const maxHide = Math.max(4, Math.floor(scannedCount * 0.3));
        if ((scannedCount > 1 && matchedPosts.length >= scannedCount) || matchedPosts.length > maxHide) {
            PF_Logger.warn(`Story activity filter safety bailout: matched ${matchedPosts.length}/${scannedCount}.`);
            return;
        }

        matchedPosts.forEach(({ node, reason }) => {
            this._hidePostNode(node, reason);
        });
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
        const adSpans = PF_Helpers.findContains(rightCol, 'span, div, h2, h3', 'Sponsored')
            .concat(PF_Helpers.findContains(rightCol, 'span, div, h2, h3', 'Publicidad'))
            .concat(PF_Helpers.findContains(rightCol, 'span, div, h2, h3', 'Patrocinado'));
        adSpans.forEach(el => {
            // Verify exact match to prevent false positives if someone's name contains the word
            if (this._isSponsoredLabel(el.textContent)) {
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
                    this._hidePostNode(postWrapper, "Reels Tray Heuristic");
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
                    this._hidePostNode(storyWrap, "Stories Tray Heuristic");
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
                if (this._isSponsoredLabel(text)) {
                    targets.push(el);
                }
            }
        });

        // 3. Post-level fallback scan for localized Sponsored markers.
        const postCandidates = this._getPostCandidates(rootNode);
        postCandidates.forEach((post) => {
            if (!post || post.dataset.pfHidden) return;
            const marker = this._findSponsoredMarkerInPost(post);
            if (marker) targets.push(marker);
        });

        for (const indicator of targets) {
            const postWrapper = PF_Helpers.getClosest(indicator, PF_SELECTOR_MAP.postContainer);
            if (postWrapper) {
                this._hidePostNode(postWrapper, "Sponsored Post (Heuristic)");
            }
        }
    }

    /**
     * Nuke Meta AI gradient icons and sparkle buttons.
     */
    removeMetaAI(rootNode) {
        // 1. Top Search Bar
        this.hideTarget(rootNode, PF_SELECTOR_MAP.metaAISearchIcon, "Meta AI Search Icon");
        
        // 2. Messenger Sparkle & AI Chats
        this.hideTarget(rootNode, PF_SELECTOR_MAP.metaAIMessengerSparkle, "Meta AI Messenger Sparkle");
        this.hideTarget(rootNode, PF_SELECTOR_MAP.metaAIHeader, "Meta AI Header");
    }

    removeSuggestedPosts(rootNode) {
        // Suggested for you
        const suggestedWrapper = rootNode.querySelectorAll(PF_SELECTOR_MAP.suggestedForYouWrapper);
        suggestedWrapper.forEach(node => this._hidePostNode(node, "Suggested Posts"));

        if (this.settings.filters.removePYMK) {
            const pymkWrapper = rootNode.querySelectorAll(PF_SELECTOR_MAP.peopleYouMayKnow);
            pymkWrapper.forEach(node => this._hidePostNode(node, "People You May Know"));
        }

        if (this.settings.filters.removeGroupSuggestions) {
            const selectors = Array.isArray(PF_SELECTOR_MAP.suggestedGroups) ? PF_SELECTOR_MAP.suggestedGroups : [PF_SELECTOR_MAP.suggestedGroups];
            for (const selector of selectors) {
                let targets = [];
                if (selector.includes(':contains')) {
                    const text = selector.match(/:contains\("([^"]+)"\)/)[1];
                    const parts = selector.split(':');
                    const baseSelector = parts[0];
                    targets = PF_Helpers.findContains(rootNode, baseSelector, text);
                } else {
                    targets = Array.from(rootNode.querySelectorAll(selector));
                }
                
                targets.forEach(node => {
                    // Try to find the bounding pagelet or post container
                    const wrap = PF_Helpers.getClosest(node, 'div[data-pagelet]') || node;
                    this._hidePostNode(wrap, "Suggested Groups");
                });
            }
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
                        this._hidePostNode(postWrapper, `Friend Activity Filter: ${pattern}`);
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
                if (postWrapper && !this._isAllowlistedPost(postWrapper, textContent.toLowerCase(), false)) {
                    this._collapsePost(postWrapper, "Clickbait Blocked", false);
                }
            }
        });
    }

    applyKeywordFilters(rootNode) {
        const autohide = this.settings.keywords.autohide || [];
        const blocklist = this.settings.keywords.blocklist || [];
        const allowlist = this.settings.keywords.allowlist || [];
        
        if (autohide.length === 0 && blocklist.length === 0 && allowlist.length === 0) return;

        const postCandidates = this._getPostCandidates(rootNode);

        postCandidates.forEach((postWrapper) => {
            if (!postWrapper || postWrapper.dataset.pfHidden) return;

            const textContent = this._extractPostText(postWrapper).toLowerCase();
            if (!textContent) return;

            if (this._isAllowlistedPost(postWrapper, textContent, true)) return;

            // Check auto-hide (Full silent deletion)
            let hidden = false;
            for (const kw of autohide) {
                const normalized = this._normalizeText(kw);
                if (normalized && textContent.includes(normalized)) {
                    this._hidePostNode(postWrapper, `Keyword Autohide: ${kw}`);
                    hidden = true;
                    break;
                }
            }
            if (hidden) return;

            // Check blocklist (Soft hiding/collapse)
            for (const kw of blocklist) {
                const normalized = this._normalizeText(kw);
                if (normalized && textContent.includes(normalized)) {
                    this._collapsePost(postWrapper, kw, true);
                    break; // stop at first match
                }
            }

            // Friends Only Mode check
            if (this.settings.uiMode.friendsOnlyMode) {
                if (
                    postWrapper.querySelector('a[href*="/groups/"]')
                    || textContent.includes('suggested for you')
                    || textContent.includes('sponsored')
                    || textContent.includes('join group')
                ) {
                    this._hidePostNode(postWrapper, "Friends Only Mode: Group/Page Hidden");
                    return;
                }
            }

            // Fundraiser hide check
            if (this.settings.filters.hideFundraisers) {
                if (textContent.includes('fundraiser') || textContent.includes('donate')) {
                    this._hidePostNode(postWrapper, "Fundraiser Module");
                }
            }
        });
    }

    _getPostCandidates(rootNode) {
        const results = [];
        const seen = new Set();

        const addCandidate = (node) => {
            if (!node || seen.has(node)) return;
            seen.add(node);
            results.push(node);
        };

        if (rootNode.matches && rootNode.matches(PF_SELECTOR_MAP.postContainer)) {
            addCandidate(rootNode);
        }

        if (rootNode.querySelectorAll) {
            rootNode.querySelectorAll(PF_SELECTOR_MAP.postContainer).forEach(addCandidate);

            // Some post shells are plain role=article, so include them as fallback.
            rootNode.querySelectorAll('[role="article"]').forEach((article) => {
                const inFeed = !!PF_Helpers.getClosest(article, '[role="feed"]', 12);
                const inDialog = !!PF_Helpers.getClosest(article, '[role="dialog"]', 6);
                if (!inFeed && !inDialog) return;

                const wrapped = PF_Helpers.getClosest(article, PF_SELECTOR_MAP.postContainer, 3) || article;
                addCandidate(wrapped);
            });
        }

        return results;
    }

    _findSponsoredMarkerInPost(postNode) {
        const candidates = postNode.querySelectorAll('[aria-label], a[role="link"], span, div');
        const postRect = postNode.getBoundingClientRect ? postNode.getBoundingClientRect() : null;

        for (const node of candidates) {
            const text = this._normalizeText(
                node.getAttribute('aria-label')
                || node.textContent
                || ''
            );

            if (!text || text.length > 32) continue;
            if (!this._isSponsoredLabel(text)) continue;

            // Prefer markers near the top header area of a post.
            if (postRect && node.getBoundingClientRect) {
                const rect = node.getBoundingClientRect();
                if (rect.top - postRect.top > 260) continue;
            }

            return node;
        }

        return null;
    }

    _isSponsoredLabel(text) {
        const normalized = this._normalizeText(text);
        if (!normalized) return false;

        return this.sponsoredTokens.some((token) => {
            return normalized === token
                || normalized.startsWith(`${token} `)
                || normalized.startsWith(`${token} ·`)
                || normalized.startsWith(`${token}:`);
        });
    }

    _hidePostNode(node, reason) {
        if (!node || node.dataset.pfHidden === 'true') return;
        if (node.matches && node.matches('html, body, [role="main"], [role="feed"]')) return;
        if (!this._isSafeHideTargetNode(node)) return;
        if (this._isAllowlistedPost(node)) return;

        if (this._isUndoEligible(node)) {
            this._insertUndoChip(node, reason);
        }

        PF_Helpers.hideElement(node, reason);
    }

    _isUndoEligible(node) {
        if (!node || !node.matches) return false;
        if (node.matches('[role="dialog"]')) return false;

        return node.matches('[data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"]')
            || !!PF_Helpers.getClosest(node, '[role="feed"]', 8);
    }

    _insertUndoChip(node, reason) {
        if (!node || !node.parentElement) return;
        if (node.dataset.pfUndoChip === 'true') return;

        const sourceName = this._extractPostSource(node);
        const i18n = (key, fallback) => {
            if (typeof chrome === 'undefined' || !chrome.i18n) return fallback;
            return chrome.i18n.getMessage(key) || fallback;
        };
        const chip = document.createElement('div');
        chip.className = 'pf-hidden-chip';
        chip.innerHTML = `
            <span>${i18n('content_hidden_chip_label', 'Hidden by PureFusion')}: ${reason}</span>
            <div class="pf-hidden-chip-actions">
                <button type="button" data-action="show">${i18n('content_hidden_chip_show_once', 'Show once')}</button>
                <button type="button" data-action="allow">${i18n('content_hidden_chip_allow_source', 'Always allow source')}</button>
            </div>
        `;

        chip.querySelector('[data-action="show"]').addEventListener('click', () => {
            this._restorePost(node, chip);
        });

        chip.querySelector('[data-action="allow"]').addEventListener('click', async () => {
            if (sourceName && sourceName !== 'Unknown') {
                await this._addSourceToAllowlist(sourceName);
            }
            this._restorePost(node, chip);
        });

        node.parentElement.insertBefore(chip, node);
        node.dataset.pfUndoChip = 'true';
    }

    _restorePost(node, chip) {
        if (!node) return;

        node.style.removeProperty('display');
        delete node.dataset.pfHidden;
        delete node.dataset.pfReason;
        delete node.dataset.pfUndoChip;

        if (chip && chip.remove) chip.remove();
    }

    _extractPostSource(node) {
        if (!node || !node.querySelector) return 'Unknown';

        const candidates = [
            'h2 a[role="link"]',
            'h3 a[role="link"]',
            'h4 a[role="link"]',
            'strong a[role="link"]',
            'h2',
            'h3',
            'h4',
            'strong'
        ];

        for (const selector of candidates) {
            const found = node.querySelector(selector);
            const text = found?.textContent?.trim();
            if (text && text.length > 1) return text;
        }

        return 'Unknown';
    }

    _isAllowlistedPost(node, cachedText = null, includeKeywordAllowlist = false) {
        if (!node) return false;

        const friends = (this.settings?.keywords?.allowlistFriends || [])
            .map((v) => String(v).trim().toLowerCase())
            .filter(Boolean);

        if (friends.length > 0) {
            const source = this._extractPostSource(node).toLowerCase();
            if (friends.some((friend) => source.includes(friend))) return true;
        }

        if (includeKeywordAllowlist) {
            const allowlist = (this.settings?.keywords?.allowlist || [])
                .map((v) => String(v).trim().toLowerCase())
                .filter(Boolean);

            if (allowlist.length > 0) {
                const textBody = (cachedText || this._extractPostText(node)).toLowerCase();
                if (allowlist.some((kw) => textBody.includes(kw))) return true;
            }
        }

        return false;
    }

    _extractStoryHeaderText(node) {
        if (!node || !node.querySelectorAll) return '';

        const parts = [];
        const seen = new Set();
        const postRect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
        const selectors = 'h2, h3, h4, a[role="link"] span[dir="auto"], span[dir="auto"]';

        node.querySelectorAll(selectors).forEach((el) => {
            if (parts.length >= 24) return;

            const text = this._normalizeText(el.textContent || '');
            if (!text || text.length < 6 || text.length > 140) return;
            if (seen.has(text)) return;

            if (postRect && el.getBoundingClientRect) {
                const rect = el.getBoundingClientRect();
                const topOffset = rect.top - postRect.top;
                if (topOffset < -4 || topOffset > 220) return;
            }

            seen.add(text);
            parts.push(text);
        });

        return parts.join(' ');
    }

    _isLikelySingleFeedPost(node) {
        if (!node || !node.querySelectorAll) return false;

        if (node.querySelector('[role="feed"]')) return false;

        const articleCount = node.querySelectorAll('[role="article"]').length;
        if (articleCount === 0) return false;
        if (articleCount > 1) return false;

        const textLength = (node.textContent || '').length;
        if (textLength > 9000) return false;

        return true;
    }

    _extractPostText(node) {
        if (!node || !node.querySelectorAll) return '';

        const parts = [];
        const seen = new Set();

        const selectors = [
            PF_SELECTOR_MAP.postTextBody,
            '[data-ad-comet-preview="message"]',
            'div[dir="auto"]',
            'span[dir="auto"]'
        ];

        selectors.forEach((selector) => {
            node.querySelectorAll(selector).forEach((el) => {
                const text = this._normalizeText(el.textContent || '');
                if (!text || text.length < 2) return;
                if (seen.has(text)) return;
                seen.add(text);
                parts.push(text);
            });
        });

        if (parts.length > 0) {
            return parts.join(' ');
        }

        return this._normalizeText(node.textContent || '');
    }

    _restoreCriticalContainers() {
        const hidden = document.querySelectorAll('[data-pf-hidden="true"]');
        hidden.forEach((node) => {
            if (!node) return;

            const isCritical = node.matches && node.matches('html, body, [role="main"], [role="feed"]');
            const containsFeed = !!(node.querySelector && node.querySelector('[role="feed"]'));
            const containsMain = !!(node.querySelector && node.querySelector('[role="main"]'));
            const articleCount = node.querySelectorAll ? node.querySelectorAll('[role="article"]').length : 0;

            let isHugeShell = false;
            if (node.getBoundingClientRect) {
                const rect = node.getBoundingClientRect();
                isHugeShell = rect.width > window.innerWidth * 0.7 && rect.height > window.innerHeight * 0.5;
            }

            if (!isCritical && !containsFeed && !containsMain && articleCount <= 2 && !isHugeShell) return;

            node.style.removeProperty('display');
            delete node.dataset.pfHidden;
            delete node.dataset.pfReason;
        });
    }

    _checkFeedRecovery() {
        if (this._panicMode) return;

        const feed = document.querySelector('[role="feed"]');
        if (!feed) return;

        const hiddenByPF = feed.querySelectorAll('[data-pf-hidden="true"]').length;
        if (!hiddenByPF) return;

        const visibleArticles = Array.from(feed.querySelectorAll('[role="article"]')).filter((node) => {
            if (!node || node.dataset.pfHidden === 'true') return false;
            const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
            return !!rect && rect.width > 0 && rect.height > 0;
        }).length;

        if (visibleArticles > 0) return;

        PF_Logger.warn(`Cleaner panic recovery activated. Hidden feed nodes: ${hiddenByPF}.`);
        this._panicMode = true;

        document.querySelectorAll('[data-pf-hidden="true"]').forEach((node) => {
            if (!node) return;
            node.style.removeProperty('display');
            delete node.dataset.pfHidden;
            delete node.dataset.pfReason;
        });
    }

    _isSafeHideTargetNode(node) {
        if (!node || !node.matches) return false;
        if (node.matches('html, body, [role="main"], [role="feed"]')) return false;
        if (node.querySelector && (node.querySelector('[role="feed"]') || node.querySelector('[role="main"]'))) return false;

        const articleCount = node.querySelectorAll ? node.querySelectorAll('[role="article"]').length : 0;
        if (articleCount > 2) return false;

        if (node.getBoundingClientRect) {
            const rect = node.getBoundingClientRect();
            if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.7) {
                return false;
            }
        }

        return true;
    }

    async _addSourceToAllowlist(sourceName) {
        const normalized = String(sourceName || '').trim();
        if (!normalized) return;

        const current = this.settings?.keywords?.allowlistFriends || [];
        const exists = current.some((v) => String(v).toLowerCase() === normalized.toLowerCase());
        if (exists) {
            PF_Helpers.showToast(`"${normalized}" ${this._i18n('content_allow_source_exists', 'is already in Never Hide Sources.')}`, 'info');
            return;
        }

        this.settings.keywords.allowlistFriends = [...current, normalized];
        await PF_Storage.updateSettings(this.settings);
        PF_Helpers.showToast(`${this._i18n('content_allow_source_added', 'Added')} "${normalized}" ${this._i18n('content_allow_source_added_suffix', 'to Never Hide Sources.')}`, 'success');

        window.postMessage({ type: 'PF_LOCAL_SETTINGS_UPDATE' }, '*');
    }

    _i18n(key, fallback) {
        if (typeof chrome === 'undefined' || !chrome.i18n) return fallback;
        return chrome.i18n.getMessage(key) || fallback;
    }

    _normalizeText(text) {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    _collapsePost(postNode, matchedKeyword, includeKeywordAllowlist = false) {
        // Rather than hiding it completely, we dim it out and inject a "Show anyway" button
        if (postNode.dataset.pfCollapsed) return;
        if (this._isAllowlistedPost(postNode, null, includeKeywordAllowlist)) return;
        
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
        targets.forEach((node) => {
            if (!this._isSafeHideTargetNode(node)) return;
            PF_Helpers.hideElement(node, reason);
        });
    }
}

window.PF_Cleaner = PF_Cleaner;
