/**
 * PureFusion Feed - Storage Utility
 * 
 * Abstraction layer over Chrome's extension storage API.
 * Uses chrome.storage.sync for user configuration and 
 * chrome.storage.local for heavy/device-bound data like predictions.
 */

const PF_Storage = {
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
        await this.updateSettings(merged);
        return merged;
    },

    /**
     * Retrieves all user settings from sync storage.
     * @returns {Promise<Object>}
     */
    async getSettings() {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.sync.get('pf_settings', (result) => {
                    const synced = result.pf_settings || {};

                    chrome.storage.local.get('pf_llm_keys', (localResult) => {
                        const localKeys = localResult.pf_llm_keys || {};
                        if (!synced.llm) synced.llm = {};
                        synced.llm.openAIApiKey = localKeys.openAIApiKey || '';
                        synced.llm.geminiApiKey = localKeys.geminiApiKey || '';
                        resolve(synced);
                    });
                });
            } else {
                resolve({}); // Fallback for testing environments
            }
        });
    },

    /**
     * Saves settings to sync storage.
     * @param {Object} settingsData 
     * @returns {Promise<void>}
     */
    async updateSettings(settingsData) {
        const safeSettings = this._sanitizeSettings(settingsData);

        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.sync.set({ pf_settings: safeSettings }, () => {
                    resolve();
                });
            } else {
                resolve();
            }
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
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.set({ [key]: value }, resolve);
            } else resolve();
        });
    },

    /**
     * Local storage retrieval
     * @param {string} key 
     */
    async getLocalData(key) {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get(key, (result) => resolve(result[key]));
            } else resolve(null);
        });
    },

    // --- Private utils ---
    
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
