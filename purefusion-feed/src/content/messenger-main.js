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
        this.quickContextCaptureBound = false;
    }

    async boot() {
        try {
            this.settings = await PF_Storage.init();
            this.uiTweaks = new window.PF_UiTweaks(this.getEffectiveSettings());
            this.messengerAI = new window.PF_MessengerAI(this.getEffectiveSettings());
            this.setupEventListeners();
            this._startLifecycleGuard();
        } catch (error) {
            PF_Logger.error("Failed to initialize PureFusion Messenger app:", error);
        }
    }

    _startLifecycleGuard() {
        if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;

        try {
            const port = chrome.runtime.connect({ name: 'pf-messenger-lifecycle' });
            port.onDisconnect.addListener(() => {
                this._destroy();
            });
        } catch (err) {
            // Context already gone
        }
    }

    _destroy() {
        if (this.messengerAI && typeof this.messengerAI.destroy === 'function') {
            try { this.messengerAI.destroy(); } catch (err) { /* swallow */ }
        }
    }

    setupEventListeners() {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                if (request.type === 'PF_SETTINGS_UPDATED') {
                    this.updateSettings();
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
            });
        }

        window.addEventListener('message', (event) => {
            const isUpdateMessage = event.data
                && (event.data.type === 'PF_LOCAL_SETTINGS_UPDATE' || event.data.type === 'PF_LOCAL_SETTINGS_UDPATE');

            if (isUpdateMessage) {
                this.updateSettings();
            }
        });

        this.setupQuickActionContextCapture();
    }

    setupQuickActionContextCapture() {
        if (this.quickContextCaptureBound) return;
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;

        this.quickContextCaptureBound = true;

        document.addEventListener('contextmenu', (event) => {
            const payload = this.captureQuickContextPayload(event?.target);
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

    captureQuickContextPayload(target) {
        const element = target && target.nodeType === Node.TEXT_NODE ? target.parentElement : target;
        if (!element || !element.closest) return null;

        const linkNode = element.closest('a[href], [role="link"][href], [role="link"]');
        if (!linkNode) return null;

        const candidates = [
            linkNode.textContent,
            linkNode.getAttribute ? linkNode.getAttribute('aria-label') : '',
            linkNode.getAttribute ? linkNode.getAttribute('title') : ''
        ];

        const sourceName = candidates
            .map((value) => this.normalizeQuickContextText(value))
            .find((value) => this.looksLikeQuickContextSource(value));

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

    normalizeQuickContextText(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    looksLikeQuickContextSource(value) {
        const text = this.normalizeQuickContextText(value);
        if (!text || text.length < 2 || text.length > 90) return false;

        const normalized = text.toLowerCase();
        if (/^(like|reply|share|follow|comment|send|more|save|hide|report|menu)$/.test(normalized)) return false;
        if (normalized.includes('http://') || normalized.includes('https://')) return false;
        if (/^\d+$/.test(normalized)) return false;

        return true;
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
