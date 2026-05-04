/**
 * PureFusion Feed - Notification Controls
 * 
 * Intercepts the top-bar notification payload to filter out gamification,
 * marketing, or implement "Digest Mode" (hiding alerts until an interval passes).
 */

class PF_NotificationControls {
    constructor(settings) {
        this.settings = settings;
        this.lastDigestOpen = 0;
        this.digestIntervalId = null;
        this.popupScanObserver = null;
        this.isDigestClickBound = false;
        this.init();
    }

    async init() {
        this.lastDigestOpen = await PF_Storage.getLocalData('pf_last_digest') || 0;

        this._startPopupScanner();
        
        if (this.settings.social.notificationDigestMode) {
            this._applyDigestMode();
        }
    }

    applyToNodes(nodes) {
        if (!this.settings) return;

        nodes.forEach((node) => {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

            if (this._hasNotificationItemFiltersEnabled()) {
                this._scanNodeForNotifications(node);
            }

            if (this._hasSearchPopupFiltersEnabled()) {
                const hasListbox = (node.matches && node.matches('[role="listbox"]'))
                    || !!(node.querySelector && node.querySelector('[role="listbox"]'));
                if (hasListbox) {
                    this._filterSearchPopups();
                }
            }
        });
    }

    updateSettings(settings) {
        this.settings = settings;
        this._startPopupScanner();
        if (this.settings.social.notificationDigestMode) {
            this._applyDigestMode();
        } else {
            this._clearDigestMode();
        }
    }

    _hasNotificationItemFiltersEnabled() {
        const social = this.settings?.social;
        if (!social) return false;

        return !!(
            social.blockNotifGames
            || social.blockNotifBirthdays
            || social.blockNotifMarketplace
            || social.blockNotifEngagement
        );
    }

    _hasSearchPopupFiltersEnabled() {
        const social = this.settings?.social;
        if (!social) return false;

        return !!(
            social.hideSearchPopupSuggestions
            || social.hideSearchTrending
            || social.hideSearchRecent
        );
    }

    _scanNodeForNotifications(scopeNode) {
        const roots = this._getNotificationPopupRoots(scopeNode);
        roots.forEach((root) => {
            const items = root.querySelectorAll('[role="menuitem"], [role="listitem"], [role="row"]');
            if (items.length > 0) {
                this._filterNotifications(items);
            }
        });
    }

    _getNotificationPopupRoots(scopeNode) {
        if (!scopeNode) return [];

        const roots = [];
        const selector = [
            '[data-pagelet*="Notifications"]',
            '[aria-label="Notifications"]',
            '[aria-label="Notificaciones"]',
            '[role="dialog"][aria-label*="Notification"]',
            '[role="dialog"][aria-label*="Notific"]'
        ].join(', ');

        if (scopeNode.matches && scopeNode.matches(selector)) {
            roots.push(scopeNode);
        }

        if (scopeNode.querySelectorAll) {
            scopeNode.querySelectorAll(selector).forEach((node) => roots.push(node));
        }

        return Array.from(new Set(roots));
    }

