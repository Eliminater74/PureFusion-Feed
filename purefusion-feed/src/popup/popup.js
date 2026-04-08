/**
 * PureFusion Feed - Popup Logic
 * 
 * Binds the extension's mini UI to storage and broadcasts update events
 * to the content scripts.
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 0. Set Dynamic Version
    const versionEl = document.getElementById('pf-version');
    if (versionEl && typeof chrome !== 'undefined' && chrome.runtime.getManifest) {
        const manifest = chrome.runtime.getManifest();
        versionEl.textContent = 'v' + manifest.version;
    }

    // 1. Load Settings
    let settings = await PF_Storage.init();

    // 2. Map Elements
    const elements = {
        master: document.getElementById('masterToggle'),
        ads: document.getElementById('tgl_removeAds'),
        suggested: document.getElementById('tgl_removeSuggested'),
        reels: document.getElementById('tgl_hideReelsStories'),
        chronological: document.getElementById('tgl_forceChronological'),
        groups: document.getElementById('tgl_removeGroups'),
        
        btnOptions: document.getElementById('openOptionsBtn'),
        inputKeyword: document.getElementById('quickKeywordInput'),
        btnAddKeyword: document.getElementById('addKeywordBtn'),
        statusMsg: document.getElementById('keywordStatus'),
        
        // Mock stats for demo purposes until real messaging is implemented
        statAds: document.getElementById('statAds'),
        statSpam: document.getElementById('statSpam')
    };

    // 3. Initialize UI values from settings
    elements.ads.checked = settings.filters.removeAds;
    elements.suggested.checked = settings.filters.removeSuggested;
    elements.reels.checked = (settings.filters.hideReels && settings.filters.hideStories);
    elements.chronological.checked = settings.uiMode.forceMostRecent;
    elements.groups.checked = settings.filters.removeGroupSuggestions;

    // Load actual live stats (We fetch this from local storage if the worker saved it)
    const sessionStats = await PF_Storage.getLocalData('pf_session_stats') || { ads: 0, spam: 0 };
    elements.statAds.textContent = sessionStats.ads;
    elements.statSpam.textContent = sessionStats.spam;

    // 4. Bind Toggle Events
    const handleToggle = async () => {
        // Build updated settings object
        settings.filters.removeAds = elements.ads.checked;
        settings.filters.removeSuggested = elements.suggested.checked;
        
        // Combine reels/stories together in the quick UI
        settings.filters.hideReels = elements.reels.checked;
        settings.filters.hideStories = elements.reels.checked;
        
        settings.uiMode.forceMostRecent = elements.chronological.checked;
        settings.filters.removeGroupSuggestions = elements.groups.checked;

        // Save
        await PF_Storage.updateSettings(settings);
        broadcastUpdate();
    };

    elements.ads.addEventListener('change', handleToggle);
    elements.suggested.addEventListener('change', handleToggle);
    elements.reels.addEventListener('change', handleToggle);
    elements.chronological.addEventListener('change', handleToggle);
    elements.groups.addEventListener('change', handleToggle);

    // 5. Keyword Quick Add
    elements.btnAddKeyword.addEventListener('click', async () => {
        const val = elements.inputKeyword.value.trim();
        if (val) {
            // Push to blocklist
            if (!settings.keywords.blocklist.includes(val)) {
                settings.keywords.blocklist.push(val);
                await PF_Storage.updateSettings(settings);
                
                elements.inputKeyword.value = '';
                elements.statusMsg.textContent = `Added "${val}" to Blocklist!`;
                setTimeout(() => { elements.statusMsg.textContent = ''; }, 2500);
                
                broadcastUpdate();
            } else {
                elements.statusMsg.textContent = "Keyword already exists.";
                elements.statusMsg.style.color = "#orange";
                setTimeout(() => { 
                    elements.statusMsg.textContent = ''; 
                    elements.statusMsg.style.color = "#4CAF50";
                }, 2500);
            }
        }
    });

    elements.inputKeyword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') elements.btnAddKeyword.click();
    });

    // 6. Open Options Page
    elements.btnOptions.addEventListener('click', () => {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL('src/options/options.html'));
        }
    });

    // --- Helper to alert the current active Facebook tab ---
    function broadcastUpdate() {
        if (typeof chrome === 'undefined' || !chrome.tabs) return;
        
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url.includes("facebook.com")) {
                chrome.tabs.sendMessage(tabs[0].id, { type: "PF_SETTINGS_UPDATED" });
            }
        });
    }
});
