/**
 * PureFusion Feed - Options Logic
 * 
 * Drives the desktop dashboard settings page.
 * Loads preferences, maps to form elements, handles saving, and exports.
 */

document.addEventListener('DOMContentLoaded', async () => {

    let currentSettings = await PF_Storage.init();

    // =========================================================================
    // UI Navigation & Tabs
    // =========================================================================
    
    const navLinks = document.querySelectorAll('.pf-nav-links li');
    const tabContents = document.querySelectorAll('.pf-tab-content');
    const titleStatus = document.getElementById('currentTabTitle');

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            // Remove active from all
            navLinks.forEach(n => n.classList.remove('active'));
            tabContents.forEach(t => t.classList.remove('active'));
            
            // Add active to targeted
            link.classList.add('active');
            const targetId = link.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');
            
            // Update Title
            titleStatus.textContent = link.textContent.replace(/[🚫🤖🎨🔤📊💾🧘]/g, '').trim();
        });
    });

    // =========================================================================
    // Map Storage Object to HTML Elements & Vice Versa
    // =========================================================================

    const uiMap = {
        // Filters
        'opt_filters_removeAds': { obj: 'filters', prop: 'removeAds', type: 'checkbox' },
        'opt_filters_removeSuggested': { obj: 'filters', prop: 'removeSuggested', type: 'checkbox' },
        'opt_filters_removePYMK': { obj: 'filters', prop: 'removePYMK', type: 'checkbox' },
        'opt_filters_removePageSuggestions': { obj: 'filters', prop: 'removePageSuggestions', type: 'checkbox' },
        'opt_filters_hideReels': { obj: 'filters', prop: 'hideReels', type: 'checkbox' },
        'opt_filters_hideStories': { obj: 'filters', prop: 'hideStories', type: 'checkbox' },
        'opt_filters_removeColoredBackgrounds': { obj: 'filters', prop: 'removeColoredBackgrounds', type: 'checkbox' },
        
        // Predictions
        'opt_pred_enabled': { obj: 'predictions', prop: 'enabled', type: 'checkbox' },
        'opt_pred_showBadge': { obj: 'predictions', prop: 'showBadge', type: 'checkbox' },
        'opt_pred_dimLowInterest': { obj: 'predictions', prop: 'dimLowInterest', type: 'checkbox' },
        'opt_pred_highlightHighInterest': { obj: 'predictions', prop: 'highlightHighInterest', type: 'checkbox' },
        'opt_pred_showTrending': { obj: 'predictions', prop: 'showTrending', type: 'checkbox' },

        // UI Mode
        'opt_uiMode_forceMostRecent': { obj: 'uiMode', prop: 'forceMostRecent', type: 'checkbox' },
        'opt_uiMode_compactMode': { obj: 'uiMode', prop: 'compactMode', type: 'checkbox' },
        'opt_uiMode_disableCommentAutofocus': { obj: 'uiMode', prop: 'disableCommentAutofocus', type: 'checkbox' },
        'opt_uiMode_showLinkPreviews': { obj: 'uiMode', prop: 'showLinkPreviews', type: 'checkbox' },
        'opt_uiMode_fixTimestamps': { obj: 'uiMode', prop: 'fixTimestamps', type: 'checkbox' },
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

        // LLM
        'opt_llm_provider': { obj: 'llm', prop: 'provider', type: 'select' },
        'opt_llm_openAIApiKey': { obj: 'llm', prop: 'openAIApiKey', type: 'text' },
        'opt_llm_geminiApiKey': { obj: 'llm', prop: 'geminiApiKey', type: 'text' },
        'opt_llm_tldr': { obj: 'llm', prop: 'tldrEnabled', type: 'checkbox' },
        'opt_llm_smartcomment': { obj: 'llm', prop: 'smartCommentEnabled', type: 'checkbox' },
        'opt_llm_clickbaitdecode': { obj: 'llm', prop: 'clickbaitDecoder', type: 'checkbox' },
    };

    function loadUIFromSettings() {
        // Handle mapped standard inputs
        for (const [domId, mapping] of Object.entries(uiMap)) {
            const el = document.getElementById(domId);
            if (!el) continue;
            
            const val = currentSettings[mapping.obj][mapping.prop];
            if (mapping.type === 'checkbox') el.checked = val;
            else if (mapping.type === 'select') el.value = val;
            else if (mapping.type === 'number') el.value = val;
            else if (mapping.type === 'text') el.value = val;
        }

        // Handle Keywords Mapping
        document.getElementById('opt_keywords_blocklist').value = currentSettings.keywords.blocklist.join(', ');
        document.getElementById('opt_keywords_autohide').value = currentSettings.keywords.autohide.join(', ');
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

        await PF_Storage.updateSettings(currentSettings);
        showSaveToast();
        broadcastUpdate();
    }

    // =========================================================================
    // Actions
    // =========================================================================

    const btnSaveTop = document.getElementById('btnSaveTop');
    const btnSaveBottom = document.getElementById('btnSaveBottom');
    
    [btnSaveTop, btnSaveBottom].forEach(b => b.addEventListener('click', saveSettingsFromUI));

    function showSaveToast() {
        const toast = document.getElementById('saveStatus');
        toast.textContent = 'Settings Saved successfully!';
        setTimeout(() => toast.textContent = '', 3000);
    }

    function broadcastUpdate() {
        if (typeof chrome === 'undefined' || !chrome.tabs) return;
        chrome.tabs.query({url: "*://*.facebook.com/*"}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { type: "PF_SETTINGS_UPDATED" });
            });
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
                    currentSettings = imported;
                    loadUIFromSettings();
                    await saveSettingsFromUI();
                    alert("Settings imported successfully!");
                } else {
                    alert("Invalid PureFusion backup file.");
                }
            } catch (err) {
                alert("Error importing file. It might be corrupted.");
            }
        };
        reader.readAsText(file);
    });

    document.getElementById('btnReset').addEventListener('click', async () => {
        if(confirm("Are you sure? This will wipe your preferences and all local AI Tracking data.")) {
            await chrome.storage.local.clear();
            await chrome.storage.sync.clear();
            alert("Factory Reset Complete. Reloading extension.");
            chrome.runtime.reload(); // Hard boot the extension background process
        }
    });

});
