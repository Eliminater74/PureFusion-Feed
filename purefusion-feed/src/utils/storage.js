/**
 * PureFusion Feed - Storage Utility
 * 
 * Abstraction layer over Chrome's extension storage API.
 * Uses chrome.storage.sync for user configuration and 
 * chrome.storage.local for heavy/device-bound data like predictions.
 */

const PF_Storage = {
    /**
     * Returns false when the extension context has been invalidated (e.g. after a
     * reload/update while the tab was still open). Chrome APIs throw a synchronous
     * "Extension context invalidated" error in this state, so every entry point
     * should bail out gracefully when this returns false.
     */
    _isContextValid() {
        try {
            return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
        } catch (_) {
            return false;
        }
    },

    /**
     * Initializes storage with default settings if none exist.
     * @returns {Promise<Object>} The current valid configuration
     */
    async init() {
        const current = await this.getSettings();
        if (!current || Object.keys(current).length === 0) {
            PF_Logger.info("No existing settings found, initializing defaults.");
            await this.updateSettings(PF_DEFAULT_SETTINGS);
            return PF_DEFAULT_SETTINGS;
        }

        // Merge defaults in case new settings were added in an update
        const merged = { ...PF_DEFAULT_SETTINGS };
        this._deepMerge(merged, current);

        // Schema migrations — run after merge so we can inspect saved values.
        this._runSchemaMigrations(merged);

        await this.updateSettings(merged);
        return merged;
    },

    /**
     * Retrieves all user settings from sync storage.
     * @returns {Promise<Object>}
     */
    async getSettings() {
        if (!this._isContextValid()) return {};
        return new Promise((resolve) => {
            try {
                chrome.storage.sync.get('pf_settings', (result) => {
                    if (chrome.runtime.lastError) { resolve({}); return; }
                    const synced = result.pf_settings || {};
                    try {
                        chrome.storage.local.get('pf_llm_keys', (localResult) => {
                            if (chrome.runtime.lastError) { resolve(synced); return; }
                            const localKeys = localResult.pf_llm_keys || {};
                            if (!synced.llm) synced.llm = {};
                            synced.llm.openAIApiKey = localKeys.openAIApiKey || '';
                            synced.llm.geminiApiKey = localKeys.geminiApiKey || '';
                            resolve(synced);
                        });
                    } catch (_) { resolve(synced); }
                });
            } catch (_) { resolve({}); }
        });
    },

    /**
     * Saves settings to sync storage.
     * @param {Object} settingsData
     * @returns {Promise<void>}
     */
    async updateSettings(settingsData) {
        if (!this._isContextValid()) return;
        const safeSettings = this._sanitizeSettings(settingsData);
        return new Promise((resolve) => {
            try {
                chrome.storage.sync.set({ pf_settings: safeSettings }, () => {
                    if (chrome.runtime.lastError) { /* swallow */ }
                    resolve();
                });
            } catch (_) { resolve(); }
        });
    },

    async updateLocalLLMKeys(keys = {}) {
        const safeKeys = {
            openAIApiKey: (keys.openAIApiKey || '').trim(),
            geminiApiKey: (keys.geminiApiKey || '').trim()
        };
        return this.setLocalData('pf_llm_keys', safeKeys);
    },

    async getLocalLLMKeys() {
        const keys = await this.getLocalData('pf_llm_keys');
        return {
            openAIApiKey: keys?.openAIApiKey || '',
            geminiApiKey: keys?.geminiApiKey || ''
        };
    },

    /**
     * Local storage: Great for bulk data like AI prediction states, caches
     * @param {string} key
     * @param {any} value
     */
    async setLocalData(key, value) {
        if (!this._isContextValid()) return;
        return new Promise((resolve) => {
            try {
                chrome.storage.local.set({ [key]: value }, () => {
                    if (chrome.runtime.lastError) { /* swallow */ }
                    resolve();
                });
            } catch (_) { resolve(); }
        });
    },

    /**
     * Local storage retrieval
     * @param {string} key
     */
    async getLocalData(key) {
        if (!this._isContextValid()) return null;
        return new Promise((resolve) => {
            try {
                chrome.storage.local.get(key, (result) => {
                    if (chrome.runtime.lastError) { resolve(null); return; }
                    resolve(result[key]);
                });
            } catch (_) { resolve(null); }
        });
    },

    // --- Private utils ---

    /**
     * Applies one-time schema migrations to settings loaded from storage.
     * Uses a _pfSchemaVersion stamp to ensure each migration only runs once.
     * Safe rule: only touch a key if it still holds the OLD default value
     * (meaning the user never visited that option and changed it themselves).
     */
    _runSchemaMigrations(settings) {
        const v = settings._pfSchemaVersion || 0;

        if (v < 1) {
            // v1 migration: commentPreviewAllowGroups and commentPreviewAllowOther
            // were changed from false → true in the v2 defaults. If a user's saved
            // settings still have false here it means they accepted the old default —
            // not that they explicitly opted out. Upgrade them to the new default.
            if (settings.social) {
                if (settings.social.commentPreviewAllowGroups === false) {
                    settings.social.commentPreviewAllowGroups = true;
                }
                if (settings.social.commentPreviewAllowOther === false) {
                    settings.social.commentPreviewAllowOther = true;
                }
            }
        }

        settings._pfSchemaVersion = 1;
    },

    _deepMerge(target, source) {
        for (const key of Object.keys(source)) {
            const sourceValue = source[key];

            if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
                const targetValue = target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
                    ? target[key]
                    : {};
                target[key] = this._deepMerge(targetValue, sourceValue);
            } else {
                target[key] = sourceValue;
            }
        }
        return target;
    },

    _sanitizeSettings(settingsData) {
        const cloned = JSON.parse(JSON.stringify(settingsData || {}));
        if (cloned.llm) {
            cloned.llm.openAIApiKey = '';
            cloned.llm.geminiApiKey = '';
        }
        return cloned;
    }
};

window.PF_Storage = PF_Storage;
