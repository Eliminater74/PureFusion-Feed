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
        this.popupScanIntervalId = null;
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
                'invited you to play',
                'play game',
                'game request',
                'te invito a jugar',
                'juego'
            ])) {
                PF_Helpers.hideElement(item, 'Game Notification');
                return;
            }

            if (this.settings.social.blockNotifBirthdays && this._containsAny(content, [
                'birthday',
                'cumpleanos'
            ])) {
                PF_Helpers.hideElement(item, 'Birthday Reminder');
                return;
            }

            if (this.settings.social.blockNotifMarketplace && this._containsAny(content, [
                'marketplace',
                'facebook marketplace'
            ])) {
                PF_Helpers.hideElement(item, 'Marketplace Notification');
                return;
            }

            if (this.settings.social.blockNotifEngagement && this._containsAny(content, [
                'suggested for you',
                'recommended for you',
                'you might be interested',
                'because you follow',
                'popular on facebook',
                'sugerido para ti',
                'recomendado para ti',
                'te podria interesar',
                'popular en facebook'
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
        if (this.popupScanIntervalId) return;

        this.popupScanIntervalId = setInterval(() => {
            if (document.hidden) return;
            this._scanDocumentPopups();
        }, 1500);

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
                    ['trending', 'tendencias', 'popular now'],
                    'Search Popup: Trending'
                );
            }

            if (this.settings.social.hideSearchRecent) {
                this._hideSearchSectionHeadings(
                    popup,
                    ['recent searches', 'busquedas recientes'],
                    'Search Popup: Recent Searches'
                );
            }
        });
    }

    _getHeaderSearchPopupCandidates() {
        const candidates = [];
        const searchInputs = Array.from(document.querySelectorAll([
            'input[aria-label="Search Facebook"]',
            'input[aria-label="Buscar en Facebook"]',
            'input[placeholder*="Search Facebook"]',
            'input[placeholder*="Buscar en Facebook"]'
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
            'recent searches',
            'busquedas recientes',
            'trending',
            'tendencias',
            'popular now'
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
