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
    const viewModeSelect = document.getElementById('opt_view_mode');
    const VIEW_MODE_STORAGE_KEY = 'pf_options_view_mode_v1';
    const ADVANCED_TAB_IDS = new Set(['tab-ai', 'tab-ui', 'tab-keywords', 'tab-data']);

    let currentOptionsViewMode = 'advanced';

    function cleanedTabTitle(label = '') {
        return label.replace(/[🚫🤖🎨🔤📊💾🧘🤝]/g, '').trim();
    }

    function activateTab(link) {
        if (!link) return;

        const linkStyle = window.getComputedStyle(link);
        if (linkStyle.display === 'none') return;

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

    function activateTabById(tabId) {
        const id = String(tabId || '').trim();
        if (!id) return;

        const link = Array.from(navLinks).find((candidate) => {
            if (candidate.getAttribute('data-tab') !== id) return false;
            const style = window.getComputedStyle(candidate);
            return style.display !== 'none';
        });
        if (link) activateTab(link);
    }

    function getVisibleNavLinks() {
        return Array.from(navLinks).filter((link) => {
            const style = window.getComputedStyle(link);
            return style.display !== 'none';
        });
    }

    function applyOptionsViewMode(modeInput) {
        const mode = String(modeInput || 'advanced').toLowerCase() === 'basic' ? 'basic' : 'advanced';
        currentOptionsViewMode = mode;

        document.body.classList.toggle('pf-view-basic', mode === 'basic');
        if (viewModeSelect) viewModeSelect.value = mode;

        const activeLink = Array.from(navLinks).find((link) => link.classList.contains('active'));
        if (activeLink) {
            const activeStyle = window.getComputedStyle(activeLink);
            if (activeStyle.display === 'none') {
                const firstVisible = getVisibleNavLinks()[0];
                if (firstVisible) activateTab(firstVisible);
            }
        }
    }

    function persistOptionsViewMode(mode) {
        try {
            window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
        } catch (err) {
            // ignore storage failures
        }
    }

    function loadOptionsViewMode() {
        try {
            const saved = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
            return saved === 'basic' ? 'basic' : 'advanced';
        } catch (err) {
            return 'advanced';
        }
    }

    function isAdvancedFocusTarget(selector) {
        const focusSelector = String(selector || '').trim();
        if (!focusSelector) return false;

        try {
            const target = document.querySelector(focusSelector);
            if (!target) return false;
            return Boolean(target.closest('.pf-advanced-card'));
        } catch (err) {
            return false;
        }
    }

    if (navList) navList.setAttribute('role', 'tablist');
    tabContents.forEach((tab) => tab.setAttribute('role', 'tabpanel'));

    navLinks.forEach((link) => {
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
                const visibleLinks = getVisibleNavLinks();
                if (!visibleLinks.length) return;
                const visibleIndex = visibleLinks.indexOf(link);
                const next = visibleLinks[(visibleIndex + 1) % visibleLinks.length];
                if (!next) return;
                next.focus();
                activateTab(next);
            }

            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const visibleLinks = getVisibleNavLinks();
                if (!visibleLinks.length) return;
                const visibleIndex = visibleLinks.indexOf(link);
                const prev = visibleLinks[(visibleIndex - 1 + visibleLinks.length) % visibleLinks.length];
                if (!prev) return;
                prev.focus();
                activateTab(prev);
            }
        });
    });

    applyOptionsViewMode(loadOptionsViewMode());

    const initialActiveTab = Array.from(navLinks).find((link) => {
        if (!link.classList.contains('active')) return false;
        const style = window.getComputedStyle(link);
        return style.display !== 'none';
    }) || getVisibleNavLinks()[0];
    if (initialActiveTab) activateTab(initialActiveTab);

    if (viewModeSelect) {
        viewModeSelect.addEventListener('change', () => {
            const nextMode = String(viewModeSelect.value || 'advanced');
            applyOptionsViewMode(nextMode);
            persistOptionsViewMode(nextMode);
        });
    }

    if (!document.getElementById('pf-options-nav-highlight-style')) {
        const highlightStyle = document.createElement('style');
        highlightStyle.id = 'pf-options-nav-highlight-style';
        highlightStyle.textContent = `
            .pf-options-nav-highlight {
                box-shadow: 0 0 0 2px rgba(121, 235, 255, 0.96), 0 0 16px rgba(121, 235, 255, 0.55) !important;
                transition: box-shadow 0.18s ease;
            }
        `;
        document.head.appendChild(highlightStyle);
    }

    window.addEventListener('message', (event) => {
        const data = event?.data;
        if (!data || data.type !== 'PF_OPTIONS_NAVIGATE') return;

        const tabId = String(data.tabId || '').trim();
        const focusSelector = String(data.focusSelector || '').trim();

        if (tabId && currentOptionsViewMode === 'basic' && ADVANCED_TAB_IDS.has(tabId)) {
            applyOptionsViewMode('advanced');
            persistOptionsViewMode('advanced');
        }

        if (focusSelector && currentOptionsViewMode === 'basic' && isAdvancedFocusTarget(focusSelector)) {
            applyOptionsViewMode('advanced');
            persistOptionsViewMode('advanced');
        }

        if (tabId) activateTabById(tabId);
        if (!focusSelector) return;

        const target = document.querySelector(focusSelector);
        if (!target) return;

        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('pf-options-nav-highlight');
        setTimeout(() => target.classList.remove('pf-options-nav-highlight'), 1800);
        if (typeof target.focus === 'function') {
            try { target.focus({ preventScroll: true }); } catch (err) { target.focus(); }
        }
    });

    // =========================================================================
    // Map Storage Object to HTML Elements & Vice Versa
    // =========================================================================

    const uiMap = {
        // Filters
        'opt_filters_filterLocale': { obj: 'filters', prop: 'filterLocale', type: 'select' },
        'opt_filters_removeAds': { obj: 'filters', prop: 'removeAds', type: 'checkbox' },
        'opt_filters_removeSponsored': { obj: 'filters', prop: 'removeSponsored', type: 'checkbox' },
        'opt_filters_removeSuggested': { obj: 'filters', prop: 'removeSuggested', type: 'checkbox' },
        'opt_filters_removePYMK': { obj: 'filters', prop: 'removePYMK', type: 'checkbox' },
        'opt_filters_removeGroupSuggestions': { obj: 'filters', prop: 'removeGroupSuggestions', type: 'checkbox' },
        'opt_filters_removePageSuggestions': { obj: 'filters', prop: 'removePageSuggestions', type: 'checkbox' },
        'opt_filters_hideReels': { obj: 'filters', prop: 'hideReels', type: 'checkbox' },
        'opt_filters_hideStories': { obj: 'filters', prop: 'hideStories', type: 'checkbox' },
        'opt_filters_hideMemories': { obj: 'filters', prop: 'hideMemories', type: 'checkbox' },
        'opt_filters_hideFundraisers': { obj: 'filters', prop: 'hideFundraisers', type: 'checkbox' },
        'opt_filters_hideVideoPosts': { obj: 'filters', prop: 'hideVideoPosts', type: 'checkbox' },
        'opt_filters_hidePhotoPosts': { obj: 'filters', prop: 'hidePhotoPosts', type: 'checkbox' },
        'opt_filters_hideLinkPosts': { obj: 'filters', prop: 'hideLinkPosts', type: 'checkbox' },
        'opt_filters_hideTextOnlyPosts': { obj: 'filters', prop: 'hideTextOnlyPosts', type: 'checkbox' },
        'opt_filters_hideLiveVideoPosts': { obj: 'filters', prop: 'hideLiveVideoPosts', type: 'checkbox' },
        'opt_filters_hideShareReposts': { obj: 'filters', prop: 'hideShareReposts', type: 'checkbox' },
        'opt_filters_hidePollPosts': { obj: 'filters', prop: 'hidePollPosts', type: 'checkbox' },
        'opt_filters_removeColoredBackgrounds': { obj: 'filters', prop: 'removeColoredBackgrounds', type: 'checkbox' },

        // Feed Experience Mode
        'opt_experience_mode': { obj: 'experienceMode', prop: 'active', type: 'select' },

        // Story Activity Filters
        'opt_story_hideBecameFriends': { obj: 'storyFilters', prop: 'hideBecameFriends', type: 'checkbox' },
        'opt_story_hideJoinedGroups': { obj: 'storyFilters', prop: 'hideJoinedGroups', type: 'checkbox' },
        'opt_story_hideCommentedOnThis': { obj: 'storyFilters', prop: 'hideCommentedOnThis', type: 'checkbox' },
        'opt_story_hideLikedThis': { obj: 'storyFilters', prop: 'hideLikedThis', type: 'checkbox' },
        'opt_story_hideAttendingEvents': { obj: 'storyFilters', prop: 'hideAttendingEvents', type: 'checkbox' },
        'opt_story_hideSharedMemories': { obj: 'storyFilters', prop: 'hideSharedMemories', type: 'checkbox' },
        'opt_story_hideProfilePhotoUpdates': { obj: 'storyFilters', prop: 'hideProfilePhotoUpdates', type: 'checkbox' },
        'opt_story_hideCoverPhotoUpdates': { obj: 'storyFilters', prop: 'hideCoverPhotoUpdates', type: 'checkbox' },
        'opt_story_hideLifeEvents': { obj: 'storyFilters', prop: 'hideLifeEvents', type: 'checkbox' },
        'opt_story_hideCheckIns': { obj: 'storyFilters', prop: 'hideCheckIns', type: 'checkbox' },
        'opt_story_hideMilestones': { obj: 'storyFilters', prop: 'hideMilestones', type: 'checkbox' },
        'opt_story_hideJobWorkUpdates': { obj: 'storyFilters', prop: 'hideJobWorkUpdates', type: 'checkbox' },
        'opt_story_hideRelationshipUpdates': { obj: 'storyFilters', prop: 'hideRelationshipUpdates', type: 'checkbox' },
        'opt_story_hideGroupActivityPosts': { obj: 'storyFilters', prop: 'hideGroupActivityPosts', type: 'checkbox' },

        // Image Subject Filters
        'opt_image_filters_enabled': { obj: 'imageFilters', prop: 'enabled', type: 'checkbox' },
        'opt_image_hideSports': { obj: 'imageFilters', prop: 'hideSports', type: 'checkbox' },
        'opt_image_hideFood': { obj: 'imageFilters', prop: 'hideFood', type: 'checkbox' },
        'opt_image_hidePets': { obj: 'imageFilters', prop: 'hidePets', type: 'checkbox' },
        'opt_image_hideVehicles': { obj: 'imageFilters', prop: 'hideVehicles', type: 'checkbox' },
        'opt_image_hideScreenshotsMemes': { obj: 'imageFilters', prop: 'hideScreenshotsMemes', type: 'checkbox' },
        'opt_image_hideTravelScenery': { obj: 'imageFilters', prop: 'hideTravelScenery', type: 'checkbox' },

        // Surface Scope Controls
        'opt_surface_enabled': { obj: 'surfaceControls', prop: 'enabled', type: 'checkbox' },
        'opt_surface_applyHome': { obj: 'surfaceControls', prop: 'applyHome', type: 'checkbox' },
        'opt_surface_applyGroups': { obj: 'surfaceControls', prop: 'applyGroups', type: 'checkbox' },
        'opt_surface_applyWatch': { obj: 'surfaceControls', prop: 'applyWatch', type: 'checkbox' },
        'opt_surface_applyMarketplace': { obj: 'surfaceControls', prop: 'applyMarketplace', type: 'checkbox' },
        'opt_surface_applyOther': { obj: 'surfaceControls', prop: 'applyOther', type: 'checkbox' },
        
        // Predictions
        'opt_pred_enabled': { obj: 'predictions', prop: 'enabled', type: 'checkbox' },
        'opt_pred_showBadge': { obj: 'predictions', prop: 'showBadge', type: 'checkbox' },
        'opt_pred_showScoreReasons': { obj: 'predictions', prop: 'showScoreReasons', type: 'checkbox' },
        'opt_pred_dimLowInterest': { obj: 'predictions', prop: 'dimLowInterest', type: 'checkbox' },
        'opt_pred_collapseLowInterest': { obj: 'predictions', prop: 'collapseLowInterest', type: 'checkbox' },
        'opt_pred_neverEmptyFeedGuard': { obj: 'predictions', prop: 'neverEmptyFeedGuard', type: 'checkbox' },
        'opt_pred_neverEmptyFeedMinVisiblePosts': { obj: 'predictions', prop: 'neverEmptyFeedMinVisiblePosts', type: 'number', fallback: 3 },
        'opt_pred_highlightHighInterest': { obj: 'predictions', prop: 'highlightHighInterest', type: 'checkbox' },
        'opt_pred_showTrending': { obj: 'predictions', prop: 'showTrending', type: 'checkbox' },
        'opt_pred_lowThreshold': { obj: 'predictions', prop: 'lowThreshold', type: 'number', fallback: 20 },
        'opt_pred_highThreshold': { obj: 'predictions', prop: 'highThreshold', type: 'number', fallback: 80 },
        'opt_pred_credibilitySignalsEnabled': { obj: 'predictions', prop: 'credibilitySignalsEnabled', type: 'checkbox' },
        'opt_pred_showCredibilityBadge': { obj: 'predictions', prop: 'showCredibilityBadge', type: 'checkbox' },
        'opt_pred_strictCredibilityPenalty': { obj: 'predictions', prop: 'strictCredibilityPenalty', type: 'checkbox' },
        'opt_pred_showCredibilityDebugPreview': { obj: 'predictions', prop: 'showCredibilityDebugPreview', type: 'checkbox' },

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
        'opt_uiMode_hidePostComposer': { obj: 'uiMode', prop: 'hidePostComposer', type: 'checkbox' },
        'opt_uiMode_fontSizeScale': { obj: 'uiMode', prop: 'fontSizeScale', type: 'number' },
        'opt_uiMode_customStylingEnabled': { obj: 'uiMode', prop: 'customStylingEnabled', type: 'checkbox' },
        'opt_uiMode_customFontFamily': { obj: 'uiMode', prop: 'customFontFamily', type: 'text' },
        'opt_uiMode_customAccentColor': { obj: 'uiMode', prop: 'customAccentColor', type: 'text' },
        'opt_uiMode_customTextColor': { obj: 'uiMode', prop: 'customTextColor', type: 'text' },
        'opt_uiMode_customCardBackground': { obj: 'uiMode', prop: 'customCardBackground', type: 'text' },
        'opt_uiMode_customBackground': { obj: 'uiMode', prop: 'customBackground', type: 'text' },
        'opt_uiMode_customCss': { obj: 'uiMode', prop: 'customCss', type: 'text' },

        // Sidebar Visibility
        'opt_sidebar_enableModuleFilters': { obj: 'sidebar', prop: 'enableModuleFilters', type: 'checkbox' },
        'opt_sidebar_hideLeftMarketplace': { obj: 'sidebar', prop: 'hideLeftMarketplace', type: 'checkbox' },
        'opt_sidebar_hideLeftGaming': { obj: 'sidebar', prop: 'hideLeftGaming', type: 'checkbox' },
        'opt_sidebar_hideLeftWatch': { obj: 'sidebar', prop: 'hideLeftWatch', type: 'checkbox' },
        'opt_sidebar_hideLeftMemories': { obj: 'sidebar', prop: 'hideLeftMemories', type: 'checkbox' },
        'opt_sidebar_hideLeftMetaAI': { obj: 'sidebar', prop: 'hideLeftMetaAI', type: 'checkbox' },
        'opt_sidebar_hideLeftManusAI': { obj: 'sidebar', prop: 'hideLeftManusAI', type: 'checkbox' },
        'opt_sidebar_hideRightTrending': { obj: 'sidebar', prop: 'hideRightTrending', type: 'checkbox' },
        'opt_sidebar_hideRightContacts': { obj: 'sidebar', prop: 'hideRightContacts', type: 'checkbox' },
        'opt_sidebar_hideRightMetaAIContact': { obj: 'sidebar', prop: 'hideRightMetaAIContact', type: 'checkbox' },
        'opt_sidebar_hideRightManusAIContact': { obj: 'sidebar', prop: 'hideRightManusAIContact', type: 'checkbox' },
        'opt_sidebar_hideRightEvents': { obj: 'sidebar', prop: 'hideRightEvents', type: 'checkbox' },
        'opt_sidebar_hideRightBirthdays': { obj: 'sidebar', prop: 'hideRightBirthdays', type: 'checkbox' },

        // Topbar Visibility
        'opt_topbar_enabled': { obj: 'topbarFilters', prop: 'enabled', type: 'checkbox' },
        'opt_topbar_hideHome': { obj: 'topbarFilters', prop: 'hideHome', type: 'checkbox' },
        'opt_topbar_hideFriends': { obj: 'topbarFilters', prop: 'hideFriends', type: 'checkbox' },
        'opt_topbar_hideWatch': { obj: 'topbarFilters', prop: 'hideWatch', type: 'checkbox' },
        'opt_topbar_hideMarketplace': { obj: 'topbarFilters', prop: 'hideMarketplace', type: 'checkbox' },
        'opt_topbar_hideGroups': { obj: 'topbarFilters', prop: 'hideGroups', type: 'checkbox' },
        'opt_topbar_hideGaming': { obj: 'topbarFilters', prop: 'hideGaming', type: 'checkbox' },
        'opt_topbar_hideMessenger': { obj: 'topbarFilters', prop: 'hideMessenger', type: 'checkbox' },
        'opt_topbar_hideNotifications': { obj: 'topbarFilters', prop: 'hideNotifications', type: 'checkbox' },
        'opt_topbar_hideMenu': { obj: 'topbarFilters', prop: 'hideMenu', type: 'checkbox' },
        'opt_topbar_hideCreate': { obj: 'topbarFilters', prop: 'hideCreate', type: 'checkbox' },

        // Diagnostics
        'opt_diag_enabled': { obj: 'diagnostics', prop: 'enabled', type: 'checkbox' },
        'opt_diag_showOverlay': { obj: 'diagnostics', prop: 'showOverlay', type: 'checkbox' },
        'opt_diag_compactOverlay': { obj: 'diagnostics', prop: 'compactOverlay', type: 'checkbox' },
        'opt_diag_verboseConsole': { obj: 'diagnostics', prop: 'verboseConsole', type: 'checkbox' },
        'opt_diag_maxReasons': { obj: 'diagnostics', prop: 'maxReasons', type: 'number', fallback: 6 },
        'opt_diag_warnDurationMs': { obj: 'diagnostics', prop: 'observerWarnDurationMs', type: 'number', fallback: 25 },
        'opt_diag_severeDurationMs': { obj: 'diagnostics', prop: 'observerSevereDurationMs', type: 'number', fallback: 45 },
        'opt_diag_warnNodes': { obj: 'diagnostics', prop: 'observerWarnNodes', type: 'number', fallback: 220 },
        'opt_diag_severeNodes': { obj: 'diagnostics', prop: 'observerSevereNodes', type: 'number', fallback: 420 },
        'opt_diag_warnRecords': { obj: 'diagnostics', prop: 'observerWarnRecords', type: 'number', fallback: 120 },
        'opt_diag_severeRecords': { obj: 'diagnostics', prop: 'observerSevereRecords', type: 'number', fallback: 240 },

        // Wellbeing
        'opt_wb_grayscale': { obj: 'wellbeing', prop: 'grayscaleMode', type: 'checkbox' },
        'opt_wb_scrollStop': { obj: 'wellbeing', prop: 'infiniteScrollStopper', type: 'checkbox' },
        'opt_wb_scrollLimit': { obj: 'wellbeing', prop: 'scrollLimitPosts', type: 'number' },
        'opt_wb_sessionTimer': { obj: 'wellbeing', prop: 'sessionTimer', type: 'checkbox' },
        'opt_wb_sessionAwarenessEnabled': { obj: 'wellbeing', prop: 'sessionAwarenessEnabled', type: 'checkbox' },
        'opt_wb_sessionAwarenessScrollsPerMinuteThreshold': { obj: 'wellbeing', prop: 'sessionAwarenessScrollsPerMinuteThreshold', type: 'number', fallback: 85 },
        'opt_wb_sessionAwarenessCooldownMinutes': { obj: 'wellbeing', prop: 'sessionAwarenessCooldownMinutes', type: 'number', fallback: 12 },
        'opt_wb_dailyFeedReportEnabled': { obj: 'wellbeing', prop: 'dailyFeedReportEnabled', type: 'checkbox' },
        'opt_wb_dailyFeedReportAutoMinutes': { obj: 'wellbeing', prop: 'dailyFeedReportAutoMinutes', type: 'number', fallback: 30 },
        'opt_wb_reelsLimiterEnabled': { obj: 'wellbeing', prop: 'reelsLimiterEnabled', type: 'checkbox' },
        'opt_wb_reelsSessionLimit': { obj: 'wellbeing', prop: 'reelsSessionLimit', type: 'number' },
        'opt_wb_reelsHardLock': { obj: 'wellbeing', prop: 'reelsHardLock', type: 'checkbox' },
        'opt_wb_ragebait': { obj: 'wellbeing', prop: 'ragebaitDetector', type: 'checkbox' },
        'opt_wb_clickbait': { obj: 'wellbeing', prop: 'clickbaitBlocker', type: 'checkbox' },

        // Social
        'opt_social_trackUnfriends': { obj: 'social', prop: 'trackUnfriends', type: 'checkbox' },
        'opt_social_notificationDigestMode': { obj: 'social', prop: 'notificationDigestMode', type: 'checkbox' },
        'opt_social_autoCommentPreview': { obj: 'social', prop: 'autoCommentPreview', type: 'checkbox' },
        'opt_social_commentPreviewStrategy': { obj: 'social', prop: 'commentPreviewStrategy', type: 'select' },
        'opt_social_commentPreviewCooldownMs': { obj: 'social', prop: 'commentPreviewCooldownMs', type: 'number', fallback: 1200 },
        'opt_social_commentPreviewRetryCap': { obj: 'social', prop: 'commentPreviewRetryCap', type: 'number', fallback: 4 },
        'opt_social_commentPreviewMaxPostsPerSweep': { obj: 'social', prop: 'commentPreviewMaxPostsPerSweep', type: 'number', fallback: 30 },
        'opt_social_commentPreviewAllowHome': { obj: 'social', prop: 'commentPreviewAllowHome', type: 'checkbox' },
        'opt_social_commentPreviewAllowGroups': { obj: 'social', prop: 'commentPreviewAllowGroups', type: 'checkbox' },
        'opt_social_commentPreviewAllowWatch': { obj: 'social', prop: 'commentPreviewAllowWatch', type: 'checkbox' },
        'opt_social_commentPreviewAllowMarketplace': { obj: 'social', prop: 'commentPreviewAllowMarketplace', type: 'checkbox' },
        'opt_social_commentPreviewAllowNotifications': { obj: 'social', prop: 'commentPreviewAllowNotifications', type: 'checkbox' },
        'opt_social_commentPreviewAllowOther': { obj: 'social', prop: 'commentPreviewAllowOther', type: 'checkbox' },
        'opt_social_hideMetaAI': { obj: 'social', prop: 'hideMetaAI', type: 'checkbox' },
        'opt_social_hideMessengerTyping': { obj: 'social', prop: 'hideMessengerTyping', type: 'checkbox' },
        'opt_social_messengerPrivacyBlur': { obj: 'social', prop: 'messengerPrivacyBlur', type: 'checkbox' },
        'opt_social_alwaysShowMessageTimestamps': { obj: 'social', prop: 'alwaysShowMessageTimestamps', type: 'checkbox' },
        'opt_social_messengerMarkAllRead': { obj: 'social', prop: 'messengerMarkAllRead', type: 'checkbox' },
        'opt_social_messengerConversationFilter': { obj: 'social', prop: 'messengerConversationFilter', type: 'checkbox' },
        'opt_social_detectUnsends': { obj: 'social', prop: 'detectUnsends', type: 'checkbox' },
        'opt_social_blockNotifGames': { obj: 'social', prop: 'blockNotifGames', type: 'checkbox' },
        'opt_social_blockNotifBirthdays': { obj: 'social', prop: 'blockNotifBirthdays', type: 'checkbox' },
        'opt_social_blockNotifMarketplace': { obj: 'social', prop: 'blockNotifMarketplace', type: 'checkbox' },
        'opt_social_blockNotifEngagement': { obj: 'social', prop: 'blockNotifEngagement', type: 'checkbox' },
        'opt_social_hideSearchPopupSuggestions': { obj: 'social', prop: 'hideSearchPopupSuggestions', type: 'checkbox' },
        'opt_social_hideSearchTrending': { obj: 'social', prop: 'hideSearchTrending', type: 'checkbox' },
        'opt_social_hideSearchRecent': { obj: 'social', prop: 'hideSearchRecent', type: 'checkbox' },

        // LLM
        'opt_llm_provider': { obj: 'llm', prop: 'provider', type: 'select' },
        'opt_llm_openAIApiKey': { obj: 'llm', prop: 'openAIApiKey', type: 'text' },
        'opt_llm_geminiApiKey': { obj: 'llm', prop: 'geminiApiKey', type: 'text' },
        'opt_llm_tldr': { obj: 'llm', prop: 'tldrEnabled', type: 'checkbox' },
        'opt_llm_smartcomment': { obj: 'llm', prop: 'smartCommentEnabled', type: 'checkbox' },
        'opt_llm_smartCommentOnMessenger': { obj: 'llm', prop: 'smartCommentOnMessenger', type: 'checkbox' },
        'opt_llm_clickbaitdecode': { obj: 'llm', prop: 'clickbaitDecoder', type: 'checkbox' },
        'opt_llm_messengerRewriteEnabled': { obj: 'llm', prop: 'messengerRewriteEnabled', type: 'checkbox' },
        'opt_llm_messengerSmartRepliesEnabled': { obj: 'llm', prop: 'messengerSmartRepliesEnabled', type: 'checkbox' },
    };

    const themeSelect = document.getElementById('opt_uiMode_theme');
    const fontScaleInput = document.getElementById('opt_uiMode_fontSizeScale');
    const themePreview = document.getElementById('pfThemePreview');
    const themePreviewMode = document.getElementById('pfThemePreviewMode');
    const themePreviewCard = document.getElementById('pfThemePreviewCard');
    const presetSelect = document.getElementById('opt_preset_pack');
    const btnApplyPreset = document.getElementById('btnApplyPreset');
    const experienceModeSelect = document.getElementById('opt_experience_mode');
    const experienceModeProfile = document.getElementById('pfExperienceModeProfile');
    const modeRecommendationBadge = document.getElementById('pfModeRecommendationBadge');
    const modeWhyLine = document.getElementById('pfModeWhyLine');
    const performanceModeHint = document.getElementById('pfPerformanceModeHint');
    const btnApplyUltraFastRecommendation = document.getElementById('btnApplyUltraFastRecommendation');
    const customCssSnippetSelect = document.getElementById('opt_uiMode_customCssSnippet');
    const btnApplyCustomCssSnippet = document.getElementById('btnApplyCustomCssSnippet');
    const customCssTextarea = document.getElementById('opt_uiMode_customCss');
    const customStylingToggle = document.getElementById('opt_uiMode_customStylingEnabled');
    const btnQuickModeSmart = document.getElementById('btnQuickModeSmart');

    // Rule Engine UI
    const btnAddNewRule = document.getElementById('btnAddNewRule');
    const pfRuleEditor = document.getElementById('pfRuleEditor');
    const pfRulesList = document.getElementById('pfRulesList');
    const btnSaveRule = document.getElementById('btnSaveRule');
    const btnCancelRule = document.getElementById('btnCancelRule');
    const ruleTypeSelect = document.getElementById('rule-type');
    const ruleLabelInput = document.getElementById('rule-label');
    const ruleValueInput = document.getElementById('rule-value');
    const ruleWrapperInput = document.getElementById('rule-wrapper');
    const ruleWrapperRow = document.getElementById('rule-wrapper-row');

    let ruleEditId = null;

    const themeNames = {
        default: t('options_ui_theme_default', 'Facebook Default'),
        darkPro: t('options_ui_theme_darkpro', 'Dark Pro'),
        amoled: t('options_ui_theme_amoled', 'AMOLED Pitch Black'),
        classicBlue: t('options_ui_theme_classic', 'Classic Blue'),
        zen: t('options_ui_theme_zen', 'Zen Mode (Minimalist)'),
        pastel: t('options_ui_theme_pastel', 'Pastel Warm')
    };

    const presetPacks = {
        workFocus: {
            filters: {
                removeAds: true,
                removeSuggested: true,
                removePYMK: true,
                removeGroupSuggestions: true,
                removePageSuggestions: true,
                hideReels: true,
                hideStories: true,
                hideFundraisers: true,
                hideMarketplace: true
            },
            uiMode: {
                compactMode: true,
                friendsOnlyMode: false
            },
            wellbeing: {
                infiniteScrollStopper: true,
                scrollLimitPosts: 20
            }
        },
        friendsOnly: {
            filters: {
                removeAds: true,
                removeSuggested: true,
                removePYMK: true,
                removeGroupSuggestions: true,
                removePageSuggestions: true,
                hideReels: true,
                hideStories: false
            },
            uiMode: {
                friendsOnlyMode: true
            }
        },
        minimal: {
            filters: {
                removeAds: true,
                removeSuggested: false,
                removePYMK: false,
                removeGroupSuggestions: false,
                removePageSuggestions: false,
                hideReels: false,
                hideStories: false,
                hideFundraisers: false
            },
            uiMode: {
                compactMode: false,
                friendsOnlyMode: false
            },
            wellbeing: {
                infiniteScrollStopper: false,
                sessionTimer: false
            }
        },
        newsHeavy: {
            filters: {
                removeAds: true,
                removeSuggested: true,
                removePYMK: true,
                removeGroupSuggestions: false,
                removePageSuggestions: false,
                hideReels: true,
                hideStories: true,
                hideFundraisers: true
            },
            uiMode: {
                friendsOnlyMode: false,
                enforceChronologicalFeed: true
            },
            predictions: {
                enabled: true,
                showBadge: true,
                showTrending: true
            }
        },
        messengerPrivacy: {
            uiMode: {
                hideMessengerSeen: true
            },
            social: {
                hideMessengerTyping: true,
                messengerPrivacyBlur: true,
                notificationDigestMode: true
            }
        }
    };

    const customCssSnippets = {
        subtleCards: {
            label: t('options_ui_custom_css_preset_subtle_cards', 'Subtle card polish'),
            css: `[role="feed"] [role="article"] {
  border-radius: 14px !important;
  border: 1px solid rgba(120, 132, 154, 0.25) !important;
  box-shadow: 0 10px 26px rgba(10, 16, 28, 0.16) !important;
}`
        },
        calmerMotion: {
            label: t('options_ui_custom_css_preset_calmer_motion', 'Calmer motion'),
            css: `*,
*::before,
*::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.08s !important;
  scroll-behavior: auto !important;
}`
        },
        readabilityBoost: {
            label: t('options_ui_custom_css_preset_readability_boost', 'Readability boost'),
            css: `[role="feed"] [role="article"] {
  line-height: 1.55 !important;
  letter-spacing: 0.01em !important;
}

[role="feed"] [role="article"] div[dir="auto"] {
  max-width: 70ch !important;
}`
        }
    };

    function renderThemePreview(theme, scale) {
        if (!themePreview || !themePreviewCard || !themePreviewMode) return;

        const previewTheme = themeNames[theme] ? theme : 'default';
        const previewScale = Math.max(80, Math.min(150, parseInt(scale, 10) || 100));

        themePreview.dataset.theme = previewTheme;
        themePreviewMode.textContent = themeNames[previewTheme];
        themePreviewCard.style.fontSize = `${previewScale}%`;
    }

    function renderExperienceModeProfile(mode) {
        if (!experienceModeProfile) return;

        const profiles = {
            custom: t('options_mode_profile_custom', 'Uses your exact saved toggles with no additional mode overrides.'),
            clean: t('options_mode_profile_clean', 'Strips ad/suggested clutter and social noise while keeping prediction visuals off for a calmer feed.'),
            focus: t('options_mode_profile_focus', 'Home-first deep focus profile: aggressive clutter cuts, chronology on, and scroll-break guard enabled.'),
            ultrafast: t('options_mode_profile_ultrafast', 'Text-first speed profile: strips heavy media surfaces, suppresses image/video post types, and minimizes extra UI processing.'),
            smart: t('options_mode_profile_smart', 'Keeps core feed cleanup on while enabling scoring, collapsing low-value posts, and credibility verification signals.'),
            classic: t('options_mode_profile_classic', 'Prioritizes chronological classic feed behavior and suppresses modern algorithmic surfaces like Watch/Marketplace.'),
        };

        const key = String(mode || 'custom').toLowerCase();
        experienceModeProfile.textContent = profiles[key] || profiles.custom;
    }

    function getDevicePerformanceTier() {
        const cores = Number(navigator.hardwareConcurrency || 0);
        const memory = Number(navigator.deviceMemory || 0);

        const low = (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4);
        if (low) return 'low';

        const moderate = (cores > 0 && cores <= 6) || (memory > 0 && memory <= 8);
        return moderate ? 'moderate' : 'high';
    }

    function renderPerformanceModeHint(mode) {
        if (!performanceModeHint || !btnApplyUltraFastRecommendation) return;

        const activeMode = String(mode || 'custom').toLowerCase();
        const tier = getDevicePerformanceTier();

        if (activeMode === 'ultrafast' || tier === 'high') {
            performanceModeHint.style.display = 'none';
            performanceModeHint.textContent = '';
            btnApplyUltraFastRecommendation.style.display = 'none';
            return;
        }

        if (tier === 'low') {
            performanceModeHint.textContent = t('options_mode_perf_hint_low', 'This device may perform better with Ultra Fast Mode (text-first, lower CPU/GPU load).');
            performanceModeHint.style.display = 'block';
            btnApplyUltraFastRecommendation.style.display = 'inline-flex';
            return;
        }

        performanceModeHint.textContent = t('options_mode_perf_hint_mid', 'Ultra Fast Mode can reduce lag during heavy sessions on this device.');
        performanceModeHint.style.display = 'block';
        btnApplyUltraFastRecommendation.style.display = 'inline-flex';
    }

    function renderModeRecommendationBadge(mode) {
        if (!modeRecommendationBadge) return;

        const activeMode = String(mode || 'custom').toLowerCase();
        const tier = getDevicePerformanceTier();

        modeRecommendationBadge.classList.remove('rec-low', 'rec-mid', 'rec-ok');

        if (tier === 'high') {
            modeRecommendationBadge.textContent = t('options_mode_recommendation_balanced', 'Balanced: current mode is fine');
            modeRecommendationBadge.classList.add('rec-ok');
            modeRecommendationBadge.style.display = 'inline-flex';
            return;
        }

        if (activeMode === 'ultrafast') {
            modeRecommendationBadge.textContent = t('options_mode_recommendation_active', 'Recommended mode active');
            modeRecommendationBadge.classList.add('rec-ok');
            modeRecommendationBadge.style.display = 'inline-flex';
            return;
        }

        if (tier === 'low') {
            modeRecommendationBadge.textContent = t('options_mode_recommendation_low', 'Recommended: Ultra Fast');
            modeRecommendationBadge.classList.add('rec-low');
            modeRecommendationBadge.style.display = 'inline-flex';
            return;
        }

        modeRecommendationBadge.textContent = t('options_mode_recommendation_mid', 'Optional: Ultra Fast for heavy sessions');
        modeRecommendationBadge.classList.add('rec-mid');
        modeRecommendationBadge.style.display = 'inline-flex';
    }

    function renderModeWhyLine(mode) {
        if (!modeWhyLine) return;

        const activeMode = String(mode || 'custom').toLowerCase();
        const tier = getDevicePerformanceTier();

        const byMode = {
            custom: t('options_mode_why_custom', 'Why: uses only your manual toggle choices.'),
            clean: t('options_mode_why_clean', 'Why: removes common clutter while keeping a familiar feed feel.'),
            focus: t('options_mode_why_focus', 'Why: tuned for deep focus with stronger distraction cuts.'),
            ultrafast: t('options_mode_why_ultrafast', 'Why: prioritizes speed by reducing heavy feed processing.'),
            smart: t('options_mode_why_smart', 'Why: balances cleanup with scoring and credibility signals.'),
            classic: t('options_mode_why_classic', 'Why: emphasizes chronological, old-school feed behavior.')
        };

        let text = byMode[activeMode] || byMode.custom;

        if (activeMode !== 'ultrafast') {
            if (tier === 'low') {
                text += ` ${t('options_mode_why_device_low', 'Device note: Ultra Fast is recommended on this hardware.')}`;
            } else if (tier === 'moderate') {
                text += ` ${t('options_mode_why_device_mid', 'Device note: Ultra Fast can help during heavy sessions.')}`;
            }
        }

        modeWhyLine.textContent = text;
    }

    function renderQuickModeActiveState(mode) {
        const activeMode = String(mode || 'custom').toLowerCase();
        const buttonMap = [
            { mode: 'clean', btn: btnQuickModeClean },
            { mode: 'ultrafast', btn: btnQuickModeFast },
            { mode: 'smart', btn: btnQuickModeSmart }
        ];

        buttonMap.forEach(({ mode: targetMode, btn }) => {
            if (!btn) return;
            const isActive = activeMode === targetMode;
            btn.classList.toggle('pf-btn-mode-active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    async function applyQuickMode(mode, successToast) {
        if (!experienceModeSelect) return;
        experienceModeSelect.value = mode;
        renderExperienceModeProfile(mode);
        renderPerformanceModeHint(mode);
        renderModeRecommendationBadge(mode);
        renderModeWhyLine(mode);
        renderQuickModeActiveState(mode);
        await saveSettingsFromUI(successToast);
    }

    function loadUIFromSettings() {
        // Handle mapped standard inputs
        for (const [domId, mapping] of Object.entries(uiMap)) {
            const el = document.getElementById(domId);
            if (!el) continue;
            
            const val = currentSettings[mapping.obj][mapping.prop];
            if (mapping.type === 'checkbox') el.checked = !!val;
            else if (mapping.type === 'select') el.value = val || '';
            else if (mapping.type === 'number') el.value = Number.isFinite(val) ? val : (mapping.fallback ?? 100);
            else if (mapping.type === 'text') el.value = val || '';
        }

        // Handle Keywords Mapping
        document.getElementById('opt_keywords_blocklist').value = currentSettings.keywords.blocklist.join(', ');
        document.getElementById('opt_keywords_autohide').value = currentSettings.keywords.autohide.join(', ');
        document.getElementById('opt_keywords_sourceBlocklist').value = (currentSettings.keywords.sourceBlocklist || []).join(', ');
        document.getElementById('opt_keywords_allowlist').value = (currentSettings.keywords.allowlist || []).join(', ');
        document.getElementById('opt_keywords_allowlistFriends').value = (currentSettings.keywords.allowlistFriends || []).join(', ');

        renderThemePreview(currentSettings.uiMode.theme, currentSettings.uiMode.fontSizeScale);
        const activeMode = currentSettings.experienceMode?.active || (experienceModeSelect ? experienceModeSelect.value : 'custom');
        renderExperienceModeProfile(activeMode);
        renderPerformanceModeHint(activeMode);
        renderModeRecommendationBadge(activeMode);
        renderModeWhyLine(activeMode);
        renderQuickModeActiveState(activeMode);
        renderRulesList();
    }

    function renderRulesList() {
        if (!pfRulesList) return;
        const rules = currentSettings.rules?.customRules || [];
        
        if (rules.length === 0) {
            pfRulesList.innerHTML = `<p class="pf-desc text-center py-4" data-i18n="options_poweruser_no_rules">${t('options_poweruser_no_rules', 'No custom rules defined yet.')}</p>`;
            return;
        }

        pfRulesList.innerHTML = '';
        rules.forEach(rule => {
            const item = document.createElement('div');
            item.className = `pf-rule-item ${rule.enabled ? '' : 'pf-rule-disabled'}`;
            item.innerHTML = `
                <div class="pf-rule-info">
                    <div class="pf-rule-header">
                        <span class="pf-rule-badge">${rule.type === 'selector' ? t('options_poweruser_type_selector', 'CSS') : t('options_poweruser_type_text', 'Text')}</span>
                        <strong class="pf-rule-name">${rule.label || 'Untitled Rule'}</strong>
                    </div>
                    <code class="pf-rule-selector">${rule.selector}</code>
                    ${rule.wrapper ? `<div class="pf-rule-scope">Scope: <code>${rule.wrapper}</code></div>` : ''}
                </div>
                <div class="pf-rule-item-actions">
                    <div class="pf-toggle-wrap">
                        <label class="pf-toggle-label">${t('options_poweruser_rule_enabled', 'Enabled')}</label>
                        <input type="checkbox" class="pf-toggle pf-rule-toggle" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
                    </div>
                    <button class="pf-btn pf-btn-sm pf-btn-secondary btn-edit-rule" data-id="${rule.id}">${t('options_poweruser_edit_rule', 'Edit')}</button>
                    <button class="pf-btn pf-btn-sm pf-btn-danger btn-delete-rule" data-id="${rule.id}">${t('options_poweruser_delete_rule', 'Delete')}</button>
                </div>
            `;
            pfRulesList.appendChild(item);
        });

        // Attach listeners
        pfRulesList.querySelectorAll('.pf-rule-toggle').forEach(el => {
            el.addEventListener('change', async (e) => {
                const id = e.target.getAttribute('data-id');
                const rule = currentSettings.rules.customRules.find(r => r.id === id);
                if (rule) {
                    rule.enabled = e.target.checked;
                    await saveSettingsFromUI(t('options_toast_rule_updated', 'Rule updated.'));
                    renderRulesList();
                }
            });
        });

        pfRulesList.querySelectorAll('.btn-edit-rule').forEach(el => {
            el.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                const rule = currentSettings.rules.customRules.find(r => r.id === id);
                if (rule) {
                    ruleEditId = id;
                    ruleTypeSelect.value = rule.type;
                    ruleLabelInput.value = rule.label;
                    ruleValueInput.value = rule.selector;
                    ruleWrapperInput.value = rule.wrapper || '';
                    ruleWrapperRow.style.display = rule.type === 'text' ? 'flex' : 'none';
                    pfRuleEditor.classList.remove('active-hidden');
                    pfRuleEditor.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        });

        pfRulesList.querySelectorAll('.btn-delete-rule').forEach(el => {
            el.addEventListener('click', async (e) => {
                if (confirm(t('options_poweruser_delete_confirm', 'Delete this rule?'))) {
                    const id = e.target.getAttribute('data-id');
                    currentSettings.rules.customRules = currentSettings.rules.customRules.filter(r => r.id !== id);
                    await saveSettingsFromUI(t('options_toast_rule_deleted', 'Rule deleted.'));
                    renderRulesList();
                }
            });
        });
    }

    if (btnAddNewRule) {
        btnAddNewRule.addEventListener('click', () => {
            ruleEditId = null;
            ruleLabelInput.value = '';
            ruleValueInput.value = '';
            ruleWrapperInput.value = '';
            pfRuleEditor.classList.remove('active-hidden');
        });
    }

    if (btnCancelRule) {
        btnCancelRule.addEventListener('click', () => {
            pfRuleEditor.classList.add('active-hidden');
            ruleEditId = null;
        });
    }

    if (ruleTypeSelect) {
        ruleTypeSelect.addEventListener('change', () => {
            ruleWrapperRow.style.display = ruleTypeSelect.value === 'text' ? 'flex' : 'none';
        });
    }

    if (btnSaveRule) {
        btnSaveRule.addEventListener('click', async () => {
            const label = ruleLabelInput.value.trim();
            const value = ruleValueInput.value.trim();
            const type = ruleTypeSelect.value;
            const wrapper = ruleWrapperInput.value.trim();

            if (!value) {
                showSaveToast(t('options_toast_rule_value_required', 'Rule value is required.'), true);
                return;
            }

            if (!currentSettings.rules) currentSettings.rules = { customRules: [] };

            if (ruleEditId) {
                const rule = currentSettings.rules.customRules.find(r => r.id === ruleEditId);
                if (rule) {
                    rule.label = label;
                    rule.selector = value;
                    rule.type = type;
                    rule.wrapper = wrapper;
                }
            } else {
                currentSettings.rules.customRules.push({
                    id: 'rule_' + Date.now(),
                    label: label || (type === 'selector' ? 'Custom Selector' : 'Custom Text Match'),
                    type: type,
                    selector: value,
                    wrapper: wrapper,
                    enabled: true
                });
            }

            await saveSettingsFromUI(t('options_toast_rules_saved', 'Custom rules saved successfully.'));
            pfRuleEditor.classList.add('active-hidden');
            ruleEditId = null;
            renderRulesList();
        });
    }

    async function saveSettingsFromUI(successMessageInput = null) {
        const successMessage = typeof successMessageInput === 'string' ? successMessageInput : null;
        // Read mapped standard inputs
        for (const [domId, mapping] of Object.entries(uiMap)) {
            const el = document.getElementById(domId);
            if (!el) continue;

            if (mapping.type === 'checkbox') {
                currentSettings[mapping.obj][mapping.prop] = el.checked;
            } else if (mapping.type === 'select') {
                currentSettings[mapping.obj][mapping.prop] = el.value;
            } else if (mapping.type === 'number') {
                currentSettings[mapping.obj][mapping.prop] = parseInt(el.value, 10) || (mapping.fallback ?? 100);
            } else if (mapping.type === 'text') {
                currentSettings[mapping.obj][mapping.prop] = el.value.trim();
            }
        }

        if (currentSettings.uiMode) {
            const ui = currentSettings.uiMode;
            const clampInt = (value, min, max, fallback) => {
                const parsed = Number(value);
                if (!Number.isFinite(parsed)) return fallback;
                return Math.max(min, Math.min(max, Math.round(parsed)));
            };

            const trimLen = (value, maxLen) => String(value || '').trim().slice(0, maxLen);

            ui.fontSizeScale = clampInt(ui.fontSizeScale, 80, 150, 100);
            ui.customFontFamily = trimLen(ui.customFontFamily, 140);
            ui.customAccentColor = trimLen(ui.customAccentColor, 40);
            ui.customTextColor = trimLen(ui.customTextColor, 40);
            ui.customCardBackground = trimLen(ui.customCardBackground, 40);
            ui.customBackground = trimLen(ui.customBackground, 180);
            ui.customCss = trimLen(ui.customCss, 12000);
        }

        // Parse Keyword comma-separated Arrays
        const blockString = document.getElementById('opt_keywords_blocklist').value;
        const autoString = document.getElementById('opt_keywords_autohide').value;
        const sourceBlockString = document.getElementById('opt_keywords_sourceBlocklist').value;
        const allowString = document.getElementById('opt_keywords_allowlist').value;
        const allowFriendsString = document.getElementById('opt_keywords_allowlistFriends').value;

        currentSettings.keywords.blocklist = blockString.split(',').map(s => s.trim()).filter(s => s.length > 0);
        currentSettings.keywords.autohide = autoString.split(',').map(s => s.trim()).filter(s => s.length > 0);
        currentSettings.keywords.sourceBlocklist = sourceBlockString.split(',').map(s => s.trim()).filter(s => s.length > 0);
        currentSettings.keywords.allowlist = allowString.split(',').map(s => s.trim()).filter(s => s.length > 0);
        currentSettings.keywords.allowlistFriends = allowFriendsString.split(',').map(s => s.trim()).filter(s => s.length > 0);

        if (currentSettings.diagnostics) {
            const clampInt = (value, min, max, fallback) => {
                const parsed = Number(value);
                if (!Number.isFinite(parsed)) return fallback;
                return Math.max(min, Math.min(max, Math.round(parsed)));
            };

            const diagnostics = currentSettings.diagnostics;
            diagnostics.maxReasons = clampInt(diagnostics.maxReasons, 3, 12, 6);
            diagnostics.observerWarnDurationMs = clampInt(diagnostics.observerWarnDurationMs, 8, 200, 25);
            diagnostics.observerSevereDurationMs = clampInt(diagnostics.observerSevereDurationMs, 10, 300, 45);
            diagnostics.observerWarnNodes = clampInt(diagnostics.observerWarnNodes, 40, 3000, 220);
            diagnostics.observerSevereNodes = clampInt(diagnostics.observerSevereNodes, 60, 5000, 420);
            diagnostics.observerWarnRecords = clampInt(diagnostics.observerWarnRecords, 20, 2000, 120);
            diagnostics.observerSevereRecords = clampInt(diagnostics.observerSevereRecords, 30, 3000, 240);

            if (diagnostics.observerSevereDurationMs <= diagnostics.observerWarnDurationMs) {
                diagnostics.observerSevereDurationMs = Math.min(300, diagnostics.observerWarnDurationMs + 5);
            }

            if (diagnostics.observerSevereNodes <= diagnostics.observerWarnNodes) {
                diagnostics.observerSevereNodes = Math.min(5000, diagnostics.observerWarnNodes + 40);
            }

            if (diagnostics.observerSevereRecords <= diagnostics.observerWarnRecords) {
                diagnostics.observerSevereRecords = Math.min(3000, diagnostics.observerWarnRecords + 20);
            }
        }

        if (currentSettings.predictions) {
            const p = currentSettings.predictions;
            const low = Number(p.lowThreshold);
            const high = Number(p.highThreshold);

            p.lowThreshold = Math.max(0, Math.min(95, Number.isFinite(low) ? Math.round(low) : 20));
            p.highThreshold = Math.max(5, Math.min(100, Number.isFinite(high) ? Math.round(high) : 80));

            if (p.highThreshold <= p.lowThreshold) {
                p.highThreshold = Math.min(100, p.lowThreshold + 5);
            }

            p.showScoreReasons = p.showScoreReasons !== false;
            p.collapseLowInterest = !!p.collapseLowInterest;
            p.neverEmptyFeedGuard = p.neverEmptyFeedGuard !== false;
            const keepVisible = Number(p.neverEmptyFeedMinVisiblePosts);
            p.neverEmptyFeedMinVisiblePosts = Math.max(1, Math.min(25, Number.isFinite(keepVisible) ? Math.round(keepVisible) : 3));
            p.credibilitySignalsEnabled = !!p.credibilitySignalsEnabled;
            p.showCredibilityBadge = p.showCredibilityBadge !== false;
            p.strictCredibilityPenalty = !!p.strictCredibilityPenalty;
            p.showCredibilityDebugPreview = !!p.showCredibilityDebugPreview;
        }

        if (currentSettings.social) {
            const s = currentSettings.social;
            const clampInt = (value, min, max, fallback) => {
                const parsed = Number(value);
                if (!Number.isFinite(parsed)) return fallback;
                return Math.max(min, Math.min(max, Math.round(parsed)));
            };

            s.commentPreviewCooldownMs = clampInt(s.commentPreviewCooldownMs, 300, 5000, 1200);
            s.commentPreviewRetryCap = clampInt(s.commentPreviewRetryCap, 1, 10, 4);
            s.commentPreviewMaxPostsPerSweep = clampInt(s.commentPreviewMaxPostsPerSweep, 10, 60, 30);

            s.commentPreviewAllowHome = s.commentPreviewAllowHome !== false;
            s.commentPreviewAllowGroups = !!s.commentPreviewAllowGroups;
            s.commentPreviewAllowWatch = !!s.commentPreviewAllowWatch;
            s.commentPreviewAllowMarketplace = !!s.commentPreviewAllowMarketplace;
            s.commentPreviewAllowNotifications = !!s.commentPreviewAllowNotifications;
            s.commentPreviewAllowOther = !!s.commentPreviewAllowOther;
        }

        if (currentSettings.wellbeing) {
            const parsedScrollLimit = Number(currentSettings.wellbeing.scrollLimitPosts);
            currentSettings.wellbeing.scrollLimitPosts = Math.max(10, Math.min(100, Number.isFinite(parsedScrollLimit) ? Math.round(parsedScrollLimit) : 20));

            const parsedSessionAwarenessThreshold = Number(currentSettings.wellbeing.sessionAwarenessScrollsPerMinuteThreshold);
            currentSettings.wellbeing.sessionAwarenessScrollsPerMinuteThreshold = Math.max(30, Math.min(220, Number.isFinite(parsedSessionAwarenessThreshold) ? Math.round(parsedSessionAwarenessThreshold) : 85));

            const parsedSessionAwarenessCooldown = Number(currentSettings.wellbeing.sessionAwarenessCooldownMinutes);
            currentSettings.wellbeing.sessionAwarenessCooldownMinutes = Math.max(2, Math.min(90, Number.isFinite(parsedSessionAwarenessCooldown) ? Math.round(parsedSessionAwarenessCooldown) : 12));
            currentSettings.wellbeing.sessionAwarenessEnabled = !!currentSettings.wellbeing.sessionAwarenessEnabled;

            const parsedReelsLimit = Number(currentSettings.wellbeing.reelsSessionLimit);
            currentSettings.wellbeing.reelsSessionLimit = Math.max(1, Math.min(20, Number.isFinite(parsedReelsLimit) ? parsedReelsLimit : 3));

            const parsedReportMinutes = Number(currentSettings.wellbeing.dailyFeedReportAutoMinutes);
            currentSettings.wellbeing.dailyFeedReportAutoMinutes = Math.max(5, Math.min(180, Number.isFinite(parsedReportMinutes) ? Math.round(parsedReportMinutes) : 30));
            currentSettings.wellbeing.dailyFeedReportEnabled = !!currentSettings.wellbeing.dailyFeedReportEnabled;
        }

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
            showSaveToast(successMessage || t('options_toast_saved', 'Settings saved successfully.'));
        }
        broadcastUpdate();
    }

    // =========================================================================
    // Actions
    // =========================================================================

    const btnSaveTop = document.getElementById('btnSaveTop');
    const btnSaveBottom = document.getElementById('btnSaveBottom');
    
    [btnSaveTop, btnSaveBottom]
        .filter(Boolean)
        .forEach((button) => button.addEventListener('click', () => {
            saveSettingsFromUI();
        }));

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

    // ── Beta feature confirmation: Auto Comment Preview ──────────────────────
    // Show a confirmation dialog the first time the user turns this on.
    // If they cancel, immediately revert the checkbox.
    const autoCommentPreviewToggle = document.getElementById('opt_social_autoCommentPreview');
    if (autoCommentPreviewToggle) {
        autoCommentPreviewToggle.addEventListener('change', () => {
            if (!autoCommentPreviewToggle.checked) return; // turning off is always fine

            const confirmed = window.confirm(
                '⚠ Auto Comment Preview — Beta Feature\n\n' +
                'This feature simulates clicks on Facebook posts to expand comment sections as you scroll.\n\n' +
                'Important:\n' +
                '• It is experimental and may not work on all posts.\n' +
                '• It may stop working after Facebook layout updates.\n' +
                '• High sweep-cap settings may look like bot activity to Facebook.\n' +
                '• Keep cooldown ≥ 1200 ms and max posts per sweep ≤ 15 when testing.\n\n' +
                'Enable anyway?'
            );

            if (!confirmed) {
                // Revert the checkbox without triggering another change event
                autoCommentPreviewToggle.checked = false;
            }
        });
    }

    if (themeSelect) {
        themeSelect.addEventListener('change', () => {
            renderThemePreview(themeSelect.value, fontScaleInput ? fontScaleInput.value : 100);
        });
    }

    if (experienceModeSelect) {
        experienceModeSelect.addEventListener('change', () => {
            renderExperienceModeProfile(experienceModeSelect.value);
            renderPerformanceModeHint(experienceModeSelect.value);
            renderModeRecommendationBadge(experienceModeSelect.value);
            renderModeWhyLine(experienceModeSelect.value);
            renderQuickModeActiveState(experienceModeSelect.value);
        });
    }

    if (btnApplyUltraFastRecommendation && experienceModeSelect) {
        btnApplyUltraFastRecommendation.addEventListener('click', async () => {
            await applyQuickMode('ultrafast', t('options_toast_ultrafast_applied', 'Ultra Fast Mode applied for this device.'));
        });
    }

    if (btnQuickModeClean) {
        btnQuickModeClean.addEventListener('click', async () => {
            await applyQuickMode('clean', t('options_toast_mode_clean_applied', 'Clean Mode applied.'));
        });
    }

    if (btnQuickModeFast) {
        btnQuickModeFast.addEventListener('click', async () => {
            await applyQuickMode('ultrafast', t('options_toast_ultrafast_applied', 'Ultra Fast Mode applied for this device.'));
        });
    }

    if (btnQuickModeSmart) {
        btnQuickModeSmart.addEventListener('click', async () => {
            await applyQuickMode('smart', t('options_toast_mode_smart_applied', 'Smart Mode applied.'));
        });
    }

    if (fontScaleInput) {
        fontScaleInput.addEventListener('input', () => {
            renderThemePreview(themeSelect ? themeSelect.value : 'default', fontScaleInput.value);
        });
    }

    if (btnApplyPreset && presetSelect) {
        btnApplyPreset.addEventListener('click', async () => {
            const presetName = presetSelect.value;
            const preset = presetPacks[presetName];
            if (!preset) return;

            currentSettings = mergeDeep(currentSettings, JSON.parse(JSON.stringify(preset)));
            loadUIFromSettings();
            await saveSettingsFromUI(t('options_toast_preset_applied', 'Preset applied successfully.'));
        });
    }

    if (btnApplyCustomCssSnippet && customCssSnippetSelect && customCssTextarea) {
        btnApplyCustomCssSnippet.addEventListener('click', () => {
            const selected = customCssSnippetSelect.value;
            const snippet = customCssSnippets[selected];
            if (!snippet) return;

            const block = `/* PureFusion snippet: ${snippet.label} */\n${snippet.css}`;
            const current = String(customCssTextarea.value || '').trim();

            if (!current) {
                customCssTextarea.value = block;
            } else if (!current.includes(snippet.css)) {
                customCssTextarea.value = `${current}\n\n${block}`;
            }

            if (customStylingToggle) customStylingToggle.checked = true;
            customCssSnippetSelect.value = '';
            showSaveToast(t('options_toast_custom_css_snippet_loaded', 'Custom CSS snippet loaded. Click Save to apply.'));
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

    // =========================================================================
    // AI Source Manager — pf_blocklist / pf_allowlist
    // These are stored directly in local storage (not in the main settings
    // object) by the Insight Chip predictor. This UI provides centralized
    // management so users don't need to find individual posts to unblock/untrust.
    // =========================================================================

    async function loadSourceManager() {
        const blocklist = await PF_Storage.getLocalData('pf_blocklist');
        const allowlist = await PF_Storage.getLocalData('pf_allowlist');

        const blocklistArr = Array.isArray(blocklist) ? blocklist : [];
        const allowlistArr = Array.isArray(allowlist) ? allowlist : [];

        renderSourceList(
            'pf-blocklist-list',
            'pf-blocklist-count',
            blocklistArr,
            'blocked',
            'No blocked sources yet. Use "Block source" in the Insight Chip on any Facebook post.',
            async (nameToRemove) => {
                const updated = blocklistArr.filter((n) => n !== nameToRemove);
                await PF_Storage.setLocalData('pf_blocklist', updated);
                showSaveToast(`"${nameToRemove}" removed from blocklist.`);
                loadSourceManager();
            }
        );

        renderSourceList(
            'pf-allowlist-list',
            'pf-allowlist-count',
            allowlistArr,
            'trusted',
            'No trusted sources yet. Use "Always show source" in the Insight Chip on any Facebook post.',
            async (nameToRemove) => {
                const updated = allowlistArr.filter((n) => n !== nameToRemove);
                await PF_Storage.setLocalData('pf_allowlist', updated);
                showSaveToast(`"${nameToRemove}" removed from trusted sources.`);
                loadSourceManager();
            }
        );
    }

    function renderSourceList(listId, countId, items, countLabel, emptyMsg, onRemove) {
        const listEl  = document.getElementById(listId);
        const countEl = document.getElementById(countId);
        if (!listEl) return;

        if (countEl) countEl.textContent = `${items.length} ${countLabel}`;

        if (!items.length) {
            listEl.innerHTML = `<p class="pf-source-empty pf-desc">${emptyMsg}</p>`;
            return;
        }

        listEl.innerHTML = '';
        items.forEach((name) => {
            const row = document.createElement('div');
            row.className = 'pf-source-row';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'pf-source-name';
            nameSpan.textContent = name;

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'pf-btn pf-btn-danger pf-btn-xs';
            removeBtn.textContent = 'Remove';
            removeBtn.addEventListener('click', () => onRemove(name));

            row.appendChild(nameSpan);
            row.appendChild(removeBtn);
            listEl.appendChild(row);
        });
    }

    async function addToSourceList(storageKey, inputId, countLabel) {
        const inputEl = document.getElementById(inputId);
        const name = String(inputEl?.value || '').trim();
        if (!name) return;

        const current = await PF_Storage.getLocalData(storageKey);
        const arr = Array.isArray(current) ? current : [];

        if (arr.includes(name)) {
            showSaveToast(`"${name}" is already in the ${countLabel} list.`, true);
            return;
        }

        arr.push(name);
        await PF_Storage.setLocalData(storageKey, arr);
        if (inputEl) inputEl.value = '';
        showSaveToast(`"${name}" added to ${countLabel} list.`);
        loadSourceManager();
    }

    // Clear All
    document.getElementById('btnClearBlocklist')?.addEventListener('click', async () => {
        const current = await PF_Storage.getLocalData('pf_blocklist');
        const count = Array.isArray(current) ? current.length : 0;
        if (!count) { showSaveToast('Blocklist is already empty.'); return; }
        if (!confirm(`Clear all ${count} blocked source${count !== 1 ? 's' : ''}? They will reappear on next page load.`)) return;
        await PF_Storage.setLocalData('pf_blocklist', []);
        showSaveToast('Blocklist cleared.');
        loadSourceManager();
    });

    document.getElementById('btnClearAllowlist')?.addEventListener('click', async () => {
        const current = await PF_Storage.getLocalData('pf_allowlist');
        const count = Array.isArray(current) ? current.length : 0;
        if (!count) { showSaveToast('Trusted sources list is already empty.'); return; }
        if (!confirm(`Clear all ${count} trusted source${count !== 1 ? 's' : ''}?`)) return;
        await PF_Storage.setLocalData('pf_allowlist', []);
        showSaveToast('Trusted sources list cleared.');
        loadSourceManager();
    });

    // Add entries
    document.getElementById('btnAddToBlocklist')?.addEventListener('click', () => {
        addToSourceList('pf_blocklist', 'pf-blocklist-add-input', 'blocked');
    });
    document.getElementById('btnAddToAllowlist')?.addEventListener('click', () => {
        addToSourceList('pf_allowlist', 'pf-allowlist-add-input', 'trusted');
    });

    // Enter key support
    document.getElementById('pf-blocklist-add-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('btnAddToBlocklist')?.click();
    });
    document.getElementById('pf-allowlist-add-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('btnAddToAllowlist')?.click();
    });

    // Initial load
    loadSourceManager();

});
