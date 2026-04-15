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
        // Aria-label based — a, span, AND [role="link"] variants.
        // FB sometimes uses div/custom elements with role="link" instead of <a>.
        // EN
        'a[aria-label*="Sponsored" i]',
        'span[aria-label*="Sponsored" i]',
        '[role="link"][aria-label*="Sponsored" i]',
        // ES
        'a[aria-label*="Publicidad" i]',
        'span[aria-label*="Publicidad" i]',
        '[role="link"][aria-label*="Publicidad" i]',
        'a[aria-label*="Patrocinado" i]',
        'span[aria-label*="Patrocinado" i]',
        '[role="link"][aria-label*="Patrocinado" i]',
        // FR
        'a[aria-label*="Sponsorisé" i]',
        'span[aria-label*="Sponsorisé" i]',
        '[role="link"][aria-label*="Sponsorisé" i]',
        // DE
        'a[aria-label*="Gesponsert" i]',
        'span[aria-label*="Gesponsert" i]',
        '[role="link"][aria-label*="Gesponsert" i]',
        // IT
        'a[aria-label*="Sponsorizzato" i]',
        'span[aria-label*="Sponsorizzato" i]',
        '[role="link"][aria-label*="Sponsorizzato" i]',
        // NL
        'a[aria-label*="Gesponsord" i]',
        'span[aria-label*="Gesponsord" i]',
        '[role="link"][aria-label*="Gesponsord" i]',
        // SV
        'a[aria-label*="Sponsrad" i]',
        'span[aria-label*="Sponsrad" i]',
        '[role="link"][aria-label*="Sponsrad" i]',
        // DA
        'a[aria-label*="Sponsoreret" i]',
        'span[aria-label*="Sponsoreret" i]',
        '[role="link"][aria-label*="Sponsoreret" i]',
        // NO
        'a[aria-label*="Sponset" i]',
        'span[aria-label*="Sponset" i]',
        '[role="link"][aria-label*="Sponset" i]',
        // Href-based: FB sponsored posts always link to the ad explanation page.
        // This href is never obfuscated — most reliable single signal.
        'a[href*="/ads/about"]',
        'a[href*="ad_preferences"]',
        'a[href*="about_ads"]',
        'a[href*="adabouturl"]',
        // NOTE: [attributionsrc*="privacy_sandbox"] and [attributionsrc*="comet/register"] removed.
        // Both appear on organic comment profile links (every commenter's avatar/name),
        // not exclusive to ads. Caused every comment to be falsely hidden.
        // NOTE: [data-ad-rendering-role] removed — confirmed present on ALL organic post
        // profile name elements, not exclusive to ads. Caused false-positive comment hiding.
        // Content Flow Token in ad page-name links (confirmed via live DOM)
        // Both uppercase (%5B) and lowercase (%5b) percent-encoding variants covered.
        'a[href*="_cft_[0]"]',
        'a[href*="_cft_%5B0%5D"]',
        'a[href*="_cft_%5b0%5d"]',
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
    // Reels tray — data-pagelet primary, aria-label fallback, role="region" structural
    reelsTray: [
        '[data-pagelet="FeedUnit_Reels_Tray"]',
        '[data-pagelet^="ShortsAndReels"]',
        '[data-pagelet*="Reels"]',
        '[data-pagelet*="reels"]',
        '[aria-label="Reels"]',
        '[aria-label^="Reels,"]',
        '[role="region"][aria-label*="Reels" i]',
        '[aria-label*="Reels and short videos" i]',
    ].join(', '),
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
    commentInputBox: 'div[role="textbox"][contenteditable="true"]',

    // ------------------------------------------------------------------------
    // IMAGE SUBJECT TOKENS (For AI Descriptor Filtering)
    // ------------------------------------------------------------------------
    imageSubjectTokens: {
        // EN + ES + FR/DE/IT/NL/SV/DA/NO (Phase 29 — full 9-locale expansion + false-positive audit)
        sports: [
            // EN
            'stadium', 'field', 'athlet', 'match', 'score', 'game', 'team', 'sport', 'ball', 'fitness', 'workout', 'player', 'coach', 'championship', 'tournament',
            'soccer', 'football', 'basketball', 'baseball', 'hockey', 'tennis',
            // ES
            'estadio', 'jugador', 'equipo', 'campeonato', 'torneo',
            // FR
            'stade', 'terrain', 'joueur', 'équipe', 'championnat', 'tournoi',
            // DE
            'stadion', 'mannschaft', 'spieler', 'wettkampf', 'fußball', 'fussball',
            // IT
            'squadra', 'giocatore', 'campionato', 'calcio',
            // NL
            'voetbal', 'speler', 'kampioenschap',
            // SV
            'fotboll', 'spelare', 'mästerskap',
            // DA
            'fodbold', 'spiller',
            // NO
            'fotball'
        ],
        food: [
            // EN
            'food', 'dish', 'plate', 'meal', 'restaurant', 'cook', 'baked', 'delicious', 'breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'drink', 'beverage', 'cup', 'bottle', 'tableware',
            'pizza', 'burger',
            // ES
            'cocina', 'comida', 'bebida',
            // FR
            'nourriture', 'repas', 'plat', 'boisson', 'déjeuner', 'dîner', 'petit-déjeuner', 'cuisine',
            // DE
            'essen', 'mahlzeit', 'gericht', 'getränk', 'frühstück', 'mittagessen', 'abendessen', 'küche',
            // IT
            'cibo', 'pasto', 'piatto', 'bevanda', 'pranzo', 'cena', 'colazione', 'cucina',
            // NL
            'maaltijd', 'gerecht', 'drank', 'ontbijt', 'avondeten', 'keuken',
            // SV
            'mat', 'måltid', 'dryck', 'frukost', 'middag', 'kök',
            // DA
            'mad', 'ret', 'drikke', 'morgenmad', 'aftensmad', 'køkken',
            // NO
            'kjøkken'
        ],
        pets: [
            // EN
            'dog', 'cat', 'kitten', 'puppy', 'pet ', 'animal', 'furry', 'bird', 'hamster', 'rabbit', 'paw', 'bark', 'meow',
            // ES
            'perro', 'gato', 'mascota',
            // FR
            'chien', 'chat ', 'chaton', 'chiot', 'oiseau', 'lapin', 'animaux',
            // DE
            'hund', 'katze', 'kätzchen', 'welpe', 'vogel', 'kaninchen', 'haustier',
            // IT
            'cane', 'gatto', 'gattino', 'cucciolo', 'uccello', 'coniglio', 'animale',
            // NL
            'hond', 'kat ', 'katje', 'konijn', 'huisdier', 'dier',
            // SV
            'katt', 'kattunge', 'valp', 'fågel', 'kanin', 'husdjur', 'djur',
            // DA
            'killing', 'hvalp', 'fugl', 'kæledyr',
            // NO
            'kattunge', 'kjæledyr'
        ],
        vehicles: [
            // EN
            'car', 'truck', 'vehicle', 'motorcycle', 'bike', 'aviation', 'airplane', 'aircraft', 'boat', 'ship', 'drive', 'road', 'highway', 'traffic', 'engine', 'wheel', 'tire',
            'van', 'bus',
            // ES
            'coche', 'camion', 'vehiculo', 'moto',
            // FR
            'voiture', 'camion', 'moto', 'avion', 'bateau', 'véhicule', 'route',
            // DE
            'auto', 'lkw', 'motorrad', 'flugzeug', 'boot', 'fahrzeug', 'straße',
            // IT
            'automobile', 'aereo', 'barca', 'veicolo', 'strada',
            // NL
            'vrachtwagen', 'motorfiets', 'vliegtuig', 'voertuig', 'rijweg',
            // SV
            'bil', 'lastbil', 'motorcykel', 'flygplan', 'båt', 'fordon', 'väg',
            // DA
            'lastbil', 'motorcykel', 'fly', 'båd', 'køretøj', 'vej',
            // NO
            'lastebil', 'motorsykkel', 'kjøretøy', 'vei'
        ],
        memes: [
            // EN
            'text', 'screenshot', 'meme', 'digital image', 'white background', 'black background', 'interface', 'poster', 'graphic design', 'clip art', 'illustration',
            'text that says', 'caption',
            // ES
            'captura de pantalla', 'texto que dice',
            // FR
            "capture d'écran", 'fond blanc', 'fond noir', 'affiche', 'texte qui dit',
            // DE
            'weißer hintergrund', 'schwarzer hintergrund', 'plakat', 'text der sagt',
            // IT
            'sfondo bianco', 'sfondo nero', 'testo che dice',
            // NL
            'schermafbeelding', 'witte achtergrond', 'zwarte achtergrond', 'tekst die zegt', 'illustratie',
            // SV
            'skärmbild', 'vit bakgrund', 'svart bakgrund', 'text som säger',
            // DA
            'skærmbillede', 'hvid baggrund', 'sort baggrund', 'tekst der siger',
            // NO
            'skjermbilde', 'hvit bakgrunn', 'svart bakgrunn', 'tekst som sier', 'illustrasjon'
        ],
        travel: [
            // EN — 'outdoor' and 'building' removed (false-positive: food/sports photos taken outside)
            'mountain', 'beach', 'ocean', 'nature', 'sky', 'sunset', 'travel', 'landscape', 'scenery', 'architecture', 'monument', 'landmark', 'vacation', 'resort',
            // ES
            'playa', 'montana', 'atardecer', 'paisaje', 'viaje', 'vacaciones',
            // FR
            'plage', 'montagne', 'océan', 'mer', 'coucher de soleil', 'paysage', 'monument', 'vacances', 'voyage',
            // DE
            'strand', 'berg', 'ozean', 'meer', 'sonnenuntergang', 'landschaft', 'denkmal', 'urlaub', 'reise',
            // IT
            'spiaggia', 'montagna', 'oceano', 'mare', 'tramonto', 'paesaggio', 'monumento', 'vacanza', 'viaggio',
            // NL
            'oceaan', 'zee', 'zonsondergang', 'landschap', 'vakantie', 'reis',
            // SV
            'hav', 'solnedgång', 'landskap', 'semester', 'resa',
            // DA
            'bjerg', 'solnedgang', 'landskab', 'ferie', 'rejse',
            // NO
            'fjell', 'solnedgang', 'ferie', 'reise'
        ]
    },

    // ------------------------------------------------------------------------
    // LAYOUT REFINEMENT SELECTORS
    // ------------------------------------------------------------------------
    postComposer: '[role="main"] [data-pagelet="GroupInlineComposer"], [role="main"] [data-visualcompletion="ignore-dynamic"] > div:has([role="button"][aria-label*="What\'s on your mind"])',
    sidebarHomeLink: 'div[role="navigation"] a[href="/"], div[role="navigation"] a[href^="/?sk=h_nor"]',
    topNavHomeLink: 'div[role="banner"] a[aria-label="Home"], div[role="banner"] a[aria-label="Inicio"]',

    // ------------------------------------------------------------------------
    // UI STYLE PRESETS
    // ------------------------------------------------------------------------
    stylePresets: {
        zen: {
            accent: '#8e9aaf',
            text: '#e2e2e2',
            cardBg: '#1e1e1e',
            bodyBg: '#121212',
            font: '"Inter", "Segoe UI", sans-serif',
            customCss: `
                [role="main"] { max-width: 680px !important; margin: 0 auto !important; }
                [role="article"] { border: none !important; box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important; border-radius: 16px !important; }
                div[role="navigation"], div[role="complementary"] { opacity: 0.4; transition: opacity 0.3s; }
                div[role="navigation"]:hover, div[role="complementary"]:hover { opacity: 1; }
            `
        },
        classic: {
            accent: '#3b5998',
            text: '#1c1e21',
            cardBg: '#ffffff',
            bodyBg: '#e9ebee',
            font: 'tahoma, verdana, arial, sans-serif',
            customCss: `
                header, div[role="banner"] { background-color: #3b5998 !important; }
                [role="article"] { border-radius: 0 !important; border: 1px solid #dddfe2 !important; }
                img { border-radius: 2px !important; }
                .pf-post-date-chip { background: #f0f2f5 !important; border-color: #ddd !important; color: #606770 !important; }
            `
        },
        amoled: {
            accent: '#BB86FC',
            text: '#e1e1e1',
            cardBg: '#000000',
            bodyBg: '#000000',
            font: 'inherit',
            customCss: `
                :root { --surface-background: #000 !important; --card-background: #000 !important; }
                div[role="banner"] { border-bottom: 1px solid #333 !important; background: #000 !important; }
                [role="article"] { border: 1px solid #222 !important; }
            `
        }
    }
};

// Make available globally
if (typeof module !== 'undefined') module.exports = { SELECTOR_MAP };
if (typeof window !== 'undefined') window.PF_SELECTOR_MAP = SELECTOR_MAP;
