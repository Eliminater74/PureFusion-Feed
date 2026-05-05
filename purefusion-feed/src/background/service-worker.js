/**
 * PureFusion Feed - Service Worker
 * 
 * Handles background tasks, extension installation events, and 
 * declarativeNetRequest logic for blocking hard ad-networks and tracking pixels.
 */

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        console.log('PureFusion Feed Initialized');
        // Open welcome page on first install
        chrome.tabs.create({
            url: chrome.runtime.getURL('src/welcome/welcome.html')
        });
        await setupDNRRules();
        await setupQuickActionMenus();
    } else if (details.reason === 'update') {
        console.log('PureFusion Feed Updated');
        const newVersion = chrome.runtime.getManifest().version;
        chrome.storage.local.set({ pf_pending_update_notice: newVersion }).catch(() => {});
        await setupDNRRules();
        await setupQuickActionMenus();
    }
});

chrome.runtime.onStartup.addListener(() => {
    setupDNRRules();
    setupQuickActionMenus();
});

const QUICK_MENU_IDS = {
    root: 'pf_quick_root',
    blockKeyword: 'pf_quick_block_keyword',
    autohideKeyword: 'pf_quick_autohide_keyword',
    allowKeyword: 'pf_quick_allow_keyword',
    hideSource: 'pf_quick_hide_source',
    allowSource: 'pf_quick_allow_source',
    zapElement: 'pf_quick_zap_element',
    saveForLater: 'pf_quick_save_for_later'
};

const QUICK_MENU_URL_PATTERNS = [
    '*://*.facebook.com/*',
    '*://*.messenger.com/*'
];

const QUICK_CONTEXT_TTL_MS = 10000;
const recentContextTargetsByTab = new Map();
const QUICK_UNDO_TTL_MS = 45000;
const quickUndoByToken = new Map();

function t(key, fallback, substitutions = undefined) {
    if (typeof chrome === 'undefined' || !chrome.i18n) return fallback;
    return chrome.i18n.getMessage(key, substitutions) || fallback;
}

