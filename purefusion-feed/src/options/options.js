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
        'opt_filters_hideVideoPosts': { obj: 'filters', prop: 'hideVideoPosts', type: 'checkbox' },
        'opt_filters_hidePhotoPosts': { obj: 'filters', prop: 'hidePhotoPosts', type: 'checkbox' },
        'opt_filters_hideLinkPosts': { obj: 'filters', prop: 'hideLinkPosts', type: 'checkbox' },
        'opt_filters_hideTextOnlyPosts': { obj: 'filters', prop: 'hideTextOnlyPosts', type: 'checkbox' },
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
        'opt_uiMode_fontSizeScale': { obj: 'uiMode', prop: 'fontSizeScale', type: 'number' },
        'opt_uiMode_customStylingEnabled': { obj: 'uiMode', prop: 'customStylingEnabled', type: 'checkbox' },
        'opt_uiMode_customFontFamily': { obj: 'uiMode', prop: 'customFontFamily', type: 'text' },
        'opt_uiMode_customAccentColor': { obj: 'uiMode', prop: 'customAccentColor', type: 'text' },
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

    const themeNames = {
        default: t('options_ui_theme_default', 'Facebook Default'),
        darkPro: t('options_ui_theme_darkpro', 'Dark Pro'),
        amoled: t('options_ui_theme_amoled', 'AMOLED Pitch Black'),
        classicBlue: t('options_ui_theme_classic', 'Classic Blue')
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
            else if (mapping.type === 'number') el.value = Number.isFinite(val) ? val : (mapping.fallback ?? 100);
            else if (mapping.type === 'text') el.value = val || '';
        }

        // Handle Keywords Mapping
        document.getElementById('opt_keywords_blocklist').value = currentSettings.keywords.blocklist.join(', ');
        document.getElementById('opt_keywords_autohide').value = currentSettings.keywords.autohide.join(', ');
        document.getElementById('opt_keywords_allowlist').value = (currentSettings.keywords.allowlist || []).join(', ');
        document.getElementById('opt_keywords_allowlistFriends').value = (currentSettings.keywords.allowlistFriends || []).join(', ');

        renderThemePreview(currentSettings.uiMode.theme, currentSettings.uiMode.fontSizeScale);
    }

    async function saveSettingsFromUI(successMessage = null) {
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

        // Parse Keyword comma-separated Arrays
        const blockString = document.getElementById('opt_keywords_blocklist').value;
        const autoString = document.getElementById('opt_keywords_autohide').value;
        const allowString = document.getElementById('opt_keywords_allowlist').value;
        const allowFriendsString = document.getElementById('opt_keywords_allowlistFriends').value;

        currentSettings.keywords.blocklist = blockString.split(',').map(s => s.trim()).filter(s => s.length > 0);
        currentSettings.keywords.autohide = autoString.split(',').map(s => s.trim()).filter(s => s.length > 0);
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
