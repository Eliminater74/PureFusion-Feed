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
    
    // An individual post within the feed, or a popup modal containing a post
    postContainer: '[data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"], [role="dialog"]',

    // ------------------------------------------------------------------------
    // WITHIN A POST
    // ------------------------------------------------------------------------
    
    // The text block of a status message
    postTextBody: '[data-ad-preview="message"]',
    
    // Standard timestamp link which can be modified for absolute dates
    postTimestamp: 'a[role="link"] span[id] > span, a[role="link"] span[dir="auto"]',
    
    // Colored background large font wrapper within a post
    postColoredBackground: 'div[data-ad-preview="message"][style*="background"], div[data-ad-preview="message"] [style*="background"]',

    // ------------------------------------------------------------------------
    // SPAM / ADS / SPONSORED IDENTIFIERS
    // ------------------------------------------------------------------------
    
    // Identifying texts or SVG usages that Facebook translates as "Sponsored"
    // TODO: Verify against current FB markup build as SVGs rotate often.
    sponsoredIndicators: [
        'a[aria-label="Sponsored"]',
        'span[aria-label="Sponsored"]',
        'a[aria-label="Publicidad"]',
        'span[aria-label="Publicidad"]',
        'span:contains("Sponsored")',
        'span:contains("Publicidad")',
        '[data-testid="fbfeed_ads_native_container"]',
        'a[role="link"] > span[aria-labelledby]' // Matches complex hidden-char spans
    ],

    // Specific feed unit wrappers Facebook uses for injection
    suggestedForYouWrapper: '[data-pagelet="FeedUnit_Suggested_For_You"]',
    peopleYouMayKnow: '[data-pagelet="NetEgo_PeopleYouMayKnow"]',
    suggestedGroups: [
        '[data-pagelet="NetEgo_SuggestedGroups"]',
        'span:contains("Group suggestions")',
        'span:contains("Sugerencias de grupos")'
    ],
    reelsTray: '[data-pagelet="FeedUnit_Reels_Tray"], [data-pagelet^="ShortsAndReels"], [data-pagelet*="Reels"]',
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
    commentFilterTrigger: 'div[role="button"][aria-haspopup="menu"]',
    
    // The input textarea where users type comments. We broadened this to match modals.
    commentInputBox: 'div[role="textbox"][contenteditable="true"]'
};

// Make available globally
if (typeof module !== 'undefined') module.exports = { SELECTOR_MAP };
if (typeof window !== 'undefined') window.PF_SELECTOR_MAP = SELECTOR_MAP;
