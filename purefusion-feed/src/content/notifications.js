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
        this.isDigestClickBound = false;
        this.init();
    }

    async init() {
        this.lastDigestOpen = await PF_Storage.getLocalData('pf_last_digest') || 0;
        
        if (this.settings.social.notificationDigestMode) {
            this._applyDigestMode();
        }
    }

    applyToNodes(nodes) {
        if (!this.settings) return;

        // Facebook notifications usually appear in a popup menu list container 
        // with roles like `menuitem` or `listitem` containing an aria-label describing the notif.
        
        nodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const notifItems = node.querySelectorAll('[role="menuitem"], [data-pagelet="Notifications"] [role="listitem"]');
                if (notifItems.length > 0) {
                    this._filterNotifications(notifItems);
                }
            }
        });
    }

    updateSettings(settings) {
        this.settings = settings;
        if (this.settings.social.notificationDigestMode) {
            this._applyDigestMode();
        } else {
            this._clearDigestMode();
        }
    }

    _filterNotifications(items) {
        items.forEach(item => {
            if (item.dataset.pfNotifChecked) return;
            item.dataset.pfNotifChecked = "true";

            // The content of the notification is usually in an inner span/div with tracking IDs
            const content = item.textContent.toLowerCase();

            // Block Games
            if (this.settings.social.blockNotifGames && (content.includes('invited you to play') || content.includes('game'))) {
                PF_Helpers.hideElement(item, "Game Notification");
            }
            // Block Birthdays
            if (this.settings.social.blockNotifBirthdays && content.includes('birthday')) {
                PF_Helpers.hideElement(item, "Birthday Reminder");
            }
            // Block Marketplace
            if (this.settings.social.blockNotifMarketplace && content.includes('marketplace')) {
                PF_Helpers.hideElement(item, "Marketplace Notification");
            }
        });
    }

    _applyDigestMode() {
        if (this.digestIntervalId) return;

        // Find the red notification jewel count in the top right nav
        const runDigestCycle = () => {
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
