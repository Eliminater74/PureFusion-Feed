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
                this.diagnostics.applyDocumentLevelTweaks();
                this.commentPreview.sweepDocument();

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
        const isBareNewsfeed = (window.location.pathname === '/' || window.location.pathname === '/home.php') 
                            && !window.location.search.includes('sk=h_chr');
                            
        if (isBareNewsfeed) {
            PF_Logger.info("PureFusion: Chronological enforcement active. Redirecting feed...");
            window.location.replace('/?filter=all&sk=h_chr');
        }
    }

    setupEventListeners() {
        // Listen to batched DOM injections from our custom observer
        document.addEventListener('pf:nodes_added', (e) => {
            if (!this.isEnabled()) return;

            const addedNodes = e.detail.nodes;

            // Phase 10: Digital Wellbeing Infinite Scroll Break
            let blockProcessing = false;
            if (this.wellbeing) blockProcessing = this.wellbeing.applyScrollStopper(addedNodes);
            if (blockProcessing) return; // Drop processing payload

            // Pass to cleaner and UI components
            if (this.cleaner) this.cleaner.sweepNodes(addedNodes);
            if (this.uiTweaks) this.uiTweaks.applyToNodes(addedNodes);
            
            // Pass to AI Engine for learning and scoring
            if (this.predictor) this.predictor.applyToNodes(addedNodes);

            // Progressive inline comment previews
            if (this.commentPreview) this.commentPreview.applyToNodes(addedNodes);
            
            // Pass to LLM features
            if (this.llmFeatures) this.llmFeatures.applyToNodes(addedNodes);

            // Messenger smart tooling on FB chat popups
            if (this.messengerAI) this.messengerAI.applyToNodes(addedNodes);
            
            // Pass to notification rules engine to filter drop-down menus
            if (this.notifControls) this.notifControls.applyToNodes(addedNodes);
            if (this.diagnostics) this.diagnostics.applyToNodes(addedNodes);
        });

        // 1. Listen for background script updates (Popup/Options)
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
            try {
                chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                    if (request.type === 'PF_SETTINGS_UPDATED') {
                        PF_Logger.log("Settings update detected. Re-syncing.");
                        this.updateSettingsAndResweep();
                        if (sendResponse) sendResponse({ status: "success" });
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
    }

    async updateSettingsAndResweep() {
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
        this._scheduleFollowupResweeps();
        this._checkChronologicalEnforcement();
    }

    _runLiveResweepPass(phase = 'manual-pass') {
        if (this.cleaner) this.cleaner.sweepDocument();
        if (this.feedManager) this.feedManager.applyDocumentLevelTweaks();
        if (this.uiTweaks) this.uiTweaks.applyDocumentLevelTweaks();
        if (this.diagnostics) this.diagnostics.applyDocumentLevelTweaks();
        if (this.commentPreview) this.commentPreview.sweepDocument();

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

        const allowedModes = new Set(['custom', 'clean', 'focus', 'smart', 'classic']);
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
                sidebar: {
                    enableModuleFilters: true,
                    hideRightTrending: true
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
                    hideStories: true
                },
                uiMode: {
                    friendsOnlyMode: true,
                    compactMode: true,
                    enforceChronologicalFeed: true
                },
                predictions: {
                    enabled: false
                }
            },
            smart: {
                filters: {
                    removeAds: true,
                    hideFundraisers: true
                },
                predictions: {
                    enabled: true,
                    showBadge: true,
                    dimLowInterest: true,
                    highlightHighInterest: true,
                    showTrending: true
                },
                storyFilters: {
                    hideLikedThis: true,
                    hideCommentedOnThis: true
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
                uiMode: {
                    enforceChronologicalFeed: true,
                    compactMode: true
                },
                social: {
                    hideSearchPopupSuggestions: true
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
