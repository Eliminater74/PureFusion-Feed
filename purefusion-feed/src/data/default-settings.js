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
        filterLocale: 'auto',           // Phrase-pack language scope: 'auto'|'en'|'es'|'fr'|'de'|'nl'|'sv'|'da'|'no'
        removeAds: true,                // Hard ad-infrastructure signals (href/_cft_ markers)
        removeSponsored: false,         // Soft "Sponsored" label detection (text/aria heuristics — separate for testing)
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
        hideVideoPosts: false,          // Hide feed posts primarily classified as video
        hidePhotoPosts: false,          // Hide feed posts primarily classified as photo/image
        hideLinkPosts: false,           // Hide feed posts primarily classified as external link/share
        hideTextOnlyPosts: false,       // Hide feed posts classified as text-only status updates
        hideLiveVideoPosts: false,      // Hide Facebook Live / live-replay posts specifically
        hideShareReposts: false,        // Hide posts that are reshares of another person's content
        hidePollPosts: false,           // Hide Facebook poll posts
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
        customTextColor: '',
        customCardBackground: '',
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
        hidePostComposer: false,        // Hide 'What's on your mind?' box
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
        collapseLowInterest: false,     // Hide low-score posts behind reveal chip
        neverEmptyFeedGuard: true,      // Keep at least N feed posts visible when low-score collapse is active
        neverEmptyFeedMinVisiblePosts: 3,
        highlightHighInterest: true,    // Glow posts scoring above threshold
        credibilitySignalsEnabled: false, // Heuristic claim-risk detector (local only)
        showCredibilityBadge: true,     // Show "verify" marker on suspicious claims
        strictCredibilityPenalty: false,// Apply stronger score penalty to suspicious claims
        showCredibilityDebugPreview: false, // Show detector points on all scanned posts
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
        sourceBlocklist: [],            // Source names (people/pages/groups) to always hide
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
        hideGaming: false,          // Gaming/Play tab (account-dependent)
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
        commentPreviewStrategy: 'inject', // Strategy for expansion: 'inject' (v3) or 'click' (v2)
        commentPreviewCooldownMs: 1200, // Min delay between simulated preview clicks
        commentPreviewRetryCap: 4,      // Max retries per post before giving up
        commentPreviewMaxPostsPerSweep: 30,
        commentPreviewAllowHome: true,
        commentPreviewAllowGroups: true,          // Groups / Forums enabled by default
        commentPreviewAllowWatch: false,
        commentPreviewAllowMarketplace: false,
        commentPreviewAllowNotifications: false,
        commentPreviewAllowOther: true,            // Profile pages / events / etc.
        hideMetaAI: true,               // Nuke gradient icons and sparkle buttons
        hideMessengerTyping: true,      // Hide typing indicators (DOM level)
        messengerPrivacyBlur: false,    // Blur chat previews until hover
        // Messenger Enhancements (Phase 43)
        alwaysShowMessageTimestamps: false, // Force message timestamps always visible (messenger.com)
        messengerMarkAllRead: false,        // Inject "Mark all read" button in conversation list
        messengerConversationFilter: false, // Inject All/Unread/Groups filter bar above chat list
        detectUnsends: false,               // Flag removed messages with a placeholder
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
        sessionAwarenessEnabled: false, // Soft prompt when sustained high scroll velocity is detected
        sessionAwarenessScrollsPerMinuteThreshold: 85,
        sessionAwarenessCooldownMinutes: 12,
        dailyFeedReportEnabled: false,  // Show periodic session impact report
        dailyFeedReportAutoMinutes: 30, // Auto-report cadence in minutes
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
        smartCommentEnabled: true,      // Inject Co-Pilot into comment boxes (feed posts)
        smartCommentOnMessenger: false, // Also inject Co-Pilot into Messenger chat popup composers (default OFF — causes jitter)
        clickbaitDecoder: true,         // Rewrite headlines instead of just blocking
        messengerRewriteEnabled: true,
        messengerSmartRepliesEnabled: true
    },
    // ------------------------------------------------------------------------
    // POWER-USER RULES (Phase 12)
    // ------------------------------------------------------------------------
    rules: {
        customRules: [] // Array of { id, type, selector, label, enabled }
    },
    // ------------------------------------------------------------------------
    // MARKETPLACE LOCAL FILTER (Phase 44)
    // ------------------------------------------------------------------------
    marketplace: {
        enabled: false,             // Master toggle — off by default
        maxDistanceMiles: 25,       // Hide listings beyond this distance (5–100; 100 = no limit)
        hideUnknownDistance: false, // Hide listings whose cards show no distance text
    },

    // ------------------------------------------------------------------------
    // SUPPORT & LINKS
    // ------------------------------------------------------------------------
    supportUrl: 'https://www.paypal.com/donate/?business=X76ZW4RHA6T9C&no_recurring=0&item_name=PureFusion+returns+feed+control+to+you.+Support+our+independent%2C+private%2C+ad-free+social+tools.+Keep+your+feed+pure%21&currency_code=USD'
};

// Make available to closure scope or ES module system
if (typeof module !== 'undefined') module.exports = { DEFAULT_SETTINGS };
if (typeof window !== 'undefined') window.PF_DEFAULT_SETTINGS = DEFAULT_SETTINGS;
