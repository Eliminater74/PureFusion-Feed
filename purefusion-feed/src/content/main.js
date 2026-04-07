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

            PF_Logger.info("PureFusion is active and monitoring.");

        } catch (error) {
            PF_Logger.error("Failed to initialize PureFusion app: ", error);
        }
    }

    setupEventListeners() {
        // Listen to batched DOM injections from our custom observer
        document.addEventListener('pf:nodes_added', (e) => {
            const addedNodes = e.detail.nodes;
            
            // Pass to cleaner and UI components
            if (this.cleaner) this.cleaner.sweepNodes(addedNodes);
            if (this.uiTweaks) this.uiTweaks.applyToNodes(addedNodes);

            // TODO: In Phase 5 (Predictor), that instance will also connect here.
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
