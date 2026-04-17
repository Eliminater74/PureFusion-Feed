/**
 * PureFusion Feed - Popup Logic
 * 
 * Binds the extension's mini UI to storage and broadcasts update events
 * to the content scripts.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const t = (key, fallback) => {
        if (typeof chrome === 'undefined' || !chrome.i18n) return fallback;
        return chrome.i18n.getMessage(key) || fallback;
    };

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
        sponsored: document.getElementById('tgl_removeSponsored'),
        suggested: document.getElementById('tgl_removeSuggested'),
        reels: document.getElementById('tgl_hideReelsStories'),
        chronological: document.getElementById('tgl_forceChronological'),
        groups: document.getElementById('tgl_removeGroups'),
        ghost: document.getElementById('tgl_ghostMode'),
        metaAI: document.getElementById('tgl_hideMetaAI'),
        distractionFree: document.getElementById('tgl_distractionFree'),

        // Read Later
        readLaterCount: document.getElementById('pf-readlater-count'),
        readLaterViewBtn: document.getElementById('pf-readlater-view-btn'),

        // Feed Intelligence
        aiScoring: document.getElementById('tgl_aiScoring'),
        intelSection: document.getElementById('pf-feed-intel'),
        intelScoringDesc: document.getElementById('pf-intel-scoring-desc'),
        intelCounts: document.getElementById('pf-intel-counts'),
        intelBlocked: document.getElementById('pf-intel-blocked'),
        intelTrusted: document.getElementById('pf-intel-trusted'),
        intelManageBtn: document.getElementById('pf-intel-manage-btn'),

        btnOptions: document.getElementById('openOptionsBtn'),
        inputKeyword: document.getElementById('quickKeywordInput'),
        btnAddKeyword: document.getElementById('addKeywordBtn'),
        statusMsg: document.getElementById('keywordStatus'),

        // Mock stats for demo purposes until real messaging is implemented
        statAds: document.getElementById('statAds'),
        statSpam: document.getElementById('statSpam')
    };

    const quickToggles = [
        elements.ads,
        elements.sponsored,
        elements.suggested,
        elements.reels,
        elements.chronological,
        elements.groups,
        elements.ghost,
        elements.metaAI,
        elements.distractionFree,
        elements.aiScoring
    ];

    // 3. Initialize UI values from settings
    elements.ads.checked = settings.filters.removeAds;
    elements.sponsored.checked = !!settings.filters.removeSponsored;
    elements.suggested.checked = settings.filters.removeSuggested;
    elements.reels.checked = !!settings.filters.hideReels;
    elements.chronological.checked = !!settings.uiMode.enforceChronologicalFeed;
    elements.groups.checked = settings.filters.removeGroupSuggestions;
    // Ghost mode is on if both sub-settings are on
    elements.ghost.checked = (settings.uiMode.hideMessengerSeen && settings.social.hideMessengerTyping);
    elements.metaAI.checked = settings.social.hideMetaAI;
    elements.master.checked = settings.enabled !== false;
    elements.distractionFree.checked = !!(settings.uiMode?.distractionFreeMode);
    elements.aiScoring.checked = !!(settings.predictions?.enabled);

    // Feed Intelligence — AI toggle visual state + live source counts
    const updateFeedIntelUI = () => {
        const on = elements.aiScoring.checked;
        if (elements.intelScoringDesc) {
            elements.intelScoringDesc.textContent = on
                ? t('popup_ai_scoring_on', 'AI scoring active — classifying posts')
                : t('popup_ai_scoring_off', 'AI scoring off');
        }
        if (elements.intelSection) {
            elements.intelSection.classList.toggle('intel-active', on);
        }
        if (elements.intelCounts) {
            elements.intelCounts.style.opacity = on ? '1' : '0.45';
        }
    };

    const loadIntelCounts = async () => {
        const blocklist = await PF_Storage.getLocalData('pf_blocklist');
        const allowlist = await PF_Storage.getLocalData('pf_allowlist');
        const blockedCount  = Array.isArray(blocklist) ? blocklist.length : 0;
        const trustedCount  = Array.isArray(allowlist) ? allowlist.length : 0;

        if (elements.intelBlocked) {
            elements.intelBlocked.textContent = `${blockedCount} blocked`;
        }
        if (elements.intelTrusted) {
            elements.intelTrusted.textContent = `${trustedCount} trusted`;
        }
    };

    // Read Later — live saved count
    const loadReadLaterCount = async () => {
        const queue = await PF_Storage.getLocalData('pf_readlater');
        const count = Array.isArray(queue) ? queue.length : 0;
        if (elements.readLaterCount) {
            elements.readLaterCount.textContent = count === 1
                ? t('popup_readlater_one', '1 saved')
                : t('popup_readlater_many', `${count} saved`).replace('{count}', count);
        }
    };

    loadReadLaterCount();

    if (elements.readLaterViewBtn) {
        elements.readLaterViewBtn.addEventListener('click', () => {
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                window.open(chrome.runtime.getURL('src/options/options.html'));
            }
        });
    }

    updateFeedIntelUI();
    loadIntelCounts();

    elements.aiScoring.addEventListener('change', async () => {
        if (!settings.predictions) settings.predictions = {};
        settings.predictions.enabled = elements.aiScoring.checked;
        updateFeedIntelUI();
        await PF_Storage.updateSettings(settings);
        broadcastUpdate();
    });

    if (elements.intelManageBtn) {
        elements.intelManageBtn.addEventListener('click', () => {
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                window.open(chrome.runtime.getURL('src/options/options.html'));
            }
        });
    }

    // Ad blocker section visual state — active/inactive banner color + status text
    const updateAdBlockerUI = () => {
        const section = document.querySelector('.pf-ad-blocker-section');
        const statusEl = document.getElementById('adBlockerStatus');
        const active = elements.ads.checked;
        if (section) section.classList.toggle('ads-active', active);
        if (statusEl) statusEl.textContent = active
            ? t('popup_ad_blocker_on', '✓ Blocking ads via infrastructure signals')
            : t('popup_ad_blocker_off', '⚠ Ad blocker is off — click to enable');
    };

    updateAdBlockerUI();
    elements.ads.addEventListener('change', updateAdBlockerUI);

    const setQuickTogglesEnabled = () => {
        const enabled = elements.master.checked;
        quickToggles.filter(Boolean).forEach((toggle) => {
            toggle.disabled = !enabled;
        });
        const quickSettings = document.querySelector('.pf-quick-settings');
        if (quickSettings) quickSettings.classList.toggle('is-disabled', !enabled);
    };

    setQuickTogglesEnabled();

    // Load actual live stats (We fetch this from local storage if the worker saved it)
    const sessionStats = await PF_Storage.getLocalData('pf_session_stats') || { ads: 0, spam: 0 };
    elements.statAds.textContent = sessionStats.ads;
    elements.statSpam.textContent = sessionStats.spam;

    // 4. Bind Toggle Events
    const handleToggle = async () => {
        settings.enabled = elements.master.checked;

        // Build updated settings object
        settings.filters.removeAds = elements.ads.checked;
        settings.filters.removeSponsored = elements.sponsored.checked;
        settings.filters.removeSuggested = elements.suggested.checked;
        
        settings.filters.hideReels = elements.reels.checked;
        // hideStories has its own default (false) — do not couple it to the reels toggle
        
        settings.uiMode.forceMostRecent = elements.chronological.checked;
        settings.uiMode.enforceChronologicalFeed = elements.chronological.checked;
        settings.filters.removeGroupSuggestions = elements.groups.checked;
        
        // Ghost mode affects both Messenger Seen and Typing
        settings.uiMode.hideMessengerSeen = elements.ghost.checked;
        settings.social.hideMessengerTyping = elements.ghost.checked;
        
        settings.social.hideMetaAI = elements.metaAI.checked;
        settings.uiMode.distractionFreeMode = elements.distractionFree.checked;

        // Save
        await PF_Storage.updateSettings(settings);
        broadcastUpdate();
    };

    elements.master.addEventListener('change', async () => {
        setQuickTogglesEnabled();
        await handleToggle();
    });

    elements.ads.addEventListener('change', handleToggle);
    elements.suggested.addEventListener('change', handleToggle);
    elements.reels.addEventListener('change', handleToggle);
    elements.chronological.addEventListener('change', handleToggle);
    elements.groups.addEventListener('change', handleToggle);
    elements.ghost.addEventListener('change', handleToggle);
    elements.metaAI.addEventListener('change', handleToggle);
    elements.distractionFree.addEventListener('change', handleToggle);

    // 5. Keyword Quick Add
    elements.btnAddKeyword.addEventListener('click', async () => {
        const val = elements.inputKeyword.value.trim();
        if (val) {
            // Push to blocklist
            if (!settings.keywords.blocklist.includes(val)) {
                settings.keywords.blocklist.push(val);
                await PF_Storage.updateSettings(settings);
                
                elements.inputKeyword.value = '';
                elements.statusMsg.textContent = t('popup_keyword_added', `Added "${val}" to blocklist.`).replace('{keyword}', val);
                setTimeout(() => { elements.statusMsg.textContent = ''; }, 2500);
                
                broadcastUpdate();
            } else {
                elements.statusMsg.textContent = t('popup_keyword_exists', 'Keyword already exists.');
                elements.statusMsg.style.color = "#ffaa00";
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
            if (
                tabs[0]
                && typeof tabs[0].url === 'string'
                && (tabs[0].url.includes("facebook.com") || tabs[0].url.includes("messenger.com"))
            ) {
                chrome.tabs.sendMessage(tabs[0].id, { type: "PF_SETTINGS_UPDATED" });
            }
        });
    }
});
