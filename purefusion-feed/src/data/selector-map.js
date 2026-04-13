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
    
    // An individual post within the feed, or a popup modal containing a post.
    // Includes pagelet prefixes for Home (FeedUnit_), Groups (GroupsFeedUnit_,
    // GroupFeedUnit_), Pages (PageFeedUnit_), and ad units.
    postContainer: '[data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"], [data-pagelet^="GroupsFeedUnit_"], [data-pagelet^="GroupFeedUnit_"], [data-pagelet^="PageFeedUnit_"]',

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
    // Sponsored / ad indicators.
    // aria-label selectors use *= (partial) and i (case-insensitive) because FB appends
    // "· Public", "· Globe" etc to the label.  Exact-match selectors miss these variants.
    sponsoredIndicators: [
        // Aria-label based (most stable — FB populates aria-label with clean text)
        'a[aria-label*="Sponsored" i]',
        'span[aria-label*="Sponsored" i]',
        'a[aria-label*="Publicidad" i]',
        'span[aria-label*="Publicidad" i]',
        'a[aria-label*="Patrocinado" i]',
        'a[aria-label*="Sponsorisé" i]',
        'a[aria-label*="Gesponsert" i]',
        'a[aria-label*="Sponsorizzato" i]',
        // Href-based: FB sponsored posts always link to the ad explanation page.
        // This href is never obfuscated — most reliable single signal.
        'a[href*="/ads/about"]',
        'a[href*="ad_preferences"]',
        'a[href*="about_ads"]',
        // NOTE: [attributionsrc*="privacy_sandbox"] and [attributionsrc*="comet/register"] removed.
        // Both appear on organic comment profile links (every commenter's avatar/name),
        // not exclusive to ads. Caused every comment to be falsely hidden.
        // NOTE: [data-ad-rendering-role] removed — confirmed present on ALL organic post
        // profile name elements, not exclusive to ads. Caused false-positive comment hiding.
        // Content Flow Token in ad page-name links (confirmed via live DOM)
        'a[href*="_cft_[0]"]',
        'a[href*="_cft_%5B0%5D"]',
        // testid fallback
        '[data-testid="fbfeed_ads_native_container"]',
        // Legacy text-contains (handled via findContains in removeSponsored)
        'span:contains("Sponsored")',
        'span:contains("Publicidad")',
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
    metaAISearchIcon: '[role="banner"] form svg.x14rh7hd.x1lliihq.x1tzjh5l',
    metaAIMessengerSparkle: 'div[role="textbox"] svg.x1tzjh5l.x1k90msu.x1qfuztq',
    metaAIHeader: 'div[aria-label="Meta AI"]',
    messengerSeenReceipt: 'div[aria-label^="Seen by"] img, div[aria-label^="Visto por"] img',
    messengerTypingIndicator: 'span.x6s0dn4.x78zum5.x135b78x, div.x17zd0t2.x78zum5.x1q0g3np',

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
