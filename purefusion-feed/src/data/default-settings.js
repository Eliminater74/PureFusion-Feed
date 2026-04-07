/**
 * PureFusion Feed - Default Settings
 * 
 * Central configuration object defining the default toggles and states
 * for all extension features. This is loaded if user has no saved settings.
 */

const DEFAULT_SETTINGS = {
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
        removeColoredBackgrounds: true, // Giant font/colored posts -> standard text
        removeLargeReactions: true,     // Downsize large emoji reactions
    },

    // ------------------------------------------------------------------------
    // UI TWEAKS & LAYOUT
    // ------------------------------------------------------------------------
    uiMode: {
        forceMostRecent: true,          // Automatically redirect/force chronological feed
        compactMode: false,             // Reduce whitespace and margins
        widescreenMode: false,          // Expand feed width for ultrawide monitors
        fontSizeScale: 100,             // Numeric percentage (80 - 140)
        theme: 'default',               // 'default', 'darkPro', 'amoled', 'classicBlue'
        commentSortDefault: 'All Comments', // 'All Comments', 'Newest', 'Top Comments'
        disableCommentAutofocus: true,  // Stop FB from hijacking focus
        showLinkPreviews: true,         // Anti-phishing real destination hover
        fixTimestamps: true,            // Show absolute Date/Time instead of "3 hours ago"
        hideMessengerSeen: false,       // Hide "Seen" receipts
        distractionFreeMode: false,     // Default state of 'Alt+Shift+F' reading mode
    },

    // ------------------------------------------------------------------------
    // AI PREDICTION ENGINE
    // ------------------------------------------------------------------------
    predictions: {
        enabled: true,                  // Master switch for local prediction AI
        showBadge: true,                // Display "PF Score" on posts
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
        // Left Nav
        hideLeftMarketplace: false,
        hideLeftGaming: false,
        hideLeftWatch: false,
        hideLeftMemories: false,
        hideLeftMetaAI: true,
        fixTimestamps: true,
        showLinkPreviews: true,
        disableCommentAutofocus: true,
        widescreenMode: false,
        enforceChronologicalFeed: false,
        // Right Col
        hideRightTrending: true,
        hideRightContacts: false,
        hideRightEvents: false,
        hideRightBirthdays: false,
    },

    // ------------------------------------------------------------------------
    // SOCIAL & NOTIFICATIONS
    // ------------------------------------------------------------------------
    social: {
        trackUnfriends: true,           // Compare friends list locally to detect unfriend/block
        trackDeactivated: true,         // Surf for missing/404 friends
        notificationDigestMode: false,  // If true, groups notifications by hour
        // Notification filters
        blockNotifGames: true,
        blockNotifBirthdays: false,
        blockNotifMarketplace: true,
    },

    // ------------------------------------------------------------------------
    // DIGITAL WELLBEING (Phase 10)
    // ------------------------------------------------------------------------
    wellbeing: {
        grayscaleMode: false,           // Break addictive bright colors
        infiniteScrollStopper: false,   // Pause observer rendering after X posts
        scrollLimitPosts: 20,           // Number of posts before showing "Take a break" button
        sessionTimer: false,            // Render floating clock representing time on FB
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
        clickbaitDecoder: true          // Rewrite headlines instead of just blocking
    }
};

// Make available to closure scope or ES module system
if (typeof module !== 'undefined') module.exports = { DEFAULT_SETTINGS };
if (typeof window !== 'undefined') window.PF_DEFAULT_SETTINGS = DEFAULT_SETTINGS;
