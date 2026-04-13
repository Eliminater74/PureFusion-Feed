/**
 * PureFusion Feed - Content Root (main.js)
 * 
 * Injected entry point that wires all classes together and initializes 
 * the application loop against facebook.com.
 */

class PureFusionApp {
    constructor() {
        this.settings = {};
        this.cleaner = null;
        this.observer = null;
        this.postUpdateSweepTimer = null;
        this.postUpdateSweepTimerLong = null;
        this.maxPipelineNodesPerBatch = 220;
        this.maxPipelineProcessingMs = 14;
        this.isSyncingSettings = false;
        this.hasQueuedSettingsSync = false;
        this.quickContextCaptureBound = false;
    }

    async boot() {
        PF_Logger.info("Booting PureFusion Feed Engine...");

        try {
            // Await settings load from storage abstraction
            this.settings = await PF_Storage.init();
            PF_Logger.log("Settings successfully loaded.");

            const initialSettings = this.getEffectiveSettings();

            // Initialize Modules
            this.cleaner = new window.PF_Cleaner(initialSettings);
            this.commentPreview = new window.PF_CommentPreview(initialSettings);
            this.uiTweaks = new window.PF_UiTweaks(initialSettings);
            this.feedManager = new window.PF_FeedManager(initialSettings);
            this.predictor = new window.PF_Predictor(initialSettings);
            this.socialTools = new window.PF_SocialTools(initialSettings);
            this.notifControls = new window.PF_NotificationControls(initialSettings);
            this.wellbeing = new window.PF_Wellbeing(initialSettings);
            this.llmFeatures = new window.PF_LLMFeatures(initialSettings);
            this.messengerAI = new window.PF_MessengerAI(initialSettings);
            this.inpageUI = new window.PF_InPageUI(initialSettings);
            this.diagnostics = new window.PF_Diagnostics(initialSettings);
            this.observer = new window.PF_Observer();

            // Set up our centralized event bus listeners
            this.setupEventListeners();

            this._syncModuleSettings();

            if (this.isEnabled()) {
                // Initial manual sweep to clean anything already rendered
                this.cleaner.sweepDocument();

                // Apply root-level structural changes
                this.feedManager.applyDocumentLevelTweaks();
                this.uiTweaks.applyDocumentLevelTweaks();
                this._applyNavigationHardening();
                this.diagnostics.applyDocumentLevelTweaks();
                this.commentPreview.sweepDocument();
                if (this.llmFeatures) this.llmFeatures.sweepDocument();
                if (this.predictor) this.predictor.sweepDocument();

                // Start MutationObserver for dynamically injected feed elements
                this.observer.start();
            } else {
                PF_Logger.info("PureFusion is disabled from settings.");
            }

            PF_Logger.info("PureFusion Main initialized.", this.settings);

            this._checkChronologicalEnforcement();

            PF_Logger.info("PureFusion is active and monitoring.");

        } catch (error) {
            PF_Logger.error("Failed to initialize PureFusion app: ", error);
        }
    }

    _checkChronologicalEnforcement() {
        if (!this.isEnabled()) return;
        if (!this.settings.uiMode || !this.settings.uiMode.enforceChronologicalFeed) return;

        // Force redirect to Recent feed if we land on the bare algorithmic feed
        // FB uses ?sk=h_chr or ?filter=all&sk=h_chr
        const isBareNewsfeed = (window.location.pathname === '/' || window.location.pathname === '/home.php') 
                            && !window.location.search.includes('sk=h_chr');
                            
        if (isBareNewsfeed) {
            PF_Logger.info("PureFusion: Chronological enforcement active. Redirecting feed...");
            window.location.replace('/?filter=all&sk=h_chr');
        }

        this._applyNavigationHardening();
    }