function normalizeSelection(input) {
    return String(input || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeComparable(input) {
    return normalizeSelection(input).toLowerCase();
}

function isSupportedPlatformUrl(rawUrl) {
    try {
        const parsed = new URL(String(rawUrl || ''));
        return /(^|\.)facebook\.com$/i.test(parsed.hostname)
            || /(^|\.)messenger\.com$/i.test(parsed.hostname);
    } catch (err) {
        return false;
    }
}

function rememberContextTarget(tabId, payload) {
    if (!Number.isInteger(tabId) || tabId <= 0 || !payload || typeof payload !== 'object') return;

    const sourceName = normalizeSelection(payload.sourceName);
    if (!sourceName) return;

    const linkUrl = normalizeSelection(payload.linkUrl || '');
    recentContextTargetsByTab.set(tabId, {
        sourceName,
        linkUrl,
        ts: Date.now()
    });
}

function getRecentContextTarget(tabId) {
    if (!Number.isInteger(tabId) || tabId <= 0) return null;

    const target = recentContextTargetsByTab.get(tabId);
    if (!target) return null;

    if (Date.now() - Number(target.ts || 0) > QUICK_CONTEXT_TTL_MS) {
        recentContextTargetsByTab.delete(tabId);
        return null;
    }

    return target;
}

function guessSourceFromLinkUrl(rawUrl) {
    if (!isSupportedPlatformUrl(rawUrl)) return '';

    try {
        const parsed = new URL(String(rawUrl || ''));
        const pathname = decodeURIComponent(parsed.pathname || '').replace(/^\/+|\/+$/g, '');
        if (!pathname) return '';

        const parts = pathname.split('/').filter(Boolean);
        if (!parts.length) return '';

        let candidate = '';
        if (parts[0] === 'groups' && parts[1]) candidate = parts[1];
        else if (parts[0] === 'pages' && parts[2]) candidate = parts[2];
        else if (parts[0] !== 'profile.php') candidate = parts[0];

        candidate = String(candidate || '')
            .replace(/[-_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!candidate || /^\d+$/.test(candidate) || candidate.length < 3) return '';
        return candidate;
    } catch (err) {
        return '';
    }
}

function resolveSourceActionSelection(info, tabId) {
    const fromSelection = normalizeSelection(info?.selectionText || '');
    if (fromSelection) return fromSelection;

    const fromContext = getRecentContextTarget(tabId);
    if (fromContext && fromContext.sourceName) return fromContext.sourceName;

    const fromLink = guessSourceFromLinkUrl(info?.linkUrl || '');
    if (fromLink) return fromLink;

    return '';
}

function buildUndoToken() {
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
    } catch (err) {
        // ignore
    }

    return `pfu_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function purgeExpiredUndoActions() {
    const now = Date.now();
    quickUndoByToken.forEach((entry, token) => {
        const createdAt = Number(entry?.createdAt || 0);
        if (!createdAt || now - createdAt > QUICK_UNDO_TTL_MS) {
            quickUndoByToken.delete(token);
        }
    });
}

function registerUndoAction(tabId, undoSteps) {
    if (!Array.isArray(undoSteps) || undoSteps.length === 0) return '';

    purgeExpiredUndoActions();
    const token = buildUndoToken();
    quickUndoByToken.set(token, {
        tabId: Number.isInteger(tabId) && tabId > 0 ? tabId : null,
        undoSteps,
        createdAt: Date.now()
    });
    return token;
}

function consumeUndoAction(token, tabId) {
    const id = String(token || '').trim();
    if (!id) return null;

    purgeExpiredUndoActions();

    const found = quickUndoByToken.get(id);
    if (!found) return null;

    if (Number.isInteger(found.tabId) && found.tabId > 0 && Number.isInteger(tabId) && tabId > 0 && found.tabId !== tabId) {
        return null;
    }

    quickUndoByToken.delete(id);
    return found;
}

function ensureKeywordBuckets(settings) {
    const base = settings && typeof settings === 'object' ? settings : {};
    if (!base.keywords || typeof base.keywords !== 'object') base.keywords = {};

    const buckets = ['blocklist', 'autohide', 'allowlist', 'allowlistFriends', 'sourceBlocklist'];
    buckets.forEach((key) => {
        if (!Array.isArray(base.keywords[key])) base.keywords[key] = [];
    });

    return base;
}

function upsertCaseInsensitive(list, value) {
    const nextValue = normalizeSelection(value);
    if (!nextValue) return { added: false, value: '' };

    const exists = list.some((item) => normalizeComparable(item) === normalizeComparable(nextValue));
    if (exists) return { added: false, value: nextValue };

    list.push(nextValue);
    return { added: true, value: nextValue };
}

function containsCaseInsensitive(list, value) {
    const lookup = normalizeComparable(value);
    if (!lookup) return false;
    return Array.isArray(list) && list.some((item) => normalizeComparable(item) === lookup);
}

function removeCaseInsensitive(list, value) {
    const lookup = normalizeComparable(value);
    if (!lookup) return [];

    const removed = [];

    for (let i = list.length - 1; i >= 0; i -= 1) {
        if (normalizeComparable(list[i]) === lookup) {
            removed.push(String(list[i]));
            list.splice(i, 1);
        }
    }

    return removed;
}

async function applyUndoSteps(steps) {
    if (!Array.isArray(steps) || steps.length === 0) return false;

    const settings = await getSettingsForMutation();
    const keywords = settings.keywords;

    steps.forEach((step) => {
        const type = String(step?.type || '');
        const bucket = String(step?.bucket || '');
        const value = normalizeSelection(step?.value || '');
        if (!bucket || !value || !Array.isArray(keywords[bucket])) return;

        if (type === 'add') {
            upsertCaseInsensitive(keywords[bucket], value);
            return;
        }

        if (type === 'remove') {
            removeCaseInsensitive(keywords[bucket], value);
        }
    });

    await saveSettings(settings);
    return true;
}

async function getSettingsForMutation() {
    const result = await chrome.storage.sync.get('pf_settings');
    const source = result?.pf_settings && typeof result.pf_settings === 'object'
        ? result.pf_settings
        : {};

    const cloned = JSON.parse(JSON.stringify(source));
    return ensureKeywordBuckets(cloned);
}

async function saveSettings(settings) {
    await chrome.storage.sync.set({ pf_settings: settings });
}

async function notifyTab(tabId, payload) {
    if (!tabId || !payload) return;
    try {
        await chrome.tabs.sendMessage(tabId, payload);
    } catch (err) {
        // Ignore tabs without content listeners.
    }
}

async function applyQuickAction(actionId, selectionText) {
    const selectedText = normalizeSelection(selectionText);
    if (!selectedText) {
        return {
            ok: false,
            tone: 'warn',
            message: t('quick_action_select_text_first', 'Select text first, then use a PureFusion quick action.')
        };
    }

    const settings = await getSettingsForMutation();
    const keywords = settings.keywords;
    const undoSteps = [];

    if (actionId === QUICK_MENU_IDS.blockKeyword) {
        if (selectedText.length < 2) {
            return {
                ok: false,
                tone: 'warn',
                message: t('quick_action_selection_too_short', 'Selected text is too short. Choose a clearer word or phrase.')
            };
        }

        if (containsCaseInsensitive(keywords.blocklist, selectedText)) {
            return {
                ok: false,
                tone: 'info',
                message: t('quick_action_exists_blocklist', 'Already in blocklist.')
            };
        }

        const removedAllow = removeCaseInsensitive(keywords.allowlist, selectedText);
        removedAllow.forEach((value) => {
            undoSteps.push({ type: 'add', bucket: 'allowlist', value });
        });

        const result = upsertCaseInsensitive(keywords.blocklist, selectedText);
        if (!result.added) {
            return {
                ok: false,
                tone: 'info',
                message: t('quick_action_exists_blocklist', 'Already in blocklist.')
            };
        }

        undoSteps.push({ type: 'remove', bucket: 'blocklist', value: result.value });

        await saveSettings(settings);
        return {
            ok: true,
            tone: 'success',
            message: t('quick_action_added_blocklist', `Added "${result.value}" to blocklist and rescanned feed.`, [result.value]),
            undoSteps
        };
    }

    if (actionId === QUICK_MENU_IDS.autohideKeyword) {
        if (selectedText.length < 2) {
            return {
                ok: false,
                tone: 'warn',
                message: t('quick_action_selection_too_short', 'Selected text is too short. Choose a clearer word or phrase.')
            };
        }

        if (containsCaseInsensitive(keywords.autohide, selectedText)) {
            return {
                ok: false,
                tone: 'info',
                message: t('quick_action_exists_autohide', 'Already in auto-hide list.')
            };
        }

        const removedAllow = removeCaseInsensitive(keywords.allowlist, selectedText);
        removedAllow.forEach((value) => {
            undoSteps.push({ type: 'add', bucket: 'allowlist', value });
        });

        const result = upsertCaseInsensitive(keywords.autohide, selectedText);
        if (!result.added) {
            return {
                ok: false,
                tone: 'info',
                message: t('quick_action_exists_autohide', 'Already in auto-hide list.')
            };
        }

        undoSteps.push({ type: 'remove', bucket: 'autohide', value: result.value });

        await saveSettings(settings);
        return {
            ok: true,
            tone: 'success',
            message: t('quick_action_added_autohide', `Added "${result.value}" to auto-hide and rescanned feed.`, [result.value]),
            undoSteps
        };
    }

    if (actionId === QUICK_MENU_IDS.allowKeyword) {
        if (selectedText.length < 2) {
            return {
                ok: false,
                tone: 'warn',
                message: t('quick_action_selection_too_short', 'Selected text is too short. Choose a clearer word or phrase.')
            };
        }

        if (containsCaseInsensitive(keywords.allowlist, selectedText)) {
            return {
                ok: false,
                tone: 'info',
                message: t('quick_action_exists_allowlist', 'Already in allowlist.')
            };
        }

        const removedBlock = removeCaseInsensitive(keywords.blocklist, selectedText);
        const removedAuto = removeCaseInsensitive(keywords.autohide, selectedText);
        removedBlock.forEach((value) => {
            undoSteps.push({ type: 'add', bucket: 'blocklist', value });
        });
        removedAuto.forEach((value) => {
            undoSteps.push({ type: 'add', bucket: 'autohide', value });
        });

        const result = upsertCaseInsensitive(keywords.allowlist, selectedText);
        if (!result.added) {
            return {
                ok: false,
                tone: 'info',
                message: t('quick_action_exists_allowlist', 'Already in allowlist.')
            };
        }

        undoSteps.push({ type: 'remove', bucket: 'allowlist', value: result.value });

        await saveSettings(settings);
        return {
            ok: true,
            tone: 'success',
            message: t('quick_action_added_allowlist', `Added "${result.value}" to allowlist and rescanned feed.`, [result.value]),
            undoSteps
        };
    }

    if (actionId === QUICK_MENU_IDS.hideSource) {
        const looksBroad = !selectedText.includes(' ') && selectedText.length < 4;
        if (looksBroad) {
            return {
                ok: false,
                tone: 'warn',
                message: t('quick_action_source_too_broad', 'That source looks too broad. Select a full page/person/group name.')
            };
        }

        if (containsCaseInsensitive(keywords.sourceBlocklist, selectedText)) {
            return {
                ok: false,
                tone: 'info',
                message: t('quick_action_exists_source_hide', 'Source is already hidden.')
            };
        }

        const removedAllowSources = removeCaseInsensitive(keywords.allowlistFriends, selectedText);
        removedAllowSources.forEach((value) => {
            undoSteps.push({ type: 'add', bucket: 'allowlistFriends', value });
        });

        const result = upsertCaseInsensitive(keywords.sourceBlocklist, selectedText);
        if (!result.added) {
            return {
                ok: false,
                tone: 'info',
                message: t('quick_action_exists_source_hide', 'Source is already hidden.')
            };
        }

        undoSteps.push({ type: 'remove', bucket: 'sourceBlocklist', value: result.value });

        await saveSettings(settings);
        return {
            ok: true,
            tone: 'success',
            message: t('quick_action_added_source_hide', `Now hiding source "${result.value}" and rescanned feed.`, [result.value]),
            undoSteps
        };
    }

    if (actionId === QUICK_MENU_IDS.allowSource) {
        const looksBroad = !selectedText.includes(' ') && selectedText.length < 4;
        if (looksBroad) {
            return {
                ok: false,
                tone: 'warn',
                message: t('quick_action_source_too_broad', 'That source looks too broad. Select a full page/person/group name.')
            };
        }

        if (containsCaseInsensitive(keywords.allowlistFriends, selectedText)) {
            return {
                ok: false,
                tone: 'info',
                message: t('quick_action_exists_source_allow', 'Source is already in Never Hide Sources.')
            };
        }

        const removedBlockedSources = removeCaseInsensitive(keywords.sourceBlocklist, selectedText);
        removedBlockedSources.forEach((value) => {
            undoSteps.push({ type: 'add', bucket: 'sourceBlocklist', value });
        });

        const result = upsertCaseInsensitive(keywords.allowlistFriends, selectedText);
        if (!result.added) {
            return {
                ok: false,
                tone: 'info',
                message: t('quick_action_exists_source_allow', 'Source is already in Never Hide Sources.')
            };
        }

        undoSteps.push({ type: 'remove', bucket: 'allowlistFriends', value: result.value });

        await saveSettings(settings);
        return {
            ok: true,
            tone: 'success',
            message: t('quick_action_added_source_allow', `Added "${result.value}" to Never Hide Sources and rescanned feed.`, [result.value]),
            undoSteps
        };
    }

    return {
        ok: false,
        tone: 'warn',
        message: t('quick_action_unknown', 'Unknown quick action.')
    };
}

async function setupQuickActionMenus() {
    try {
        await chrome.contextMenus.removeAll();

        chrome.contextMenus.create({
            id: QUICK_MENU_IDS.root,
            title: t('quick_action_menu_root', 'Teach PureFusion'),
            contexts: ['selection', 'link'],
            documentUrlPatterns: QUICK_MENU_URL_PATTERNS
        });

        chrome.contextMenus.create({
            id: QUICK_MENU_IDS.blockKeyword,
            parentId: QUICK_MENU_IDS.root,
            title: t('quick_action_menu_block_keyword', 'Add to blocklist'),
            contexts: ['selection'],
            documentUrlPatterns: QUICK_MENU_URL_PATTERNS
        });

        chrome.contextMenus.create({
            id: QUICK_MENU_IDS.autohideKeyword,
            parentId: QUICK_MENU_IDS.root,
            title: t('quick_action_menu_autohide_keyword', 'Add to auto-hide list'),
            contexts: ['selection'],
            documentUrlPatterns: QUICK_MENU_URL_PATTERNS
        });

        chrome.contextMenus.create({
            id: QUICK_MENU_IDS.allowKeyword,
            parentId: QUICK_MENU_IDS.root,
            title: t('quick_action_menu_allow_keyword', 'Add to allowlist'),
            contexts: ['selection'],
            documentUrlPatterns: QUICK_MENU_URL_PATTERNS
        });

        chrome.contextMenus.create({
            id: QUICK_MENU_IDS.hideSource,
            parentId: QUICK_MENU_IDS.root,
            title: t('quick_action_menu_hide_source', 'Hide posts from this source'),
            contexts: ['selection', 'link'],
            documentUrlPatterns: QUICK_MENU_URL_PATTERNS
        });

        chrome.contextMenus.create({
            id: QUICK_MENU_IDS.zapElement,
            parentId: QUICK_MENU_IDS.root,
            title: t('quick_action_menu_zap_element', 'Zap (Hide) Element'),
            contexts: ['all'],
            documentUrlPatterns: QUICK_MENU_URL_PATTERNS
        });

        chrome.contextMenus.create({
            id: QUICK_MENU_IDS.saveForLater,
            parentId: QUICK_MENU_IDS.root,
            title: t('quick_action_save_later', 'Save to Read Later'),
            contexts: ['all'],
            documentUrlPatterns: QUICK_MENU_URL_PATTERNS
        });
    } catch (err) {
        console.warn('Failed to set up quick action menus:', err);
    }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const actionId = String(info?.menuItemId || '');
    const validAction = Object.values(QUICK_MENU_IDS).includes(actionId) && actionId !== QUICK_MENU_IDS.root;
    if (!validAction) return;

    const tabId = tab && typeof tab.id === 'number' ? tab.id : null;

    if (actionId === QUICK_MENU_IDS.zapElement) {
        await notifyTab(tabId, { type: 'PF_ZAP_ELEMENT' });
        return;
    }

    if (actionId === QUICK_MENU_IDS.saveForLater) {
        await notifyTab(tabId, { type: 'PF_SAVE_FOR_LATER' });
        return;
    }

    const isSourceAction = actionId === QUICK_MENU_IDS.hideSource || actionId === QUICK_MENU_IDS.allowSource;
    const selectionText = isSourceAction
        ? resolveSourceActionSelection(info, tabId)
        : normalizeSelection(info?.selectionText || '');

    if (!selectionText) {
        await notifyTab(tabId, {
            type: 'PF_QUICK_ACTION_FEEDBACK',
            message: isSourceAction
                ? t('quick_action_source_select_name', 'Right-click a profile/page/group name or highlight a source name first.')
                : t('quick_action_select_text_first', 'Select text first, then use a PureFusion quick action.'),
            tone: 'warn'
        });
        return;
    }

    const result = await applyQuickAction(actionId, selectionText);
    const undoToken = result.ok ? registerUndoAction(tabId, result.undoSteps || []) : '';

    if (result.ok) {
        await notifyTab(tabId, { type: 'PF_SETTINGS_UPDATED' });
    }

    await notifyTab(tabId, {
        type: 'PF_QUICK_ACTION_FEEDBACK',
        message: result.message,
        tone: result.tone || (result.ok ? 'success' : 'info'),
        undoToken,
        undoLabel: undoToken ? t('quick_action_undo_label', 'Undo') : ''
    });
});

/**
 * Configure declarativeNetRequest rules to block external tracking/ad payloads.
 * Note: Facebook serves *feed* ads via its own domain graph endpoints, so 
 * DNS/Request blocking is not effective for Sponsored posts (our content script handles that).
 * However, we can block telemetry and third-party trackers injected into the page.
 */
async function setupDNRRules() {
    let settings;
    try {
        const result = await chrome.storage.sync.get('pf_settings');
        settings = result?.pf_settings;
    } catch (err) {
        console.error('Failed to load settings for DNR setup:', err);
    }

    const isGhostModeDisabled = !settings || settings.enabled === false;
    const hideSeen = settings?.uiMode?.hideMessengerSeen && !isGhostModeDisabled;
    const hideTyping = settings?.social?.hideMessengerTyping && !isGhostModeDisabled;

    const _rules = [
        {
            'id': 1,
            'priority': 1,
            'action': { 'type': 'block' },
            'condition': {
                'urlFilter': '*://*.facebook.com/tr/*',
                'resourceTypes': ['xmlhttprequest', 'image']
            }
        },
        {
            'id': 2,
            'priority': 1,
            'action': { 'type': 'block' },
            'condition': {
                'urlFilter': '*://*.facebook.com/ajax/bz*',
                'resourceTypes': ['xmlhttprequest', 'script']
            }
        }
    ];

    if (hideSeen) {
        _rules.push({
            'id': 3,
            'priority': 1,
            'action': { 'type': 'block' },
            'condition': {
                'urlFilter': '*/ajax/mercury/mark_read.php*',
                'resourceTypes': ['xmlhttprequest']
            }
        });
    }

    if (hideTyping) {
        _rules.push({
            'id': 4,
            'priority': 1,
            'action': { 'type': 'block' },
            'condition': {
                'urlFilter': '*/ajax/messaging/typ.php*',
                'resourceTypes': ['xmlhttprequest']
            }
        });
    }

    try {
        // Clear all possible PureFusion dynamic rules (ids 1-10) before re-applying
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const existingIds = existingRules.map(r => r.id);
        
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: existingIds,
            addRules: _rules
        });
        console.log(`DNR Privacy rules updated. Active rules: ${_rules.length}`);
    } catch (e) {
        console.error('Failed to update DNR rules:', e);
    }
}

// Keeping the service worker alive if necessary via standard message passing
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'PF_SETTINGS_UPDATED') {
        setupDNRRules();
        // Fall through to allow other listeners to handle if needed
    }

    if (message.type === 'PF_CONTEXT_TARGET') {
        const tabId = sender && sender.tab && typeof sender.tab.id === 'number' ? sender.tab.id : null;
        if (tabId) rememberContextTarget(tabId, message.payload || {});
        if (sendResponse) sendResponse({ status: 'captured' });
        return;
    }

    if (message.type === 'PF_QUICK_ACTION_UNDO') {
        const tabId = sender && sender.tab && typeof sender.tab.id === 'number' ? sender.tab.id : null;
        const token = String(message.token || '').trim();

        (async () => {
            if (!token) {
                sendResponse({
                    ok: false,
                    tone: 'warn',
                    message: t('quick_action_undo_expired', 'Undo is no longer available for that action.')
                });
                return;
            }

            const undoEntry = consumeUndoAction(token, tabId);
            if (!undoEntry) {
                sendResponse({
                    ok: false,
                    tone: 'warn',
                    message: t('quick_action_undo_expired', 'Undo is no longer available for that action.')
                });
                return;
            }

            const restored = await applyUndoSteps(undoEntry.undoSteps || []);
            if (!restored) {
                sendResponse({
                    ok: false,
                    tone: 'error',
                    message: t('quick_action_undo_failed', 'Undo failed. Please try again.')
                });
                return;
            }

            await notifyTab(tabId, { type: 'PF_SETTINGS_UPDATED' });
            sendResponse({
                ok: true,
                tone: 'success',
                message: t('quick_action_undo_success', 'Quick action undone.')
            });
        })();

        return true;
    }

    if (message.type === 'PF_PING') {
        sendResponse({ status: 'alive' });
    }
    
    // Allow content scripts and in-page UI to request opening the full settings page
    if (message.action === 'openOptionsPage') {
        chrome.runtime.openOptionsPage();
        sendResponse({ status: 'opening' });
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (typeof tabId === 'number') recentContextTargetsByTab.delete(tabId);

    if (typeof tabId === 'number') {
        quickUndoByToken.forEach((entry, token) => {
            if (Number(entry?.tabId) === tabId) quickUndoByToken.delete(token);
        });
    }
});