    _filterNotifications(items) {
        const filterSignature = this._getNotifFilterSignature();

        items.forEach((item) => {
            if (item.dataset.pfNotifChecked === filterSignature) return;
            item.dataset.pfNotifChecked = filterSignature;

            const content = this._normalizeComparableText(item.textContent || '');
            if (!content || content.length < 8) return;

            if (this.settings.social.blockNotifGames && this._containsAny(content, [
                // EN
                'invited you to play', 'play game', 'game request',
                // ES
                'te invito a jugar', 'juego',
                // FR
                'vous a invité à jouer', 'invitation de jeu', 'demande de jeu',
                // DE
                'zu einem spiel eingeladen', 'spielanfrage',
                // IT
                'ti ha invitato a giocare', 'richiesta di gioco', 'gioco',
                // NL
                'uitgenodigd om te spelen', 'spelverzoek',
                // SV
                'bjöd in dig att spela', 'spelförfrågan',
                // DA
                'inviterede dig til at spille', 'spilforspørgsel',
                // NO
                'inviterte deg til å spille', 'spillforespørsel'
            ])) {
                PF_Helpers.hideElement(item, 'Game Notification');
                return;
            }

            if (this.settings.social.blockNotifBirthdays && this._containsAny(content, [
                // EN
                'birthday',
                // ES
                'cumpleanos',
                // FR
                'anniversaire',
                // DE
                'geburtstag',
                // IT
                'compleanno',
                // NL
                'verjaardag',
                // SV
                'födelsedag',
                // DA
                'fødselsdag',
                // NO
                'bursdag'
            ])) {
                PF_Helpers.hideElement(item, 'Birthday Reminder');
                return;
            }

            if (this.settings.social.blockNotifMarketplace && this._containsAny(content, [
                // EN / all locales (FB uses the English brand name universally)
                'marketplace', 'facebook marketplace',
                // FR
                'place de marché',
                // DE
                'marktplatz'
            ])) {
                PF_Helpers.hideElement(item, 'Marketplace Notification');
                return;
            }

            if (this.settings.social.blockNotifEngagement && this._containsAny(content, [
                // EN
                'suggested for you', 'recommended for you', 'you might be interested',
                'because you follow', 'popular on facebook',
                // ES
                'sugerido para ti', 'recomendado para ti', 'te podria interesar', 'popular en facebook',
                // FR
                'suggéré pour vous', 'recommandé pour vous', 'populaire sur facebook',
                'vous pourriez être intéressé',
                // DE
                'vorgeschlagen für dich', 'empfohlen für dich', 'beliebt auf facebook',
                'könnte dich interessieren',
                // IT
                'consigliato per te', 'raccomandato per te', 'potrebbe interessarti',
                'popolare su facebook',
                // NL
                'voorgesteld voor jou', 'aanbevolen voor jou', 'populair op facebook',
                'misschien ben je geïnteresseerd',
                // SV
                'föreslagen för dig', 'rekommenderad för dig', 'populärt på facebook',
                // DA
                'foreslået til dig', 'anbefalet til dig', 'populært på facebook',
                // NO
                'foreslått for deg', 'anbefalt for deg'
            ])) {
                PF_Helpers.hideElement(item, 'Engagement Suggestion Notification');
            }
        });
    }

    _getNotifFilterSignature() {
        const social = this.settings?.social || {};
        return [
            social.blockNotifGames ? '1' : '0',
            social.blockNotifBirthdays ? '1' : '0',
            social.blockNotifMarketplace ? '1' : '0',
            social.blockNotifEngagement ? '1' : '0'
        ].join('');
    }

    _startPopupScanner() {
        if (this.popupScanObserver) return;

        // Watch [role="banner"] for childList changes — fires when the notification
        // popup or search listbox opens/updates inside the header, avoiding a
        // 1500ms polling interval that ran even while nothing was open.
        const banner = document.querySelector('[role="banner"]') || document.body;
        this.popupScanObserver = new MutationObserver(() => {
            if (!document.hidden) this._scanDocumentPopups();
        });
        this.popupScanObserver.observe(banner, { childList: true, subtree: true });

        this._scanDocumentPopups();
    }

    _scanDocumentPopups() {
        if (this._hasNotificationItemFiltersEnabled()) {
            this._scanNodeForNotifications(document);
        }

        if (this._hasSearchPopupFiltersEnabled()) {
            this._filterSearchPopups();
        }
    }

    _filterSearchPopups() {
        const popups = this._getHeaderSearchPopupCandidates();
        if (popups.length === 0) return;

        popups.forEach((popup) => {
            if (!popup) return;

            if (this.settings.social.hideSearchPopupSuggestions) {
                PF_Helpers.hideElement(popup, 'Search Popup Suggestions');
                return;
            }

            if (this.settings.social.hideSearchTrending) {
                this._hideSearchItemsByHrefOrText(
                    popup,
                    ['/hashtag/', '/search/top/'],
                    [
                        // EN
                        'trending', 'popular now',
                        // ES
                        'tendencias',
                        // FR
                        'tendances', 'en vogue',
                        // DE
                        'im trend',
                        // IT
                        'di tendenza',
                        // NL
                        'populair',
                        // SV
                        'populärt',
                        // DA
                        'populært',
                        // NO
                        'populært'
                    ],
                    'Search Popup: Trending'
                );
            }

            if (this.settings.social.hideSearchRecent) {
                this._hideSearchSectionHeadings(
                    popup,
                    [
                        // EN
                        'recent searches',
                        // ES
                        'busquedas recientes',
                        // FR
                        'recherches récentes',
                        // DE
                        'letzte suchanfragen', 'letzte suchbegriffe',
                        // IT
                        'ricerche recenti',
                        // NL
                        'recente zoekopdrachten',
                        // SV
                        'senaste sökningar',
                        // DA
                        'seneste søgninger',
                        // NO
                        'siste søk', 'nylige søk'
                    ],
                    'Search Popup: Recent Searches'
                );
            }
        });
    }

