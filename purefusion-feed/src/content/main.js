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

            // Initialize Modules
            this.cleaner = new window.PF_Cleaner(this.settings);
            this.uiTweaks = new window.PF_UiTweaks(this.settings);
            this.feedManager = new window.PF_FeedManager(this.settings);
            this.predictor = new window.PF_Predictor(this.settings);
            this.socialTools = new window.PF_SocialTools(this.settings);
            this.notifControls = new window.PF_NotificationControls(this.settings);
            this.wellbeing = new window.PF_Wellbeing(this.settings);
            this.llmFeatures = new window.PF_LLMFeatures(this.settings);
            this.inpageUI = new window.PF_InPageUI(this.settings);
            this.observer = new window.PF_Observer();

            // Set up our centralized event bus listeners
            this.setupEventListeners();

            // Initial manual sweep to clean anything already rendered
            this.cleaner.sweepDocument();
            
            // Apply root-level structural changes
            this.feedManager.applyDocumentLevelTweaks();
            this.uiTweaks.applyDocumentLevelTweaks();

            // Start MutationObserver for dynamically injected feed elements
            this.observer.start();

            PF_Logger.info("PureFusion Main initialized.", this.settings);

            this._checkChronologicalEnforcement();

            PF_Logger.info("PureFusion is active and monitoring.");

        } catch (error) {
            PF_Logger.error("Failed to initialize PureFusion app: ", error);
        }
    }

    _checkChronologicalEnforcement() {
        if (!this.settings.uiMode.enforceChronologicalFeed) return;

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
            
            // Pass to LLM features
            if (this.llmFeatures) this.llmFeatures.applyToNodes(addedNodes);
            
            // Pass to notification rules engine to filter drop-down menus
            if (this.notifControls) this.notifControls.applyToNodes(addedNodes);
        });

        // Listen for message passing from Popup/Options panel to hot-reload settings
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                if (request.type === 'PF_SETTINGS_UPDATED') {
                    PF_Logger.log("Settings update detected. Re-syncing and triggering visual sweep.");
                    this.updateSettingsAndResweep();
                    sendResponse({ status: "success" });
                }
            });
        
        // Listen to window postMessage for updates originating from the embedded UI
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'PF_LOCAL_SETTINGS_UDPATE') {
                PF_Logger.log("In-Page Settings update detected. Resweeping.");
                this.updateSettingsAndResweep();
            }
        });
        }
    }

    async updateSettingsAndResweep() {
        this.settings = await PF_Storage.getSettings();
        if (this.cleaner) {
            this.cleaner.settings = this.settings;
            this.cleaner.sweepDocument();
        }
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
