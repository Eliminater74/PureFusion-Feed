/**
 * PureFusion Feed - Messenger Runtime
 *
 * Lightweight entrypoint for messenger.com pages so Ghost Mode and
 * privacy controls run without loading the full Facebook feed pipeline.
 */

class PureFusionMessengerApp {
    constructor() {
        this.settings = {};
        this.uiTweaks = null;
        this.messengerAI = null;
    }

    async boot() {
        try {
            this.settings = await PF_Storage.init();
            this.uiTweaks = new window.PF_UiTweaks(this.getEffectiveSettings());
            this.messengerAI = new window.PF_MessengerAI(this.getEffectiveSettings());
            this.setupEventListeners();
        } catch (error) {
            PF_Logger.error("Failed to initialize PureFusion Messenger app:", error);
        }
    }

    setupEventListeners() {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                if (request.type === 'PF_SETTINGS_UPDATED') {
                    this.updateSettings();
                    if (sendResponse) sendResponse({ status: "success" });
                }
            });
        }

        window.addEventListener('message', (event) => {
            const isUpdateMessage = event.data
                && (event.data.type === 'PF_LOCAL_SETTINGS_UPDATE' || event.data.type === 'PF_LOCAL_SETTINGS_UDPATE');

            if (isUpdateMessage) {
                this.updateSettings();
            }
        });
    }

    async updateSettings() {
        this.settings = await PF_Storage.getSettings();
        if (this.uiTweaks) {
            this.uiTweaks.settings = this.getEffectiveSettings();
            this.uiTweaks.applyDocumentLevelTweaks();
        }

        if (this.messengerAI) {
            this.messengerAI.updateSettings(this.getEffectiveSettings());
        }
    }

    isEnabled() {
        return this.settings.enabled !== false;
    }

    getEffectiveSettings() {
        const effective = JSON.parse(JSON.stringify(this.settings || {}));

        if (!this.isEnabled()) {
            effective.uiMode = {
                ...effective.uiMode,
                hideMessengerSeen: false,
                notificationJewelStyle: 'classic'
            };

            effective.social = {
                ...effective.social,
                hideMessengerTyping: false,
                messengerPrivacyBlur: false
            };

            effective.llm = {
                ...effective.llm,
                messengerRewriteEnabled: false,
                messengerSmartRepliesEnabled: false
            };
        }

        return effective;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.pfMessengerApp = new PureFusionMessengerApp();
        window.pfMessengerApp.boot();
    });
} else {
    window.pfMessengerApp = new PureFusionMessengerApp();
    window.pfMessengerApp.boot();
}
