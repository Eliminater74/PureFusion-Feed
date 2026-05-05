/**
 * PureFusion Feed - Cleaner Core
 *
 * Defines the PF_Cleaner class with its constructor, top-level sweep pipeline,
 * and all shared utility / guard methods.  Prototype methods that belong to
 * specific feature areas (ads, content filters, undo) are added by the sibling
 * files cleaner-ads.js, cleaner-content.js, and cleaner-undo.js, which must be
 * loaded after this file.
 *
 * Load order requirement: this file FIRST, then the three extension files,
 * then main.js (which calls `new window.PF_Cleaner(settings)`).
 */

class PF_Cleaner {
    constructor(settings) {
        this.settings = settings;
        this.ruleEngine = new PF_RuleEngine(settings);
        this._undoStyleInjected = false;
        this._panicMode = false;
        this._recoveryIntervalId = null;
        this._reelsSeenCount = 0;
        this._reelsTrackedNodes = new WeakSet();
        this._reelsLimitNoticeShown = false;
        this._lastSurfaceScopeSkipKey = '';
        this.sponsoredTokens = [
            'sponsored',
            'publicidad',
            'patrocinado',
            'patrocinada',
            'sponsorise',
            'sponsorisee',
            'sponsorizzato',
            'gesponsert',
            'gesponsord',   // NL
            'sponsrad',     // SV
            'sponsoreret',  // DA
            'sponset',      // NO
        ];
        this._processedNodes = new WeakSet();
        this._nodeQueue = [];
        this._processingChunks = false;
        this._seenPostIds = new Set();

        this._injectUndoChipStyles();
        this._startRecoveryWatchdog();
    }

    updateSettings(settings) {
        const prevLimiterEnabled = !!this.settings?.wellbeing?.reelsLimiterEnabled;
        const prevLimit = Number(this.settings?.wellbeing?.reelsSessionLimit || 3);
        const prevDedup = !!this.settings?.filters?.deduplicatePosts;

        this.settings = settings;
        this.ruleEngine.updateSettings(settings);

        const nextLimiterEnabled = !!this.settings?.wellbeing?.reelsLimiterEnabled;
        const nextLimit = Number(this.settings?.wellbeing?.reelsSessionLimit || 3);

        if (!nextLimiterEnabled || !prevLimiterEnabled || nextLimit !== prevLimit) {
            this._resetReelsLimiterSession();
        }

        // Clear dedup history when the toggle is re-enabled so a fresh session starts.
        if (!prevDedup && !!this.settings?.filters?.deduplicatePosts) {
            this._seenPostIds.clear();
        }
    }

    /**
     * Run a full sweep on the entire document body (usually done on navigation end).
     */
    sweepDocument() {
        PF_Logger.log('Running initial document sweep...');
        this._applyAllFilters(document.body);
        this._checkFeedRecovery();
    }

    /**
     * Sweep specific nodes recently added by the observer.
     * @param {Array<HTMLElement>} nodes
     */
    sweepNodes(nodes) {
        if (!nodes || !nodes.length) return;

        // Push nodes into the processing queue
        this._nodeQueue.push(...nodes);

        if (!this._processingChunks) {
            this._startChunkedProcessing();
        }
    }

    _startChunkedProcessing() {
        this._processingChunks = true;
        this._processNextChunk();
    }

