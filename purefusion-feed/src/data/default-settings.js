/**
 * PureFusion Feed - Default Settings
 * 
 * Central configuration object defining the default toggles and states
 * for all extension features. This is loaded if user has no saved settings.
 */

const DEFAULT_SETTINGS = {
    enabled: true,

    // ------------------------------------------------------------------------
    // CORE FILTERS (Ads & Spam)
    // ------------------------------------------------------------------------
    filters: {
        removeAds: true,                // Sponsored posts, right-col ads
        removeSuggested: true,          // "Suggested for you"
        removePYMK: true,               // "People You May Know"
        removeGroupSuggestions: true,   // "Suggested Groups"
        removePageSuggestions: true,    // "Suggested Pages"
        removeGameInvites: true,        // Web game notifications/invites
        hideReels: true,                // Reels injected into feed
        hideMarketplace: true,          // Marketplace injected into feed
        hideStories: false,             // Stories bar top of feed
        hideMemories: false,            // "Memories" posts
        hideFundraisers: true,          // Fundraiser posts
        removeColoredBackgrounds: true, // Giant font/colored posts -> standard text
        removeLargeReactions: true,     // Downsize large emoji reactions
    },

    // ------------------------------------------------------------------------
    // STORY ACTIVITY FILTERS
    // ------------------------------------------------------------------------
    storyFilters: {
        hideBecameFriends: false,
        hideJoinedGroups: false,
        hideCommentedOnThis: false,
        hideLikedThis: false,
        hideAttendingEvents: false,
        hideSharedMemories: false,
        hideProfilePhotoUpdates: false,
        hideCoverPhotoUpdates: false,
        hideLifeEvents: false,
        hideCheckIns: false,
        hideMilestones: false,
        hideJobWorkUpdates: false,
        hideRelationshipUpdates: false,
        hideGroupActivityPosts: false
    },

    // ------------------------------------------------------------------------
    // IMAGE SUBJECT FILTERS
    // ------------------------------------------------------------------------
    imageFilters: {
        enabled: false,
        hideSports: false,
        hideFood: false,
        hidePets: false,
        hideVehicles: false,
        hideScreenshotsMemes: false,
        hideTravelScenery: false
    },

    // ------------------------------------------------------------------------
    // SURFACE SCOPE CONTROLS
    // ------------------------------------------------------------------------
    surfaceControls: {
        enabled: false,
        applyHome: true,
        applyGroups: true,
        applyWatch: true,
        applyMarketplace: true,
        applyOther: true
    },

    // ------------------------------------------------------------------------
    // FEED EXPERIENCE MODES
    // ------------------------------------------------------------------------
    experienceMode: {
        active: 'custom' // custom, clean, focus, smart, classic
    },

    // ------------------------------------------------------------------------
    // UI TWEAKS & LAYOUT
    // ------------------------------------------------------------------------
    uiMode: {
        forceMostRecent: false,
        enforceChronologicalFeed: false,
        compactMode: false,             // Reduce whitespace and margins
        widescreenMode: false,          // Expand feed width for ultrawide monitors
        fontSizeScale: 100,             // Numeric percentage (80 - 140)
        theme: 'default',               // 'default', 'darkPro', 'amoled', 'classicBlue'
        customStylingEnabled: false,
        customFontFamily: '',
        customAccentColor: '',
        customBackground: '',
        customCss: '',
        commentSortDefault: 'All Comments', // 'All Comments', 'Newest', 'Top Comments'
        disableCommentAutofocus: true,  // Stop FB from hijacking focus
        showLinkPreviews: true,         // Anti-phishing real destination hover
        fixTimestamps: true,            // Show absolute Date/Time instead of "3 hours ago"
        hideMessengerSeen: false,       // Hide "Seen" receipts
        notificationJewelStyle: 'classic', // 'classic', 'blue', 'grey', 'hidden'
        distractionFreeMode: false,     // Default state of 'Alt+Shift+F' reading mode
        friendsOnlyMode: false,         // Hide Groups and Pages
        anonymizerMode: false,          // Blur names and profile pictures
    },

    // ------------------------------------------------------------------------
    // AI PREDICTION ENGINE
    // ------------------------------------------------------------------------
    predictions: {
        enabled: true,                  // Master switch for local prediction AI
        trueAffinitySort: false,
        showBadge: true,                // Display "PF Score" on posts
        showScoreReasons: true,         // Show compact signal reasons on PF badge
        dimLowInterest: true,           // Dim posts scoring below threshold
        highlightHighInterest: true,    // Glow posts scoring above threshold
        lowThreshold: 20,
        highThreshold: 80,
        showTrending: true,             // "Trending in your feed" sidecar
        showFriendActivity: true,       // Warn about silent friends
    },

    // ------------------------------------------------------------------------
    // TEXT KEYWORD FILTERING
    // ------------------------------------------------------------------------
    keywords: {
        blocklist: [],                  // Array of strings/regex. Collapses post.
        autohide: [],                   // Array of strings/regex. Completely removes post.
        allowlist: [],                  // Keywords that bypass blocking
        allowlistFriends: [],           // FB user IDs or Names to never block
    },

    // ------------------------------------------------------------------------
    // SIDEBAR & COMPONENT VISIBILITY
    // ------------------------------------------------------------------------
    sidebar: {
        enableModuleFilters: false,
        // Left Nav
        hideLeftMarketplace: false,
        hideLeftGaming: false,
        hideLeftWatch: false,
        hideLeftMemories: false,
        hideLeftMetaAI: false,
        hideLeftManusAI: false,
        fixTimestamps: true,
        showLinkPreviews: true,
        disableCommentAutofocus: true,
        widescreenMode: false,
        enforceChronologicalFeed: false,
        // Right Col
        hideRightTrending: false,
        hideRightContacts: false,
        hideRightMetaAIContact: false,
        hideRightManusAIContact: false,
        hideRightEvents: false,
        hideRightBirthdays: false,
    },

    // ------------------------------------------------------------------------
    // TOP HEADER CONTROLS
    // ------------------------------------------------------------------------
    topbarFilters: {
        enabled: false,
        hideHome: false,
        hideFriends: false,
        hideWatch: false,
        hideMarketplace: false,
        hideGroups: false,
        hideMessenger: false,
        hideNotifications: false,
        hideMenu: false,
        hideCreate: false
    },

    // ------------------------------------------------------------------------
    // DIAGNOSTICS
    // ------------------------------------------------------------------------
    diagnostics: {
        enabled: false,
        showOverlay: true,
        compactOverlay: false,
        verboseConsole: false,
        maxReasons: 6,
        observerWarnDurationMs: 25,
        observerSevereDurationMs: 45,
        observerWarnNodes: 220,
        observerSevereNodes: 420,
        observerWarnRecords: 120,
        observerSevereRecords: 240
    },

    // ------------------------------------------------------------------------
    // SOCIAL & NOTIFICATIONS
    // ------------------------------------------------------------------------
    social: {
        trackUnfriends: true,           // Compare friends list locally to detect unfriend/block
        trackDeactivated: true,         // Surf for missing/404 friends
        notificationDigestMode: false,  // If true, groups notifications by hour
        autoCommentPreview: false,      // Auto-expand inline comments for visible feed posts
        hideMetaAI: true,               // Nuke gradient icons and sparkle buttons
        hideMessengerTyping: true,      // Hide typing indicators (DOM level)
        messengerPrivacyBlur: false,    // Blur chat previews until hover
        // Notification filters
        blockNotifGames: true,
        blockNotifBirthdays: false,
        blockNotifMarketplace: true,
        blockNotifEngagement: false,
        hideSearchPopupSuggestions: false,
        hideSearchTrending: false,
        hideSearchRecent: false,
    },

    // ------------------------------------------------------------------------
    // DIGITAL WELLBEING (Phase 10)
    // ------------------------------------------------------------------------
    wellbeing: {
        grayscaleMode: false,           // Break addictive bright colors
        infiniteScrollStopper: false,   // Pause observer rendering after X posts
        scrollLimitPosts: 20,           // Number of posts before showing "Take a break" button
        sessionTimer: false,            // Render floating clock representing time on FB
        reelsLimiterEnabled: false,     // Allow only N reels/shorts per session
        reelsSessionLimit: 3,
        reelsHardLock: false,           // If true, keep reels blocked after threshold
        clickbaitBlocker: true,         // Automatically collapse known clickbait phrases
        ragebaitDetector: true,         // Uses AI Predictor to negative-score intentionally inflammatory posts
    },

    // ------------------------------------------------------------------------
    // LLM INTEGRATION (Phase 12)
    // ------------------------------------------------------------------------
    llm: {
        provider: 'none',               // 'none', 'openai', 'gemini', 'windowai'
        openAIApiKey: '',               // Secure local storage only
        geminiApiKey: '',               // Secure local storage only
        tldrEnabled: true,              // Inject summarize buttons
        smartCommentEnabled: true,      // Inject Co-Pilot into comment boxes
        clickbaitDecoder: true,         // Rewrite headlines instead of just blocking
        messengerRewriteEnabled: true,
        messengerSmartRepliesEnabled: true
    },
    // ------------------------------------------------------------------------
    // SUPPORT & LINKS
    // ------------------------------------------------------------------------
    supportUrl: 'https://www.paypal.com/donate/?business=X76ZW4RHA6T9C&no_recurring=0&item_name=PureFusion+returns+feed+control+to+you.+Support+our+independent%2C+private%2C+ad-free+social+tools.+Keep+your+feed+pure%21&currency_code=USD'
};

// Make available to closure scope or ES module system
if (typeof module !== 'undefined') module.exports = { DEFAULT_SETTINGS };
if (typeof window !== 'undefined') window.PF_DEFAULT_SETTINGS = DEFAULT_SETTINGS;
