/**
 * PureFusion Feed - Selector Map
 * 
 * Central dictionary for Facebook DOM elements.
 * Facebook heavily relies on obfuscated, generated CSS class names that change frequently.
 * 
 * BEST PRACTICES FOR SELECTORS:
 * - Prefer `aria-label`, `role`, or `data-*` attributes.
 * - Rely on DOM traversal over precise class matching when possible.
 * - Use tag hierarchies (e.g. `svg[aria-label="Sponsored"] svg use`).
 */

const SELECTOR_MAP = {
    // ------------------------------------------------------------------------
    // FEED & POST CONTAINERS
    // ------------------------------------------------------------------------
    
    // The main scrollable feed container (typically role="feed" or main content area)
    mainFeedRegion: '[role="feed"]',
    
    // An individual post within the feed
    postContainer: '[data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"]',

    // ------------------------------------------------------------------------
    // WITHIN A POST
    // ------------------------------------------------------------------------
    
    // The text block of a status message
    postTextBody: '[data-ad-preview="message"]',
    
    // Standard timestamp link which can be modified for absolute dates
    postTimestamp: 'a[role="link"] span[id] > span, a[role="link"] span[dir="auto"]',
    
    // Colored background large font wrapper within a post
    postColoredBackground: '[style*="background-image"], [style*="background-color"] > div[dir="auto"]',

    // ------------------------------------------------------------------------
    // SPAM / ADS / SPONSORED IDENTIFIERS
    // ------------------------------------------------------------------------
    
    // Identifying texts or SVG usages that Facebook translates as "Sponsored"
    // TODO: Verify against current FB markup build as SVGs rotate often.
    sponsoredIndicators: [
        'a[aria-label="Sponsored"]',
        'span[aria-label="Sponsored"]',
        'span:contains("Sponsored")' // Note: standard querySelector doesn't support :contains, we'll polyfill it in helpers
    ],

    // Specific feed unit wrappers Facebook uses for injection
    suggestedForYouWrapper: '[data-pagelet="FeedUnit_Suggested_For_You"]',
    peopleYouMayKnow: '[data-pagelet="NetEgo_PeopleYouMayKnow"]',
    suggestedGroups: '[data-pagelet="NetEgo_SuggestedGroups"]',
    reelsTray: '[data-pagelet="FeedUnit_Reels_Tray"]',
    storiesTray: '[data-pagelet="Stories"]',

    // ------------------------------------------------------------------------
    // LAYOUT PIECES (SIDEBARS, HEADER)
    // ------------------------------------------------------------------------
    
    // Left navigation bar items wrapper
    leftSidebar: '[role="navigation"][aria-label="Facebook"]',
    
    // Right sidebar sections
    rightSidebar: '[role="complementary"]',
    rightSidebarContacts: '[aria-label="Contacts"]',
    rightSidebarSponsored: '[data-pagelet="RightRailAdUnits"]',

    // Top Header
    headerContainer: '[role="banner"]',

    // ------------------------------------------------------------------------
    // COMMENT INTERFACES
    // ------------------------------------------------------------------------
    
    // The clickable dropdown that says "Most relevant" or "All comments"
    commentFilterTrigger: 'div[role="button"][aria-haspopup="menu"]:contains("comment")',
    
    // The input textarea where users type comments
    commentInputBox: 'div[role="textbox"][aria-label*="comment" i]'
};

// Make available globally
if (typeof module !== 'undefined') module.exports = { SELECTOR_MAP };
if (typeof window !== 'undefined') window.PF_SELECTOR_MAP = SELECTOR_MAP;