    _getHeaderSearchPopupCandidates() {
        const candidates = [];
        const searchInputs = Array.from(document.querySelectorAll([
            // EN
            'input[aria-label="Search Facebook"]',
            'input[placeholder*="Search Facebook"]',
            // ES
            'input[aria-label="Buscar en Facebook"]',
            'input[placeholder*="Buscar en Facebook"]',
            // FR
            'input[aria-label="Rechercher sur Facebook"]',
            // DE
            'input[aria-label="Facebook durchsuchen"]',
            'input[aria-label="Auf Facebook suchen"]',
            // IT
            'input[aria-label="Cerca su Facebook"]',
            // NL
            'input[aria-label="Zoeken op Facebook"]',
            // SV
            'input[aria-label="Sök på Facebook"]',
            // DA
            'input[aria-label="Søg på Facebook"]',
            // NO
            'input[aria-label="Søk på Facebook"]'
        ].join(', ')));

        document.querySelectorAll('[role="listbox"]').forEach((listbox) => {
            if (!this._isVisible(listbox)) return;

            if (this._isNearHeaderSearch(listbox, searchInputs) || this._isLikelySearchPopup(listbox)) {
                candidates.push(listbox);
            }
        });

        const dialogSelector = '[role="dialog"][aria-label*="Search"], [role="dialog"][aria-label*="Buscar"]';
        document.querySelectorAll(dialogSelector).forEach((node) => {
            if (!this._isVisible(node)) return;
            candidates.push(node);
        });

        return Array.from(new Set(candidates));
    }

    _isNearHeaderSearch(node, searchInputs) {
        if (!node || !node.getBoundingClientRect || !Array.isArray(searchInputs) || searchInputs.length === 0) return false;

        const popupRect = node.getBoundingClientRect();
        if (popupRect.width < 120 || popupRect.height < 40) return false;

        return searchInputs.some((input) => {
            if (!input || !input.getBoundingClientRect) return false;
            const inputRect = input.getBoundingClientRect();
            if (inputRect.width === 0 || inputRect.height === 0) return false;

            const horizontalGap = Math.abs(popupRect.left - inputRect.left);
            const verticalOffset = popupRect.top - inputRect.bottom;

            return horizontalGap < 180 && verticalOffset > -20 && verticalOffset < 260;
        });
    }

    _isLikelySearchPopup(node) {
        if (!node || !node.querySelectorAll) return false;

        if (node.querySelector('a[href*="/search/"], a[href*="/hashtag/"]')) {
            return true;
        }

        const text = this._normalizeComparableText((node.textContent || '').slice(0, 500));
        return this._containsAny(text, [
            // EN
            'recent searches', 'trending', 'popular now',
            // ES
            'busquedas recientes', 'tendencias',
            // FR
            'recherches recentes', 'tendances',
            // DE
            'letzte suchanfragen', 'letzte suchbegriffe', 'im trend',
            // IT
            'ricerche recenti', 'di tendenza',
            // NL
            'recente zoekopdrachten', 'populair',
            // SV
            'senaste sökningar', 'populärt',
            // DA
            'seneste søgninger', 'populært',
            // NO
            'siste søk', 'nylige søk'
        ]);
    }

    _hideSearchItemsByHrefOrText(scopeNode, hrefTokens, textTokens, reason) {
        if (!scopeNode || !scopeNode.querySelectorAll) return;

        const candidates = scopeNode.querySelectorAll('a[href], [role="option"], [role="row"], [role="listitem"], li');
        candidates.forEach((node) => {
            if (!node || node.dataset.pfSearchChecked === reason) return;
            node.dataset.pfSearchChecked = reason;

            const href = node.getAttribute ? (node.getAttribute('href') || '').toLowerCase() : '';
            const text = this._normalizeComparableText(node.textContent || '');

            const hrefMatch = href && hrefTokens.some((token) => href.includes(token));
            const textMatch = text && text.length <= 96 && this._containsAny(text, textTokens);
            if (!hrefMatch && !textMatch) return;

            const target = this._findSearchRowContainer(node, scopeNode);
            if (target) {
                PF_Helpers.hideElement(target, reason);
            }
        });
    }

