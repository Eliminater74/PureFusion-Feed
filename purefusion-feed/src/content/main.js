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
            if (this.observer) this.observer.stop();
            return;
        }

        if (this.observer) this.observer.start();
        if (this.cleaner) this.cleaner.sweepDocument();
        if (this.feedManager) this.feedManager.applyDocumentLevelTweaks();
        if (this.uiTweaks) this.uiTweaks.applyDocumentLevelTweaks();
        if (this.commentPreview) this.commentPreview.sweepDocument();
        this._checkChronologicalEnforcement();
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
            this.inpageUI
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
        if (this.isEnabled()) return this.settings;

        const effective = JSON.parse(JSON.stringify(this.settings));

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
            notificationJewelStyle: 'classic'
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

        effective.wellbeing = {
            ...effective.wellbeing,
            grayscaleMode: false,
            infiniteScrollStopper: false,
            sessionTimer: false,
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
