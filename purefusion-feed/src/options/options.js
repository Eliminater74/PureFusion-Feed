/**
 * PureFusion Feed - Options Logic
 * 
 * Drives the desktop dashboard settings page.
 * Loads preferences, maps to form elements, handles saving, and exports.
 */

document.addEventListener('DOMContentLoaded', async () => {

    let currentSettings = await PF_Storage.init();

    const t = (key, fallback) => {
        if (typeof chrome === 'undefined' || !chrome.i18n) return fallback;
        return chrome.i18n.getMessage(key) || fallback;
    };

    const providerOrigins = {
        openai: ["https://api.openai.com/*"],
        gemini: ["https://generativelanguage.googleapis.com/*"]
    };

    async function hasOriginPermission(origins) {
        if (typeof chrome === 'undefined' || !chrome.permissions || !origins || origins.length === 0) return true;
        return new Promise((resolve) => {
            chrome.permissions.contains({ origins }, resolve);
        });
    }

    async function requestOriginPermission(origins) {
        if (typeof chrome === 'undefined' || !chrome.permissions || !origins || origins.length === 0) return true;
        return new Promise((resolve) => {
            chrome.permissions.request({ origins }, resolve);
        });
    }

    async function removeOriginPermission(origins) {
        if (typeof chrome === 'undefined' || !chrome.permissions || !origins || origins.length === 0) return;
        return new Promise((resolve) => {
            chrome.permissions.remove({ origins }, () => resolve());
        });
    }

    async function ensureLLMProviderPermission(provider) {
        const origins = providerOrigins[provider];
        if (!origins) return true;

        if (await hasOriginPermission(origins)) return true;
        return requestOriginPermission(origins);
    }

    async function pruneUnusedLLMProviderPermissions(activeProvider) {
        const providers = Object.keys(providerOrigins);
        for (const provider of providers) {
            if (provider === activeProvider) continue;
            const origins = providerOrigins[provider];
            if (await hasOriginPermission(origins)) {
                await removeOriginPermission(origins);
            }
        }
    }

    function mergeDeep(target, source) {
        for (const key of Object.keys(source || {})) {
            const sourceValue = source[key];
            if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
                if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
                    target[key] = {};
                }
                mergeDeep(target[key], sourceValue);
            } else {
                target[key] = sourceValue;
            }
        }
        return target;
    }

    // 0. Set Dynamic Version (Moved from inline to comply with CSP)
    const versionEl = document.getElementById('pf-sidebar-version');
    if (versionEl && typeof chrome !== 'undefined' && chrome.runtime.getManifest) {
        versionEl.textContent = 'v' + chrome.runtime.getManifest().version;
    }

    // =========================================================================
    // UI Navigation & Tabs
    // =========================================================================
    
    const navLinks = document.querySelectorAll('.pf-nav-links li');
    const tabContents = document.querySelectorAll('.pf-tab-content');
    const titleStatus = document.getElementById('currentTabTitle');
    const navList = document.querySelector('.pf-nav-links');

    function cleanedTabTitle(label = '') {
        return label.replace(/[🚫🤖🎨🔤📊💾🧘🤝]/g, '').trim();
    }

    function activateTab(link) {
        const targetId = link.getAttribute('data-tab');

        navLinks.forEach((n) => {
            const isActive = n === link;
            n.classList.toggle('active', isActive);
            n.setAttribute('aria-selected', isActive ? 'true' : 'false');
            n.tabIndex = isActive ? 0 : -1;
        });

        tabContents.forEach((tab) => {
            const isActive = tab.id === targetId;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        });

        titleStatus.textContent = cleanedTabTitle(link.textContent);
    }

    if (navList) navList.setAttribute('role', 'tablist');
    tabContents.forEach((tab) => tab.setAttribute('role', 'tabpanel'));

    navLinks.forEach((link, index) => {
        const targetId = link.getAttribute('data-tab');
        const isInitiallyActive = link.classList.contains('active');

        link.setAttribute('role', 'tab');
        link.setAttribute('aria-controls', targetId || '');
        link.setAttribute('aria-selected', isInitiallyActive ? 'true' : 'false');
        link.tabIndex = isInitiallyActive ? 0 : -1;

        link.addEventListener('click', () => {
            activateTab(link);
        });

        link.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                activateTab(link);
                return;
            }

            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                e.preventDefault();
                const next = navLinks[(index + 1) % navLinks.length];
                next.focus();
                activateTab(next);
            }

            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const prev = navLinks[(index - 1 + navLinks.length) % navLinks.length];
                prev.focus();
                activateTab(prev);
            }
        });
    });

    const initialActiveTab = Array.from(navLinks).find((link) => link.classList.contains('active')) || navLinks[0];
    if (initialActiveTab) activateTab(initialActiveTab);

    // =========================================================================
    // Map Storage Object to HTML Elements & Vice Versa
    // =========================================================================

    const uiMap = {
        // Filters
        'opt_filters_removeAds': { obj: 'filters', prop: 'removeAds', type: 'checkbox' },
        'opt_filters_removeSuggested': { obj: 'filters', prop: 'removeSuggested', type: 'checkbox' },
        'opt_filters_removePYMK': { obj: 'filters', prop: 'removePYMK', type: 'checkbox' },
        'opt_filters_removeGroupSuggestions': { obj: 'filters', prop: 'removeGroupSuggestions', type: 'checkbox' },
        'opt_filters_removePageSuggestions': { obj: 'filters', prop: 'removePageSuggestions', type: 'checkbox' },
        'opt_filters_hideReels': { obj: 'filters', prop: 'hideReels', type: 'checkbox' },
        'opt_filters_hideStories': { obj: 'filters', prop: 'hideStories', type: 'checkbox' },
        'opt_filters_hideMemories': { obj: 'filters', prop: 'hideMemories', type: 'checkbox' },
        'opt_filters_hideFundraisers': { obj: 'filters', prop: 'hideFundraisers', type: 'checkbox' },
        'opt_filters_removeColoredBackgrounds': { obj: 'filters', prop: 'removeColoredBackgrounds', type: 'checkbox' },
        
        // Predictions
        'opt_pred_enabled': { obj: 'predictions', prop: 'enabled', type: 'checkbox' },
        'opt_pred_showBadge': { obj: 'predictions', prop: 'showBadge', type: 'checkbox' },
        'opt_pred_dimLowInterest': { obj: 'predictions', prop: 'dimLowInterest', type: 'checkbox' },
        'opt_pred_highlightHighInterest': { obj: 'predictions', prop: 'highlightHighInterest', type: 'checkbox' },
        'opt_pred_showTrending': { obj: 'predictions', prop: 'showTrending', type: 'checkbox' },

        // UI Mode
        'opt_widescreen': { obj: 'uiMode', prop: 'widescreenMode', type: 'checkbox' },
        'opt_uiMode_compactMode': { obj: 'uiMode', prop: 'compactMode', type: 'checkbox' },
        'opt_uiMode_disableCommentAutofocus': { obj: 'uiMode', prop: 'disableCommentAutofocus', type: 'checkbox' },
        'opt_uiMode_enforceChronologicalFeed': { obj: 'uiMode', prop: 'enforceChronologicalFeed', type: 'checkbox' },
        'opt_uiMode_friendsOnlyMode': { obj: 'uiMode', prop: 'friendsOnlyMode', type: 'checkbox' },
        'opt_uiMode_anonymizerMode': { obj: 'uiMode', prop: 'anonymizerMode', type: 'checkbox' },
        'opt_uiMode_showLinkPreviews': { obj: 'uiMode', prop: 'showLinkPreviews', type: 'checkbox' },
        'opt_uiMode_fixTimestamps': { obj: 'uiMode', prop: 'fixTimestamps', type: 'checkbox' },
        'opt_uiMode_hideMessengerSeen': { obj: 'uiMode', prop: 'hideMessengerSeen', type: 'checkbox' },
        'opt_uiMode_notificationJewelStyle': { obj: 'uiMode', prop: 'notificationJewelStyle', type: 'select' },
        'opt_uiMode_theme': { obj: 'uiMode', prop: 'theme', type: 'select' },
        'opt_uiMode_fontSizeScale': { obj: 'uiMode', prop: 'fontSizeScale', type: 'number' },

        // Wellbeing
        'opt_wb_grayscale': { obj: 'wellbeing', prop: 'grayscaleMode', type: 'checkbox' },
        'opt_wb_scrollStop': { obj: 'wellbeing', prop: 'infiniteScrollStopper', type: 'checkbox' },
        'opt_wb_scrollLimit': { obj: 'wellbeing', prop: 'scrollLimitPosts', type: 'number' },
        'opt_wb_sessionTimer': { obj: 'wellbeing', prop: 'sessionTimer', type: 'checkbox' },
        'opt_wb_ragebait': { obj: 'wellbeing', prop: 'ragebaitDetector', type: 'checkbox' },
        'opt_wb_clickbait': { obj: 'wellbeing', prop: 'clickbaitBlocker', type: 'checkbox' },

        // Social
        'opt_social_trackUnfriends': { obj: 'social', prop: 'trackUnfriends', type: 'checkbox' },
        'opt_social_notificationDigestMode': { obj: 'social', prop: 'notificationDigestMode', type: 'checkbox' },
        'opt_social_hideMetaAI': { obj: 'social', prop: 'hideMetaAI', type: 'checkbox' },
        'opt_social_hideMessengerTyping': { obj: 'social', prop: 'hideMessengerTyping', type: 'checkbox' },
        'opt_social_messengerPrivacyBlur': { obj: 'social', prop: 'messengerPrivacyBlur', type: 'checkbox' },

        // LLM
        'opt_llm_provider': { obj: 'llm', prop: 'provider', type: 'select' },
        'opt_llm_openAIApiKey': { obj: 'llm', prop: 'openAIApiKey', type: 'text' },
        'opt_llm_geminiApiKey': { obj: 'llm', prop: 'geminiApiKey', type: 'text' },
        'opt_llm_tldr': { obj: 'llm', prop: 'tldrEnabled', type: 'checkbox' },
        'opt_llm_smartcomment': { obj: 'llm', prop: 'smartCommentEnabled', type: 'checkbox' },
        'opt_llm_clickbaitdecode': { obj: 'llm', prop: 'clickbaitDecoder', type: 'checkbox' },
    };

    const themeSelect = document.getElementById('opt_uiMode_theme');
    const fontScaleInput = document.getElementById('opt_uiMode_fontSizeScale');
    const themePreview = document.getElementById('pfThemePreview');
    const themePreviewMode = document.getElementById('pfThemePreviewMode');
    const themePreviewCard = document.getElementById('pfThemePreviewCard');

    const themeNames = {
        default: t('options_ui_theme_default', 'Facebook Default'),
        darkPro: t('options_ui_theme_darkpro', 'Dark Pro'),
        amoled: t('options_ui_theme_amoled', 'AMOLED Pitch Black'),
        classicBlue: t('options_ui_theme_classic', 'Classic Blue')
    };

    function renderThemePreview(theme, scale) {
        if (!themePreview || !themePreviewCard || !themePreviewMode) return;

        const previewTheme = themeNames[theme] ? theme : 'default';
        const previewScale = Math.max(80, Math.min(150, parseInt(scale, 10) || 100));

        themePreview.dataset.theme = previewTheme;
        themePreviewMode.textContent = themeNames[previewTheme];
        themePreviewCard.style.fontSize = `${previewScale}%`;
    }

    function loadUIFromSettings() {
        // Handle mapped standard inputs
        for (const [domId, mapping] of Object.entries(uiMap)) {
            const el = document.getElementById(domId);
            if (!el) continue;
            
            const val = currentSettings[mapping.obj][mapping.prop];
            if (mapping.type === 'checkbox') el.checked = !!val;
            else if (mapping.type === 'select') el.value = val || '';
            else if (mapping.type === 'number') el.value = Number.isFinite(val) ? val : 100;
            else if (mapping.type === 'text') el.value = val || '';
        }

        // Handle Keywords Mapping
        document.getElementById('opt_keywords_blocklist').value = currentSettings.keywords.blocklist.join(', ');
        document.getElementById('opt_keywords_autohide').value = currentSettings.keywords.autohide.join(', ');

        renderThemePreview(currentSettings.uiMode.theme, currentSettings.uiMode.fontSizeScale);
    }

    async function saveSettingsFromUI() {
        // Read mapped standard inputs
        for (const [domId, mapping] of Object.entries(uiMap)) {
            const el = document.getElementById(domId);
            if (!el) continue;

            if (mapping.type === 'checkbox') {
                currentSettings[mapping.obj][mapping.prop] = el.checked;
            } else if (mapping.type === 'select') {
                currentSettings[mapping.obj][mapping.prop] = el.value;
            } else if (mapping.type === 'number') {
                currentSettings[mapping.obj][mapping.prop] = parseInt(el.value, 10) || 100;
            } else if (mapping.type === 'text') {
                currentSettings[mapping.obj][mapping.prop] = el.value.trim();
            }
        }

        // Parse Keyword comma-separated Arrays
        const blockString = document.getElementById('opt_keywords_blocklist').value;
        const autoString = document.getElementById('opt_keywords_autohide').value;

        currentSettings.keywords.blocklist = blockString.split(',').map(s => s.trim()).filter(s => s.length > 0);
        currentSettings.keywords.autohide = autoString.split(',').map(s => s.trim()).filter(s => s.length > 0);

        let providerPermissionDenied = false;
        const providerAllowed = await ensureLLMProviderPermission(currentSettings.llm.provider);
        if (!providerAllowed) {
            currentSettings.llm.provider = 'none';
            const providerSelectEl = document.getElementById('opt_llm_provider');
            if (providerSelectEl) providerSelectEl.value = 'none';
            providerPermissionDenied = true;
        }

        await PF_Storage.updateLocalLLMKeys({
            openAIApiKey: currentSettings.llm.openAIApiKey,
            geminiApiKey: currentSettings.llm.geminiApiKey
        });

        await PF_Storage.updateSettings(currentSettings);
        await pruneUnusedLLMProviderPermissions(currentSettings.llm.provider);
        if (providerPermissionDenied) {
            showSaveToast(t('options_toast_provider_permission_denied', 'AI provider permission denied. Provider disabled.'), true);
        } else {
            showSaveToast(t('options_toast_saved', 'Settings saved successfully.'));
        }
        broadcastUpdate();
    }

    // =========================================================================
    // Actions
    // =========================================================================

    const btnSaveTop = document.getElementById('btnSaveTop');
    const btnSaveBottom = document.getElementById('btnSaveBottom');
    
    [btnSaveTop, btnSaveBottom].forEach(b => b.addEventListener('click', saveSettingsFromUI));

    function showSaveToast(message, isError = false) {
        const toast = document.getElementById('saveStatus');
        toast.textContent = message;
        toast.style.color = isError ? '#ff7676' : '#4CAF50';
        setTimeout(() => toast.textContent = '', 3000);
    }

    function broadcastUpdate() {
        if (typeof chrome === 'undefined' || !chrome.tabs) return;
        chrome.tabs.query({ url: ["*://*.facebook.com/*", "*://*.messenger.com/*"] }, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { type: "PF_SETTINGS_UPDATED" });
            });
        });
    }

    if (themeSelect) {
        themeSelect.addEventListener('change', () => {
            renderThemePreview(themeSelect.value, fontScaleInput ? fontScaleInput.value : 100);
        });
    }

    if (fontScaleInput) {
        fontScaleInput.addEventListener('input', () => {
            renderThemePreview(themeSelect ? themeSelect.value : 'default', fontScaleInput.value);
        });
    }

    // Initialize State Target
    loadUIFromSettings();

    // =========================================================================
    // Import / Export
    // =========================================================================

    document.getElementById('btnExport').addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentSettings, null, 2));
        const anchor = document.createElement('a');
        anchor.href = dataStr;
        anchor.download = "purefusion_backup.json";
        anchor.click();
    });

    const fileInput = document.getElementById('btnImportFile');
    document.getElementById('btnImport').addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                if (imported.filters && imported.uiMode) {
                    currentSettings = mergeDeep(JSON.parse(JSON.stringify(PF_DEFAULT_SETTINGS)), imported);
                    loadUIFromSettings();
                    await saveSettingsFromUI();
                    showSaveToast(t('options_toast_imported', 'Settings imported successfully.'));
                } else {
                    showSaveToast(t('options_toast_invalid_backup', 'Invalid PureFusion backup file.'), true);
                }
            } catch (err) {
                showSaveToast(t('options_toast_import_error', 'Error importing file. It might be corrupted.'), true);
            }
        };
        reader.readAsText(file);
    });

    document.getElementById('btnReset').addEventListener('click', async () => {
        if (confirm(t('options_reset_confirm', 'Are you sure? This will wipe your preferences and all local AI tracking data.'))) {
            await chrome.storage.local.clear();
            await chrome.storage.sync.clear();
            chrome.runtime.reload(); // Hard boot the extension background process
        }
    });

});