    _hideSearchSectionHeadings(scopeNode, headingTokens, reason) {
        if (!scopeNode || !scopeNode.querySelectorAll) return;

        const selectors = 'h2, h3, [role="heading"], span, div';
        scopeNode.querySelectorAll(selectors).forEach((node) => {
            const text = this._normalizeComparableText(node.textContent || '');
            if (!text || text.length < 6 || text.length > 56) return;
            if (!headingTokens.some((token) => text === this._normalizeComparableText(token))) return;

            const target = this._findSearchSectionContainer(node, scopeNode) || node;
            PF_Helpers.hideElement(target, reason);
        });
    }

    _findSearchSectionContainer(node, scopeNode) {
        const row = this._findSearchRowContainer(node, scopeNode);
        if (row) return row;

        let current = node.parentElement;
        let depth = 0;

        while (current && current !== scopeNode && depth < 6) {
            if (current.getBoundingClientRect) {
                const rect = current.getBoundingClientRect();
                if (rect.height >= 24 && rect.height <= 260 && rect.width >= 120) {
                    return current;
                }
            }

            current = current.parentElement;
            depth += 1;
        }

        return null;
    }

    _findSearchRowContainer(node, scopeNode) {
        if (!node) return null;

        const row = PF_Helpers.getClosest(node, '[role="option"], [role="row"], [role="listitem"], li', 6);
        if (row && row !== scopeNode) return row;

        return null;
    }

    _isVisible(node) {
        if (!node || !node.getBoundingClientRect) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    _containsAny(text, tokens) {
        if (!text || !Array.isArray(tokens) || tokens.length === 0) return false;
        return tokens.some((token) => {
            const normalizedToken = this._normalizeComparableText(token);
            return normalizedToken && text.includes(normalizedToken);
        });
    }

    _normalizeComparableText(text) {
        return String(text || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    _applyDigestMode() {
        if (this.digestIntervalId) return;

        // Find the red notification jewel count in the top right nav
        const runDigestCycle = () => {
            if (document.hidden) return;

            const jewelWrappers = document.querySelectorAll(PF_SELECTOR_MAP.headerContainer + ' span:has(span[dir="auto"])');
            
            const ONE_HOUR = 60 * 60 * 1000;
            const timeSince = Date.now() - this.lastDigestOpen;

            if (timeSince < ONE_HOUR) {
                // Hide jewels by turning opacity 0 securely
                jewelWrappers.forEach(jewel => {
                    jewel.style.opacity = '0';
                    jewel.style.pointerEvents = 'none';
                });
            } else {
                // Show them, it's time
                jewelWrappers.forEach(jewel => {
                    jewel.style.opacity = '1';
                    jewel.style.pointerEvents = 'auto';
                });
            }
        };

        // Standard loop to ensure injected jewels are overridden
        this.digestIntervalId = setInterval(runDigestCycle, 5000);
        runDigestCycle();

        // If they actually click the notification bell, we reset the timer
        if (!this.isDigestClickBound) {
            document.addEventListener('click', (e) => {
                const isBell = PF_Helpers.getClosest(e.target, 'div[aria-label="Notifications"]');
                if (isBell) {
                    this.lastDigestOpen = Date.now();
                    PF_Storage.setLocalData('pf_last_digest', this.lastDigestOpen);
                }
            });
            this.isDigestClickBound = true;
        }
    }

    destroy() {
        if (this.popupScanObserver) {
            this.popupScanObserver.disconnect();
            this.popupScanObserver = null;
        }
        this._clearDigestMode();
    }

    _clearDigestMode() {
        if (this.digestIntervalId) {
            clearInterval(this.digestIntervalId);
            this.digestIntervalId = null;
        }

        const jewelWrappers = document.querySelectorAll(PF_SELECTOR_MAP.headerContainer + ' span:has(span[dir="auto"])');
        jewelWrappers.forEach((jewel) => {
            jewel.style.opacity = '1';
            jewel.style.pointerEvents = 'auto';
        });
    }
}

window.PF_NotificationControls = PF_NotificationControls;