    _processNextChunk() {
        if (this._nodeQueue.length === 0) {
            this._processingChunks = false;
            this._checkFeedRecovery();
            return;
        }

        const startTime = performance.now();
        const chunkSize = 15;
        const chunk = this._nodeQueue.splice(0, chunkSize);

        for (const node of chunk) {
            this._applyAllFilters(node);
        }

        const duration = performance.now() - startTime;

        // Report chunk metrics to diagnostics if needed
        this._dispatchPipelineTelemetry(chunk.length, duration);

        // Schedule next chunk using the browser's idle time or a microtask fallback
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => this._processNextChunk(), { timeout: 250 });
        } else {
            setTimeout(() => this._processNextChunk(), 4);
        }
    }

    _dispatchPipelineTelemetry(nodeCount, duration) {
        window.dispatchEvent(new CustomEvent('pf:pipeline_latency', {
            detail: { nodes: nodeCount, durationMs: duration, ts: Date.now() }
        }));
    }

    _applyAllFilters(rootNode) {
        if (!rootNode || !rootNode.querySelectorAll) return;

        // Skip already processed atomic nodes (Posts, Ads, Feed Units)
        // This prevents expensive recursive re-scans.
        if (this._isProcessedNode(rootNode)) return;

        this._restoreCriticalContainers();
        if (this._panicMode) return;

        if (!this._shouldApplyForCurrentSurface()) {
            return;
        }

        // Phase 58 — Post Deduplication
        // Run before other filters so duplicates are caught regardless of their content.
        if (this.settings?.filters?.deduplicatePosts) {
            const article = rootNode.matches?.('[role="article"]')
                ? rootNode
                : rootNode.querySelector?.('[role="article"]');
            if (article) {
                const postId = this._extractPostId(article);
                if (postId) {
                    if (this._seenPostIds.has(postId)) {
                        const wrapper = PF_Helpers.getClosest(article, PF_SELECTOR_MAP.postContainer) || article;
                        this._hidePostNode(wrapper, 'Duplicate Post');
                        this._markNodeAsProcessed(rootNode);
                        return;
                    }
                    this._seenPostIds.add(postId);
                }
            }
        }

        // Phase 61 — Post Age Filter
        if ((this.settings?.filters?.postAgeMaxHours || 0) > 0) {
            const article = rootNode.matches?.('[role="article"]')
                ? rootNode
                : rootNode.querySelector?.('[role="article"]');
            if (article && this._filterByPostAge(article, rootNode)) return;
        }

        if (this.settings.filters.removeAds) {
            this._removeAdsByHardSignals(rootNode);
            this.removeRightRailAds(rootNode);
        }
        if (this.settings.filters.removeSponsored) {
            this._removeSponsoredByLabels(rootNode);
        }

        // Apply Power-User Rules (Phase 12)
        this.ruleEngine.applyRules(rootNode);

        if (this.settings.filters.removeSuggested) this.removeSuggestedPosts(rootNode);
        if (this.settings.filters.removePageSuggestions) this.removePageSuggestions(rootNode);
        if (this.settings.filters.removeGameInvites) this.removeGameInvitePosts(rootNode);

        if (this._hasPostTypeFiltersEnabled()) {
            this.removePostTypePosts(rootNode);
        }

        if (this._hasStoryActivityFiltersEnabled()) {
            this.removeStoryActivityPosts(rootNode);
        }

        if (this.settings.filters.removeColoredBackgrounds) this.removeColoredBackgrounds(rootNode);

        if (this._hasSidebarVisibilityFilters()) {
            this.removeNavigationModules(rootNode);
        }

        if (this._hasTopbarFiltersEnabled()) {
            this.removeTopbarModules(rootNode);
        }

        // Apply "Soul-Soother" notification jewel styling
        this._applyNotificationJewelStyle(rootNode);

        if (this._hasReelsSessionLimiterEnabled()) {
            this.applyReelsSessionLimiter(rootNode);
        }

        // Hide features like Reels, Marketplace, Stories, Memories if toggled
        if (this.settings.filters.hideReels) this.removeReelsTray(rootNode);
        if (this.settings.filters.hideStories) this.removeStoriesTray(rootNode);
        if (this.settings.filters.hideMemories) this.removeMemoriesPosts(rootNode);
        if (this.settings.filters.hideMarketplace) this.hideTarget(rootNode, PF_SELECTOR_MAP.marketplaceTray || '[data-pagelet*="Marketplace"]', 'Marketplace Tray');
        if (this.settings.filters.hideMarketplace) {
            // General marketplace injections in the feed often share the 'suggested' wrappers or a specific aria-label
            // For safety we catch strings here
            const marketplaceNodes = PF_Helpers.findContains(rootNode, '[role="article"]', 'Marketplace');
            marketplaceNodes.forEach(node => this._hidePostNode(PF_Helpers.getClosest(node, PF_SELECTOR_MAP.postContainer), 'Marketplace Unit'));
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

        // Apply Image Subject Filtering (FBP Parity)
        if (this._hasImageSubjectFiltersEnabled()) {
            this.applyImageSubjectFilters(rootNode);
        }

        // Apply keyword sweeping
        this.applyKeywordFilters(rootNode);

        // Messenger Privacy (Ghost Mode Title Suppression)
        this._applyMessengerPrivacyFilters();

        // Mark as processed
        this._markNodeAsProcessed(rootNode);
    }

    _isProcessedNode(node) {
        if (this._processedNodes.has(node)) return true;
        if (node.dataset && node.dataset.pfProcessed === 'true') return true;

        // We only mark specific "Atomic" units as processed to allow containers
        // like the feed root to be swept multiple times for children.
        return false;
    }

    _markNodeAsProcessed(node) {
        // Only mark atomic units or elements reasonably deep in the tree.
        // We don't want to mark document.body or the main feed wrapper.
        const atomicSelectors = '[role="article"], [data-pagelet*="FeedUnit"], [data-pagelet*="AdUnit"], [role="complementary"]';

        if (node.matches && node.matches(atomicSelectors)) {
            this._processedNodes.add(node);
            node.setAttribute('data-pf-processed', 'true');
        }
    }

    _hasStoryActivityFiltersEnabled() {
        if (this._panicMode) return false;

        const sf = this.settings?.storyFilters;
        if (!sf) return false;

        return !!(
            sf.hideBecameFriends
            || sf.hideJoinedGroups
            || sf.hideCommentedOnThis
            || sf.hideLikedThis
            || sf.hideAttendingEvents
            || sf.hideSharedMemories
            || sf.hideProfilePhotoUpdates
            || sf.hideCoverPhotoUpdates
            || sf.hideLifeEvents
            || sf.hideCheckIns
            || sf.hideMilestones
            || sf.hideJobWorkUpdates
            || sf.hideRelationshipUpdates
            || sf.hideGroupActivityPosts
        );
    }

    _hasImageSubjectFiltersEnabled() {
        if (this._panicMode) return false;

        const imageFilters = this.settings?.imageFilters;
        if (!imageFilters || !imageFilters.enabled) return false;

        return !!(
            imageFilters.hideSports
            || imageFilters.hideFood
            || imageFilters.hidePets
            || imageFilters.hideVehicles
            || imageFilters.hideScreenshotsMemes
            || imageFilters.hideTravelScenery
        );
    }

    _hasSidebarVisibilityFilters() {
        if (this._panicMode) return false;

        const sidebar = this.settings?.sidebar;
        if (!sidebar || !sidebar.enableModuleFilters) return false;

        return !!(
            sidebar.hideLeftMarketplace
            || sidebar.hideLeftGaming
            || sidebar.hideLeftWatch
            || sidebar.hideLeftMemories
            || sidebar.hideLeftMetaAI
            || sidebar.hideLeftManusAI
            || sidebar.hideRightTrending
            || sidebar.hideRightContacts
            || sidebar.hideRightMetaAIContact
            || sidebar.hideRightManusAIContact
            || sidebar.hideRightEvents
            || sidebar.hideRightBirthdays
        );
    }

    _hasPostTypeFiltersEnabled() {
        if (this._panicMode) return false;

        const filters = this.settings?.filters;
        if (!filters) return false;

        return !!(
            filters.hideVideoPosts
            || filters.hidePhotoPosts
            || filters.hideLinkPosts
            || filters.hideTextOnlyPosts
            || filters.hideLiveVideoPosts
            || filters.hideShareReposts
            || filters.hidePollPosts
        );
    }

    _getCurrentSurfaceKey() {
        const pathname = String(window?.location?.pathname || '/').toLowerCase();

        if (pathname === '/' || pathname === '/home.php') return 'home';
        if (pathname.startsWith('/groups')) return 'groups';
        if (pathname.startsWith('/watch')) return 'watch';
        if (pathname.startsWith('/marketplace')) return 'marketplace';
        return 'other';
    }

    _shouldApplyForCurrentSurface() {
        const surfaceControls = this.settings?.surfaceControls;
        if (!surfaceControls || !surfaceControls.enabled) {
            this._lastSurfaceScopeSkipKey = '';
            return true;
        }

        const surfaceKey = this._getCurrentSurfaceKey();
        let allowed = true;

        switch (surfaceKey) {
            case 'home':
                allowed = surfaceControls.applyHome !== false;
                break;
            case 'groups':
                allowed = surfaceControls.applyGroups !== false;
                break;
            case 'watch':
                allowed = surfaceControls.applyWatch !== false;
                break;
            case 'marketplace':
                allowed = surfaceControls.applyMarketplace !== false;
                break;
            default:
                allowed = surfaceControls.applyOther !== false;
                break;
        }

        if (allowed) {
            this._lastSurfaceScopeSkipKey = '';
            return true;
        }

        const skipKey = `${surfaceKey}:${window.location.pathname}`;
        if (skipKey !== this._lastSurfaceScopeSkipKey) {
            this._lastSurfaceScopeSkipKey = skipKey;
            PF_Logger.log(`Surface scope active: filters skipped on '${surfaceKey}' surface.`);
        }

        return false;
    }

    _hasTopbarFiltersEnabled() {
        if (this._panicMode) return false;

        const topbar = this.settings?.topbarFilters;
        if (!topbar || !topbar.enabled) return false;

        return !!(
            topbar.hideHome
            || topbar.hideFriends
            || topbar.hideWatch
            || topbar.hideMarketplace
            || topbar.hideGroups
            || topbar.hideMessenger
            || topbar.hideNotifications
            || topbar.hideMenu
            || topbar.hideCreate
            || topbar.hideGaming
        );
    }

    _hasReelsSessionLimiterEnabled() {
        if (this._panicMode) return false;
        if (this.settings?.filters?.hideReels) return false;

        const wellbeing = this.settings?.wellbeing;
        if (!wellbeing) return false;

        return !!wellbeing.reelsLimiterEnabled;
    }

    _startRecoveryWatchdog() {
        if (this._recoveryIntervalId) return;

        this._recoveryIntervalId = setInterval(() => {
            if (document.hidden) return;
            this._restoreCriticalContainers();
            this._checkFeedRecovery();
        }, 1500);
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

    destroy() {
        if (this._recoveryIntervalId) {
            clearInterval(this._recoveryIntervalId);
            this._recoveryIntervalId = null;
        }
    }

    hideTarget(rootNode, selector, reason) {
        const targets = rootNode.querySelectorAll(selector);
        targets.forEach((node) => {
            if (!this._isSafeHideTargetNode(node)) return;
            PF_Helpers.hideElement(node, reason);
        });
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

    _normalizeComparableText(text) {
        return String(text || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }
}

window.PF_Cleaner = PF_Cleaner;