    _applyNavigationHardening() {
        if (!this.isEnabled() || !this.settings.uiMode?.enforceChronologicalFeed) return;

        // Rewrite "Home" links to point directly to the chronological feed
        // This prevents accidental clicks from resetting the filter
        const homeLinks = document.querySelectorAll(`${PF_SELECTOR_MAP.sidebarHomeLink}, ${PF_SELECTOR_MAP.topNavHomeLink}`);
        homeLinks.forEach(link => {
            const currentHref = link.getAttribute('href');
            if (currentHref === '/' || currentHref?.includes('sk=h_nor')) {
                link.setAttribute('href', '/?filter=all&sk=h_chr');
                link.setAttribute('data-pf-hardened', 'true');
            }
        });
    }

    setupEventListeners() {
        // Listen to batched DOM injections from our custom observer
        document.addEventListener('pf:nodes_added', (e) => {
            if (!this.isEnabled()) return;

            const incomingNodes = Array.isArray(e?.detail?.nodes) ? e.detail.nodes : [];
            const addedNodes = this._preparePipelineNodes(incomingNodes);

            this._dispatchDiagnosticsEvent('pf:pipeline_batch', {
                receivedNodes: incomingNodes.length,
                dispatchedNodes: addedNodes.length,
                trimmedNodes: Math.max(0, incomingNodes.length - addedNodes.length),
                ts: Date.now()
            });

            if (!addedNodes.length) return;

            // Phase 10: Digital Wellbeing Infinite Scroll Break
            let blockProcessing = false;
            if (this.wellbeing) blockProcessing = this.wellbeing.applyScrollStopper(addedNodes);
            if (blockProcessing) return; // Drop processing payload

            this._runNodeProcessorsWithBudget(addedNodes);
        });

        // 1. Listen for background script updates (Popup/Options)
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
            try {
                chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                    if (request.type === 'PF_SETTINGS_UPDATED') {
                        PF_Logger.log("Settings update detected. Re-syncing.");
                        this.updateSettingsAndResweep();
                        if (sendResponse) sendResponse({ status: "success" });
                        return;
                    }

                    if (request.type === 'PF_QUICK_ACTION_FEEDBACK') {
                        const message = String(request.message || '').trim();
                        const tone = String(request.tone || 'info').trim();
                        const undoToken = String(request.undoToken || '').trim();
                        const undoLabel = String(request.undoLabel || 'Undo').trim() || 'Undo';

                        if (message && window.PF_Helpers && undoToken && typeof window.PF_Helpers.showActionToast === 'function') {
                            window.PF_Helpers.showActionToast(message, undoLabel, () => {
                                try {
                                    chrome.runtime.sendMessage({ type: 'PF_QUICK_ACTION_UNDO', token: undoToken }, (response) => {
                                        const runtimeErr = chrome.runtime && chrome.runtime.lastError;
                                        if (runtimeErr) {
                                            if (window.PF_Helpers && typeof window.PF_Helpers.showToast === 'function') {
                                                window.PF_Helpers.showToast('Undo failed. Please try again.', 'error', 3200);
                                            }
                                            return;
                                        }

                                        const replyMessage = String(response?.message || '').trim();
                                        const replyTone = String(response?.tone || (response?.ok ? 'success' : 'warn')).trim();
                                        if (replyMessage && window.PF_Helpers && typeof window.PF_Helpers.showToast === 'function') {
                                            window.PF_Helpers.showToast(replyMessage, replyTone, 3200);
                                        }
                                    });
                                } catch (err) {
                                    if (window.PF_Helpers && typeof window.PF_Helpers.showToast === 'function') {
                                        window.PF_Helpers.showToast('Undo failed. Please try again.', 'error', 3200);
                                    }
                                }
                            }, tone, 5600);
                            return;
                        }

                        if (message && window.PF_Helpers && typeof window.PF_Helpers.showToast === 'function') {
                            window.PF_Helpers.showToast(message, tone, 3600);
                        }
                    }

                    if (request.type === 'PF_ZAP_ELEMENT') {
                        this._handleZapCommand();
                        if (sendResponse) sendResponse({ status: "success" });
                        return;
                    }
                });
            } catch (e) {
                PF_Logger.warn("PureFusion: Extension context invalidated. Hot-reloading disabled.");
            }
        }

        // 2. Listen to window messages (from the embedded React/Iframe Dashboard)
        window.addEventListener('message', (event) => {
            const isUpdateMessage = event.data
                && (event.data.type === 'PF_LOCAL_SETTINGS_UPDATE' || event.data.type === 'PF_LOCAL_SETTINGS_UDPATE');

            if (isUpdateMessage) {
                PF_Logger.log("In-Page Settings update detected. Resweeping.");
                this.updateSettingsAndResweep();
            }
        });

        this._setupQuickActionContextCapture();
    }

    _setupQuickActionContextCapture() {
        if (this.quickContextCaptureBound) return;
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;

        this.quickContextCaptureBound = true;

        document.addEventListener('contextmenu', (event) => {
            this.lastRightClickedElement = event?.target;
            const payload = this._captureQuickContextPayload(event?.target);
            if (!payload) return;

            try {
                chrome.runtime.sendMessage({
                    type: 'PF_CONTEXT_TARGET',
                    payload
                });
            } catch (err) {
                // Ignore transient extension-context failures.
            }
        }, true);
    }

    async _handleZapCommand() {
        if (!this.lastRightClickedElement) {
            if (window.PF_Helpers) window.PF_Helpers.showToast('Could not identify element to Zap.', 'warn');
            return;
        }

        const target = this.lastRightClickedElement;
        const selector = window.PF_Helpers.generateSelector(target);

        if (!selector) {
            if (window.PF_Helpers) window.PF_Helpers.showToast('Could not generate selector for this element.', 'error');
            return;
        }

        // Create the rule
        const newRule = {
            id: 'zap_' + Date.now(),
            label: 'Zap: ' + (target.tagName || 'Element'),
            type: 'selector',
            selector: selector,
            enabled: true
        };

        if (!this.settings.rules) this.settings.rules = { customRules: [] };
        if (!Array.isArray(this.settings.rules.customRules)) this.settings.rules.customRules = [];
        
        this.settings.rules.customRules.push(newRule);

        // Save and apply
        await window.PF_Storage.updateSettings(this.settings);
        this.updateSettingsAndResweep();

        if (window.PF_Helpers) {
            window.PF_Helpers.showActionToast(
                'Element Zapped and hidden.', 
                'Undo', 
                async () => {
                    this.settings.rules.customRules = this.settings.rules.customRules.filter(r => r.id !== newRule.id);
                    await window.PF_Storage.updateSettings(this.settings);
                    // Force reveal the element (standard resweep won't show it if it was display:none !important)
                    target.style.display = '';
                    target.removeAttribute('data-pf-rule-hidden');
                    this.updateSettingsAndResweep();
                }, 
                'success'
            );
        }
    }

    _captureQuickContextPayload(target) {
        const element = target && target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
        if (!element || !element.closest) return null;

        const linkNode = element.closest('a[href], [role="link"][href], [role="link"]');
        if (!linkNode) return null;

        const candidates = [
            linkNode.textContent,
            linkNode.getAttribute ? linkNode.getAttribute('aria-label') : '',
            linkNode.getAttribute ? linkNode.getAttribute('title') : ''
        ];

        const imgAlt = linkNode.querySelector ? linkNode.querySelector('img[alt]') : null;
        if (imgAlt && imgAlt.getAttribute) candidates.push(imgAlt.getAttribute('alt'));

        const sourceName = candidates
            .map((value) => this._normalizeQuickContextText(value))
            .find((value) => this._looksLikeQuickContextSource(value));

        if (!sourceName) return null;

        let linkUrl = '';
        try {
            const rawHref = linkNode.href || (linkNode.getAttribute ? linkNode.getAttribute('href') : '') || '';
            if (rawHref) linkUrl = new URL(rawHref, window.location.href).toString();
        } catch (err) {
            linkUrl = '';
        }

        return {
            sourceName,
            linkUrl,
            ts: Date.now()
        };
    }

    _normalizeQuickContextText(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    _looksLikeQuickContextSource(value) {
        const text = this._normalizeQuickContextText(value);
        if (!text || text.length < 2 || text.length > 90) return false;

        const normalized = text.toLowerCase();
        if (/^(like|reply|share|follow|comment|send|more|save|hide|report|menu)$/.test(normalized)) return false;
        if (normalized.includes('http://') || normalized.includes('https://')) return false;
        if (/^\d+$/.test(normalized)) return false;

        return true;
    }

    async updateSettingsAndResweep() {
        if (this.isSyncingSettings) {
            this.hasQueuedSettingsSync = true;
            return;
        }

        this.isSyncingSettings = true;

        try {
            this.settings = await PF_Storage.getSettings();

            this._syncModuleSettings();

            if (!this.isEnabled()) {
                this._clearFollowupResweeps();
                if (this.observer) this.observer.stop();
                return;
            }

            if (this.observer) this.observer.start();
            this._dispatchDiagnosticsEvent('pf:settings_update', {
                source: 'runtime-settings-sync'
            });

            this._runLiveResweepPass('settings-immediate');
            if (this.predictor) this.predictor.sweepDocument();
            this._scheduleFollowupResweeps();
            this._checkChronologicalEnforcement();
        } catch (err) {
            PF_Logger.error('PureFusion: settings sync/resweep failed.', err);
        } finally {
            this.isSyncingSettings = false;

            if (this.hasQueuedSettingsSync) {
                this.hasQueuedSettingsSync = false;
                this.updateSettingsAndResweep();
            }
        }
    }

    _preparePipelineNodes(nodes) {
        if (!Array.isArray(nodes) || nodes.length === 0) return [];

        const unique = [];
        const seen = new Set();

        for (const node of nodes) {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;
            if (seen.has(node)) continue;
            seen.add(node);

            if (!this._isPipelineCandidateNode(node)) continue;
            unique.push(node);
        }

        if (unique.length <= this.maxPipelineNodesPerBatch) return unique;

        const highSignal = [];
        const normal = [];

        unique.forEach((node) => {
            if (this._isHighSignalPipelineNode(node)) highSignal.push(node);
            else normal.push(node);
        });

        const selected = highSignal.slice(0, this.maxPipelineNodesPerBatch);
        if (selected.length < this.maxPipelineNodesPerBatch) {
            selected.push(...normal.slice(0, this.maxPipelineNodesPerBatch - selected.length));
        }

        return selected;
    }

    _isPipelineCandidateNode(node) {
        if (!node || !node.tagName) return false;

        const tag = node.tagName.toUpperCase();
        if (['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'PATH', 'USE', 'DEFS', 'TITLE'].includes(tag)) {
            return false;
        }

        if (node.dataset && node.dataset.pfHidden === 'true') return false;
        return true;
    }

    _isHighSignalPipelineNode(node) {
        if (!node || !node.matches) return false;

        if (node.matches('[data-pagelet], [role="dialog"], [role="feed"], [role="article"], [role="banner"], [role="navigation"], [role="menu"], [role="complementary"], [aria-live]')) {
            return true;
        }

        if (!node.querySelector) return false;
        return !!node.querySelector('[data-pagelet], [role="dialog"], [role="article"], [role="menu"], [aria-live]');
    }

    _runLiveResweepPass(phase = 'manual-pass') {
        if (this.cleaner) this.cleaner.sweepDocument();
        if (this.feedManager) this.feedManager.applyDocumentLevelTweaks();
        if (this.uiTweaks) this.uiTweaks.applyDocumentLevelTweaks();
        this._applyNavigationHardening();
        if (this.diagnostics) this.diagnostics.applyDocumentLevelTweaks();
        if (this.commentPreview) this.commentPreview.sweepDocument();
        if (this.llmFeatures) this.llmFeatures.sweepDocument();

        this._dispatchDiagnosticsEvent('pf:resweep_pass', {
            phase,
            ts: Date.now()
        });
    }

    _clearFollowupResweeps() {
        if (this.postUpdateSweepTimer) {
            clearTimeout(this.postUpdateSweepTimer);
            this.postUpdateSweepTimer = null;
        }

        if (this.postUpdateSweepTimerLong) {
            clearTimeout(this.postUpdateSweepTimerLong);
            this.postUpdateSweepTimerLong = null;
        }
    }

    _scheduleFollowupResweeps() {
        this._clearFollowupResweeps();

        this.postUpdateSweepTimer = setTimeout(() => {
            if (!this.isEnabled()) return;
            this._runLiveResweepPass('settings-followup-fast');
        }, 650);

        this.postUpdateSweepTimerLong = setTimeout(() => {
            if (!this.isEnabled()) return;
            this._runLiveResweepPass('settings-followup-deep');
        }, 1800);
    }

    _dispatchDiagnosticsEvent(type, detail) {
        if (!type) return;

        try {
            window.dispatchEvent(new CustomEvent(type, { detail }));
        } catch (err) {
            // no-op when CustomEvent dispatch is unavailable
        }
    }

    _runNodeProcessorsWithBudget(nodes) {
        const processors = [
            { name: 'cleaner', run: () => this.cleaner && this.cleaner.sweepNodes(nodes) },
            { name: 'uiTweaks', run: () => this.uiTweaks && this.uiTweaks.applyToNodes(nodes) },
            { name: 'predictor', run: () => this.predictor && this.predictor.applyToNodes(nodes) },
            { name: 'commentPreview', run: () => this.commentPreview && this.commentPreview.applyToNodes(nodes) },
            { name: 'llmFeatures', run: () => this.llmFeatures && this.llmFeatures.applyToNodes(nodes) },
            { name: 'messengerAI', run: () => this.messengerAI && this.messengerAI.applyToNodes(nodes) },
            { name: 'notifControls', run: () => this.notifControls && this.notifControls.applyToNodes(nodes) },
            { name: 'diagnostics', run: () => this.diagnostics && this.diagnostics.applyToNodes(nodes) }
        ];

        this._runNodeProcessorsWithBudgetSlice(nodes, processors, 0);
    }

    _runNodeProcessorsWithBudgetSlice(nodes, processors, startIndex) {
        if (!Array.isArray(processors) || startIndex >= processors.length) return;

        const sliceStart = this._pipelineNow();

        for (let i = startIndex; i < processors.length; i += 1) {
            const processor = processors[i];
            if (!processor || typeof processor.run !== 'function') continue;

            try {
                processor.run();
            } catch (err) {
                PF_Logger.warn(`PureFusion: processor failed (${processor.name || 'unknown'})`, err);
            }

            const elapsed = this._pipelineNow() - sliceStart;
            if (elapsed >= this.maxPipelineProcessingMs && i < processors.length - 1) {
                const remainingProcessors = processors.length - (i + 1);
                const deferredFrom = String(processor.name || `index-${i}`);

                this._dispatchDiagnosticsEvent('pf:pipeline_budget', {
                    nodes: Array.isArray(nodes) ? nodes.length : 0,
                    budgetMs: this.maxPipelineProcessingMs,
                    elapsedMs: Number(elapsed.toFixed(3)),
                    remainingProcessors,
                    deferredFrom,
                    ts: Date.now()
                });

                setTimeout(() => {
                    if (!this.isEnabled()) return;
                    this._runNodeProcessorsWithBudgetSlice(nodes, processors, i + 1);
                }, 0);

                return;
            }
        }
    }

    _pipelineNow() {
        if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
            return performance.now();
        }
        return Date.now();
    }

    _syncModuleSettings() {
        const effectiveSettings = this.getEffectiveSettings();

        const modules = [
            this.cleaner,
            this.commentPreview,
            this.uiTweaks,
            this.feedManager,
            this.predictor,
            this.socialTools,
            this.notifControls,
            this.wellbeing,
            this.llmFeatures,
            this.messengerAI,
            this.inpageUI,
            this.diagnostics
        ];

        modules.forEach((moduleRef) => {
            if (!moduleRef) return;

            if (typeof moduleRef.updateSettings === 'function') {
                moduleRef.updateSettings(effectiveSettings);
            } else {
                moduleRef.settings = effectiveSettings;
            }
        });
    }

    getEffectiveSettings() {
        const effective = JSON.parse(JSON.stringify(this.settings || {}));
        this._applyExperienceMode(effective);

        if (this.isEnabled()) return effective;

        effective.filters = {
            ...effective.filters,
            removeAds: false,
            removeSuggested: false,
            removePYMK: false,
            removeGroupSuggestions: false,
            removePageSuggestions: false,
            hideReels: false,
            hideMarketplace: false,
            hideStories: false,
            hideFundraisers: false,
            hideVideoPosts: false,
            hidePhotoPosts: false,
            hideLinkPosts: false,
            hideTextOnlyPosts: false,
            removeColoredBackgrounds: false
        };

        effective.uiMode = {
            ...effective.uiMode,
            forceMostRecent: false,
            enforceChronologicalFeed: false,
            hideMessengerSeen: false,
            notificationJewelStyle: 'classic',
            customStylingEnabled: false,
            customFontFamily: '',
            customAccentColor: '',
            customTextColor: '',
            customCardBackground: '',
            customBackground: '',
            customCss: ''
        };

        effective.social = {
            ...effective.social,
            hideMetaAI: false,
            hideMessengerTyping: false,
            messengerPrivacyBlur: false,
            notificationDigestMode: false,
            autoCommentPreview: false,
            blockNotifGames: false,
            blockNotifBirthdays: false,
            blockNotifMarketplace: false,
            blockNotifEngagement: false,
            hideSearchPopupSuggestions: false,
            hideSearchTrending: false,
            hideSearchRecent: false
        };

        effective.predictions = {
            ...effective.predictions,
            enabled: false
        };

        effective.imageFilters = {
            ...effective.imageFilters,
            enabled: false,
            hideSports: false,
            hideFood: false,
            hidePets: false,
            hideVehicles: false,
            hideScreenshotsMemes: false,
            hideTravelScenery: false
        };

        effective.surfaceControls = {
            ...effective.surfaceControls,
            enabled: false,
            applyHome: true,
            applyGroups: true,
            applyWatch: true,
            applyMarketplace: true,
            applyOther: true
        };

        effective.topbarFilters = {
            ...effective.topbarFilters,
            enabled: false,
            hideHome: false,
            hideFriends: false,
            hideWatch: false,
            hideMarketplace: false,
            hideGroups: false,
            hideMessenger: false,
            hideNotifications: false,
            hideMenu: false,
            hideCreate: false
        };

        effective.diagnostics = {
            ...effective.diagnostics,
            enabled: false,
            showOverlay: false,
            compactOverlay: false,
            verboseConsole: false,
            maxReasons: 6,
            observerWarnDurationMs: 25,
            observerSevereDurationMs: 45,
            observerWarnNodes: 220,
            observerSevereNodes: 420,
            observerWarnRecords: 120,
            observerSevereRecords: 240
        };

        effective.wellbeing = {
            ...effective.wellbeing,
            grayscaleMode: false,
            infiniteScrollStopper: false,
            sessionTimer: false,
            sessionAwarenessEnabled: false,
            sessionAwarenessScrollsPerMinuteThreshold: 85,
            sessionAwarenessCooldownMinutes: 12,
            dailyFeedReportEnabled: false,
            dailyFeedReportAutoMinutes: 30,
            reelsLimiterEnabled: false,
            reelsSessionLimit: 3,
            reelsHardLock: false,
            clickbaitBlocker: false,
            ragebaitDetector: false
        };

        effective.llm = {
            ...effective.llm,
            tldrEnabled: false,
            smartCommentEnabled: false,
            clickbaitDecoder: false,
            messengerRewriteEnabled: false,
            messengerSmartRepliesEnabled: false
        };

        return effective;
    }

    _applyExperienceMode(effective) {
        if (!effective || typeof effective !== 'object') return;

        if (!effective.experienceMode || typeof effective.experienceMode !== 'object') {
            effective.experienceMode = { active: 'custom' };
        }

        const allowedModes = new Set(['custom', 'clean', 'focus', 'ultrafast', 'smart', 'classic']);
        const requestedMode = String(effective.experienceMode.active || 'custom').toLowerCase();
        const mode = allowedModes.has(requestedMode) ? requestedMode : 'custom';
        effective.experienceMode.active = mode;

        if (mode === 'custom') return;

        const modePatches = {
            clean: {
                filters: {
                    removeAds: true,
                    removeSuggested: true,
                    removePYMK: true,
                    removeGroupSuggestions: true,
                    removePageSuggestions: true,
                    hideReels: true,
                    hideMarketplace: true,
                    hideStories: true,
                    hideFundraisers: true
                },
                storyFilters: {
                    hideBecameFriends: true,
                    hideJoinedGroups: true,
                    hideCommentedOnThis: true,
                    hideLikedThis: true
                },
                sidebar: {
                    enableModuleFilters: true,
                    hideRightTrending: true
                },
                social: {
                    hideSearchPopupSuggestions: true,
                    hideSearchTrending: true,
                    hideSearchRecent: true,
                    autoCommentPreview: false
                },
                predictions: {
                    enabled: false,
                    showBadge: false,
                    credibilitySignalsEnabled: false,
                    showCredibilityBadge: false,
                    showCredibilityDebugPreview: false
                },
                surfaceControls: {
                    enabled: true,
                    applyHome: true,
                    applyGroups: true,
                    applyWatch: false,
                    applyMarketplace: false,
                    applyOther: true
                }
            },
            focus: {
                filters: {
                    removeAds: true,
                    removeSuggested: true,
                    removePYMK: true,
                    removeGroupSuggestions: true,
                    removePageSuggestions: true,
                    hideReels: true,
                    hideMarketplace: true,
                    hideStories: true,
                    hideFundraisers: true
                },
                storyFilters: {
                    hideBecameFriends: true,
                    hideJoinedGroups: true,
                    hideCommentedOnThis: true,
                    hideLikedThis: true,
                    hideAttendingEvents: true,
                    hideSharedMemories: true,
                    hideProfilePhotoUpdates: true,
                    hideCoverPhotoUpdates: true,
                    hideLifeEvents: true,
                    hideCheckIns: true,
                    hideMilestones: true,
                    hideJobWorkUpdates: true,
                    hideRelationshipUpdates: true,
                    hideGroupActivityPosts: true
                },
                uiMode: {
                    friendsOnlyMode: true,
                    compactMode: true,
                    enforceChronologicalFeed: true
                },
                predictions: {
                    enabled: false,
                    showBadge: false,
                    credibilitySignalsEnabled: false,
                    showCredibilityBadge: false,
                    showCredibilityDebugPreview: false
                },
                social: {
                    autoCommentPreview: false,
                    hideSearchPopupSuggestions: true,
                    hideSearchTrending: true,
                    hideSearchRecent: true
                },
                wellbeing: {
                    infiniteScrollStopper: true,
                    scrollLimitPosts: 18,
                    sessionTimer: true,
                    sessionAwarenessEnabled: true,
                    sessionAwarenessScrollsPerMinuteThreshold: 78,
                    sessionAwarenessCooldownMinutes: 10
                },
                surfaceControls: {
                    enabled: true,
                    applyHome: true,
                    applyGroups: false,
                    applyWatch: false,
                    applyMarketplace: false,
                    applyOther: false
                }
            },
            ultrafast: {
                filters: {
                    removeAds: true,
                    removeSuggested: true,
                    removePYMK: true,
                    removeGroupSuggestions: true,
                    removePageSuggestions: true,
                    hideReels: true,
                    hideStories: true,
                    hideFundraisers: true,
                    hideVideoPosts: true,
                    hidePhotoPosts: true,
                    removeColoredBackgrounds: true
                },
                uiMode: {
                    compactMode: true,
                    showLinkPreviews: false
                },
                predictions: {
                    enabled: false,
                    showBadge: false,
                    showScoreReasons: false,
                    showTrending: false,
                    credibilitySignalsEnabled: false,
                    showCredibilityBadge: false,
                    showCredibilityDebugPreview: false
                },
                social: {
                    autoCommentPreview: false,
                    hideSearchPopupSuggestions: true,
                    hideSearchTrending: true,
                    hideSearchRecent: true
                },
                llm: {
                    tldrEnabled: false,
                    smartCommentEnabled: false,
                    clickbaitDecoder: false
                },
                surfaceControls: {
                    enabled: true,
                    applyHome: true,
                    applyGroups: false,
                    applyWatch: false,
                    applyMarketplace: false,
                    applyOther: false
                },
                topbarFilters: {
                    enabled: true,
                    hideWatch: true,
                    hideMarketplace: true
                }
            },
            smart: {
                filters: {
                    removeAds: true,
                    removeSuggested: true,
                    hideFundraisers: true
                },
                predictions: {
                    enabled: true,
                    showBadge: true,
                    showScoreReasons: true,
                    dimLowInterest: true,
                    collapseLowInterest: true,
                    highlightHighInterest: true,
                    showTrending: true,
                    credibilitySignalsEnabled: true,
                    showCredibilityBadge: true,
                    strictCredibilityPenalty: true,
                    showCredibilityDebugPreview: false,
                    neverEmptyFeedGuard: true,
                    neverEmptyFeedMinVisiblePosts: 3,
                    lowThreshold: 28,
                    highThreshold: 74
                },
                storyFilters: {
                    hideLikedThis: true,
                    hideCommentedOnThis: true,
                    hideGroupActivityPosts: true
                },
                wellbeing: {
                    clickbaitBlocker: true,
                    ragebaitDetector: true,
                    dailyFeedReportEnabled: true
                }
            },
            classic: {
                filters: {
                    removeAds: true,
                    removeSuggested: true,
                    removePYMK: true,
                    removeGroupSuggestions: true,
                    removePageSuggestions: true,
                    hideReels: true,
                    hideMarketplace: true,
                    hideStories: true,
                    hideFundraisers: true
                },
                storyFilters: {
                    hideBecameFriends: true,
                    hideJoinedGroups: true,
                    hideCommentedOnThis: true,
                    hideLikedThis: true
                },
                uiMode: {
                    enforceChronologicalFeed: true,
                    compactMode: true
                },
                social: {
                    hideSearchPopupSuggestions: true,
                    hideSearchTrending: true,
                    hideSearchRecent: true,
                    autoCommentPreview: false
                },
                predictions: {
                    enabled: false,
                    showBadge: false,
                    credibilitySignalsEnabled: false,
                    showCredibilityBadge: false,
                    showCredibilityDebugPreview: false
                },
                topbarFilters: {
                    enabled: true,
                    hideWatch: true,
                    hideMarketplace: true
                },
                surfaceControls: {
                    enabled: true,
                    applyHome: true,
                    applyGroups: true,
                    applyWatch: false,
                    applyMarketplace: false,
                    applyOther: true
                }
            }
        };

        const patch = modePatches[mode];
        if (!patch) return;
        this._mergeModePatch(effective, patch);
    }

    _mergeModePatch(target, patch) {
        if (!target || !patch) return;

        for (const key of Object.keys(patch)) {
            const value = patch[key];
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
                    target[key] = {};
                }
                this._mergeModePatch(target[key], value);
            } else {
                target[key] = value;
            }
        }
    }

    isEnabled() {
        return this.settings.enabled !== false;
    }
}

// Bootstrap once the DOM is safely readable. 
// Standard run_at: "document_idle" ensures this but we protect it anyway.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.pfApp = new PureFusionApp();
        window.pfApp.boot();
    });
} else {
    window.pfApp = new PureFusionApp();
    window.pfApp.boot();
}
