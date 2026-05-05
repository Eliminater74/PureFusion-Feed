/**
 * PureFusion Feed - Cleaner Undo
 *
 * Extends PF_Cleaner (defined in cleaner-core.js) with undo/restore methods:
 * the undo-chip injection and styling, post hiding/restoring, source allowlisting,
 * critical container recovery, toggle-OFF restoration, and the collapse/overlay mechanism.
 *
 * Must be loaded AFTER cleaner-core.js.
 */

// Extends PF_Cleaner — defined in cleaner-core.js
Object.assign(window.PF_Cleaner.prototype, {
    _injectUndoChipStyles() {
        if (this._undoStyleInjected || document.getElementById('pf-undo-chip-styles')) return;

        const style = document.createElement('style');
        style.id = 'pf-undo-chip-styles';
        style.textContent = `
            .pf-hidden-chip {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin: 8px 0;
                padding: 10px 12px;
                border-radius: 10px;
                border: 1px solid rgba(120, 132, 154, 0.3);
                background: rgba(25, 29, 39, 0.88);
                color: #e8edf8;
                font: 600 12px/1.3 "Segoe UI Variable Text", "Segoe UI", sans-serif;
            }

            .pf-hidden-chip-actions {
                display: inline-flex;
                gap: 8px;
                flex-wrap: wrap;
            }

            .pf-hidden-chip button {
                border: 1px solid rgba(120, 132, 154, 0.4);
                background: rgba(35, 41, 56, 0.9);
                color: #dbe6fa;
                border-radius: 999px;
                padding: 4px 10px;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
            }

            .pf-hidden-chip button:hover {
                border-color: rgba(18, 200, 220, 0.7);
                color: #9deeff;
            }
        `;
        document.head.appendChild(style);
        this._undoStyleInjected = true;
    },
    _hidePostNode(node, reason) {
        if (!node || node.dataset.pfHidden === 'true') return;
        if (node.matches && node.matches('html, body, [role="main"], [role="feed"]')) return;
        if (!this._isSafeHideTargetNode(node)) return;
        if (this._isAllowlistedPost(node)) return;

        if (this._isUndoEligible(node)) {
            this._insertUndoChip(node, reason);
        }

        PF_Helpers.hideElement(node, reason);
    },
    _isUndoEligible(node) {
        if (!node || !node.matches) return false;
        if (node.matches('[role="dialog"]')) return false;

        return node.matches('[data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"]')
            || !!PF_Helpers.getClosest(node, '[role="feed"]', 8);
    },
    _insertUndoChip(node, reason) {
        if (!node || !node.parentElement) return;
        if (node.dataset.pfUndoChip === 'true') return;

        const sourceName = this._extractPostSource(node);
        const i18n = (key, fallback) => {
            if (typeof chrome === 'undefined' || !chrome.i18n) return fallback;
            return chrome.i18n.getMessage(key) || fallback;
        };
        const chip = document.createElement('div');
        chip.className = 'pf-hidden-chip';
        chip.innerHTML = `
            <span>${i18n('content_hidden_chip_label', 'Hidden by PureFusion')}: ${reason}</span>
            <div class="pf-hidden-chip-actions">
                <button type="button" data-action="show">${i18n('content_hidden_chip_show_once', 'Show once')}</button>
                <button type="button" data-action="allow">${i18n('content_hidden_chip_allow_source', 'Always allow source')}</button>
            </div>
        `;

        chip.querySelector('[data-action="show"]').addEventListener('click', () => {
            this._restorePost(node, chip);
        });

        chip.querySelector('[data-action="allow"]').addEventListener('click', async () => {
            if (sourceName && sourceName !== 'Unknown') {
                await this._addSourceToAllowlist(sourceName);
            }
            this._restorePost(node, chip);
        });

        node.parentElement.insertBefore(chip, node);
        node.dataset.pfUndoChip = 'true';
    },
    _restorePost(node, chip) {
        if (!node) return;

        node.style.removeProperty('display');
        delete node.dataset.pfHidden;
        delete node.dataset.pfReason;
        delete node.dataset.pfUndoChip;

        if (chip && chip.remove) chip.remove();
    },
    _restoreCriticalContainers() {
        const hidden = document.querySelectorAll('[data-pf-hidden="true"]');
        hidden.forEach((node) => {
            if (!node) return;

            const reason = String(node.dataset.pfReason || '');
            const isNavReason = reason.startsWith('Left Nav:') || reason.startsWith('Right Sidebar:');
            if (isNavReason && !this._shouldKeepNavReasonHidden(reason)) {
                node.style.removeProperty('display');
                delete node.dataset.pfHidden;
                delete node.dataset.pfReason;
                return;
            }

            if (reason.startsWith('Right Rail') && this._looksLikeContactsModule(node)) {
                node.style.removeProperty('display');
                delete node.dataset.pfHidden;
                delete node.dataset.pfReason;
                return;
            }

            if (reason.startsWith('Topbar:') && !this._shouldKeepTopbarReasonHidden(reason)) {
                node.style.removeProperty('display');
                delete node.dataset.pfHidden;
                delete node.dataset.pfReason;
                return;
            }

            if (reason.startsWith('Social: Hide Meta AI') && !this.settings?.social?.hideMetaAI) {
                node.style.removeProperty('display');
                delete node.dataset.pfHidden;
                delete node.dataset.pfReason;
                return;
            }

            if (reason === 'Memories Post' && !this.settings?.filters?.hideMemories) {
                node.style.removeProperty('display');
                delete node.dataset.pfHidden;
                delete node.dataset.pfReason;
                return;
            }

            // Restore ad-hidden posts when removeAds is toggled OFF.
            if (reason === 'Ad (Hard Signal)' && !this.settings?.filters?.removeAds) {
                node.style.removeProperty('display');
                delete node.dataset.pfHidden;
                delete node.dataset.pfReason;
                return;
            }

            // Restore sponsored-label-hidden posts when removeSponsored is toggled OFF.
            // Also handles legacy 'Sponsored Post (Heuristic)' reason from before the split.
            if (
                (reason === 'Sponsored Post (Label Heuristic)' || reason === 'Sponsored Post (Heuristic)')
                && !this.settings?.filters?.removeSponsored
            ) {
                node.style.removeProperty('display');
                delete node.dataset.pfHidden;
                delete node.dataset.pfReason;
                return;
            }

            // ── Toggle-OFF Restoration — Feed Filters (Phase 35) ─────────────────────
            // Every filter that can hide content must have a corresponding restore guard.
            // Without these, hidden posts persist in the session after the user toggles
            // the setting back off (DoD regression rule #3).
            {
                const f  = this.settings?.filters;
                const sf = this.settings?.storyFilters;
                const imgf = this.settings?.imageFilters;

                // Helper — unhide node and clear markers, then signal caller to return.
                const _pfUnhide = () => {
                    node.style.removeProperty('display');
                    delete node.dataset.pfHidden;
                    delete node.dataset.pfReason;
                };

                // -- Simple feed-filter toggles --
                if (reason === 'Duplicate Post'        && !f?.deduplicatePosts)       { _pfUnhide(); this._seenPostIds.clear(); return; }
                if (reason === 'Old Post'              && !((f?.postAgeMaxHours || 0) > 0)) { _pfUnhide(); return; }
                if (reason === 'Suggested Posts'       && !f?.removeSuggested)        { _pfUnhide(); return; }
                if (reason === 'Page Suggestion'       && !f?.removePageSuggestions)  { _pfUnhide(); return; }
                if (reason === 'People You May Know'   && !f?.removePYMK)             { _pfUnhide(); return; }
                if (reason === 'Suggested Groups'      && !f?.removeGroupSuggestions) { _pfUnhide(); return; }
                if (reason === 'Game Invite/Post'      && !f?.removeGameInvites)      { _pfUnhide(); return; }
                if (reason === 'Marketplace Unit'      && !f?.hideMarketplace)        { _pfUnhide(); return; }
                if (reason === 'Fundraiser Module'     && !f?.hideFundraisers)        { _pfUnhide(); return; }
                if ((reason === 'Reels Target Array' || reason === 'Reels Tray Heuristic')
                    && !f?.hideReels) { _pfUnhide(); return; }
                if ((reason === 'Stories Tray Heuristic' || reason === 'Stories Tray')
                    && !f?.hideStories) { _pfUnhide(); return; }

                // -- Post type filters --
                const postTypeMap = {
                    'Post Type: Video':        f?.hideVideoPosts,
                    'Post Type: Photo':        f?.hidePhotoPosts,
                    'Post Type: Link Share':   f?.hideLinkPosts,
                    'Post Type: Text Only':    f?.hideTextOnlyPosts,
                    'Post Type: Live Video':   f?.hideLiveVideoPosts,
                    'Post Type: Share/Repost': f?.hideShareReposts,
                    'Post Type: Poll':         f?.hidePollPosts,
                };
                if (Object.prototype.hasOwnProperty.call(postTypeMap, reason) && !postTypeMap[reason]) {
                    _pfUnhide(); return;
                }

                // -- Story activity type filters --
                const storyTypeMap = {
                    'Story Type: Became Friends':       sf?.hideBecameFriends,
                    'Story Type: Joined Groups':        sf?.hideJoinedGroups,
                    'Story Type: Commented On This':    sf?.hideCommentedOnThis,
                    'Story Type: Liked This':           sf?.hideLikedThis,
                    'Story Type: Event Attendance':     sf?.hideAttendingEvents,
                    'Story Type: Shared Memory':        sf?.hideSharedMemories,
                    'Story Type: Profile Photo Update': sf?.hideProfilePhotoUpdates,
                    'Story Type: Cover Photo Update':   sf?.hideCoverPhotoUpdates,
                    'Story Type: Life Event':           sf?.hideLifeEvents,
                    'Story Type: Check-In':             sf?.hideCheckIns,
                    'Story Type: Milestone':            sf?.hideMilestones,
                    'Story Type: Job/Work Update':      sf?.hideJobWorkUpdates,
                    'Story Type: Relationship Update':  sf?.hideRelationshipUpdates,
                    'Story Type: Group Activity Post':  sf?.hideGroupActivityPosts,
                };
                if (Object.prototype.hasOwnProperty.call(storyTypeMap, reason) && !storyTypeMap[reason]) {
                    _pfUnhide(); return;
                }

                // -- Image subject filters --
                if (reason.startsWith('Image Subject Filter:')) {
                    const cat = reason.slice(21).trim();
                    const shouldKeep = imgf && (
                        (cat === 'Sports'            && imgf.hideSports) ||
                        (cat === 'Food'              && imgf.hideFood) ||
                        (cat === 'Pets'              && imgf.hidePets) ||
                        (cat === 'Vehicles'          && imgf.hideVehicles) ||
                        (cat === 'Memes/Screenshots' && imgf.hideScreenshotsMemes) ||
                        (cat === 'Travel/Scenery'    && imgf.hideTravelScenery)
                    );
                    if (!shouldKeep) { _pfUnhide(); return; }
                }
            }
            // ── End Toggle-OFF Restoration ──────────────────────────────────────────────

            const isCritical = node.matches && node.matches('html, body, [role="main"], [role="feed"]');
            const containsFeed = !!(node.querySelector && node.querySelector('[role="feed"]'));
            const containsMain = !!(node.querySelector && node.querySelector('[role="main"]'));
            const articleCount = node.querySelectorAll ? node.querySelectorAll('[role="article"]').length : 0;

            let isHugeShell = false;
            if (node.getBoundingClientRect) {
                const rect = node.getBoundingClientRect();
                isHugeShell = rect.width > window.innerWidth * 0.7 && rect.height > window.innerHeight * 0.5;
            }

            if (!isCritical && !containsFeed && !containsMain && articleCount <= 2 && !isHugeShell) return;

            node.style.removeProperty('display');
            delete node.dataset.pfHidden;
            delete node.dataset.pfReason;
        });
    },
    _shouldKeepNavReasonHidden(reason) {
        if (!reason) return false;

        const sidebar = this.settings?.sidebar;
        if (!sidebar || !sidebar.enableModuleFilters) return false;

        if (reason.startsWith('Left Nav: Marketplace')) return !!sidebar.hideLeftMarketplace;
        if (reason.startsWith('Left Nav: Watch')) return !!sidebar.hideLeftWatch;
        if (reason.startsWith('Left Nav: Gaming')) return !!sidebar.hideLeftGaming;
        if (reason.startsWith('Left Nav: Memories')) return !!sidebar.hideLeftMemories;
        if (reason.startsWith('Left Nav: Meta AI')) return !!sidebar.hideLeftMetaAI;
        if (reason.startsWith('Left Nav: Manus AI')) return !!sidebar.hideLeftManusAI;

        if (reason.startsWith('Right Sidebar: Trending')) return !!sidebar.hideRightTrending;
        if (reason.startsWith('Right Sidebar: Contacts')) return !!sidebar.hideRightContacts;
        if (reason.startsWith('Right Sidebar: Meta AI Contact')) return !!sidebar.hideRightMetaAIContact;
        if (reason.startsWith('Right Sidebar: Manus AI Contact')) return !!sidebar.hideRightManusAIContact;
        if (reason.startsWith('Right Sidebar: Events')) return !!sidebar.hideRightEvents;
        if (reason.startsWith('Right Sidebar: Birthdays')) return !!sidebar.hideRightBirthdays;

        return false;
    },
    _shouldKeepTopbarReasonHidden(reason) {
        if (!reason) return false;

        const topbar = this.settings?.topbarFilters;
        if (!topbar || !topbar.enabled) return false;

        if (reason.startsWith('Topbar: Home')) return !!topbar.hideHome;
        if (reason.startsWith('Topbar: Friends')) return !!topbar.hideFriends;
        if (reason.startsWith('Topbar: Watch')) return !!topbar.hideWatch;
        if (reason.startsWith('Topbar: Marketplace')) return !!topbar.hideMarketplace;
        if (reason.startsWith('Topbar: Groups')) return !!topbar.hideGroups;
        if (reason.startsWith('Topbar: Messenger')) return !!topbar.hideMessenger;
        if (reason.startsWith('Topbar: Notifications')) return !!topbar.hideNotifications;
        if (reason.startsWith('Topbar: Menu')) return !!topbar.hideMenu;
        if (reason.startsWith('Topbar: Create')) return !!topbar.hideCreate;

        return false;
    },
    _isSafeHideTargetNode(node) {
        if (!node || !node.matches) return false;
        if (node.matches('html, body, [role="main"], [role="feed"], [role="banner"], [role="navigation"], [role="complementary"]')) return false;
        if (node.querySelector && (node.querySelector('[role="feed"]') || node.querySelector('[role="main"]') || node.querySelector('[role="navigation"]') || node.querySelector('[role="complementary"]'))) return false;

        const role = (node.getAttribute && node.getAttribute('role')) || '';
        if (role === 'main' || role === 'feed' || role === 'banner' || role === 'navigation' || role === 'complementary') return false;

        const articleCount = node.querySelectorAll ? node.querySelectorAll('[role="article"]').length : 0;
        if (articleCount > 2) return false;

        if (node.getBoundingClientRect) {
            const rect = node.getBoundingClientRect();
            if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.7) {
                return false;
            }
            if (rect.width > window.innerWidth * 0.45 && rect.height > window.innerHeight * 0.55) {
                return false;
            }
        }

        return true;
    },
    async _addSourceToAllowlist(sourceName) {
        const normalized = String(sourceName || '').trim();
        if (!normalized) return;

        const current = this.settings?.keywords?.allowlistFriends || [];
        const exists = current.some((v) => String(v).toLowerCase() === normalized.toLowerCase());
        if (exists) {
            PF_Helpers.showToast(`"${normalized}" ${this._i18n('content_allow_source_exists', 'is already in Never Hide Sources.')}`, 'info');
            return;
        }

        this.settings.keywords.allowlistFriends = [...current, normalized];
        await PF_Storage.updateSettings(this.settings);
        PF_Helpers.showToast(`${this._i18n('content_allow_source_added', 'Added')} "${normalized}" ${this._i18n('content_allow_source_added_suffix', 'to Never Hide Sources.')}`, 'success');

        window.postMessage({ type: 'PF_LOCAL_SETTINGS_UPDATE' }, '*');
    },
    _collapsePost(postNode, matchedKeyword, includeKeywordAllowlist = false) {
        // Rather than hiding it completely, we dim it out and inject a "Show anyway" button
        if (postNode.dataset.pfCollapsed) return;
        if (this._isAllowlistedPost(postNode, null, includeKeywordAllowlist)) return;
        
        // Hide the children
        postNode.dataset.pfCollapsed = 'true';
        postNode.style.position = 'relative';
        
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: var(--disabled-background, rgba(0,0,0,0.8));
            backdrop-filter: blur(8px); z-index: 10;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            border-radius: 8px; font-family: sans-serif; color: white;
        `;
        
        overlay.innerHTML = `
            <div style="margin-bottom: 15px; font-weight: bold;">Filtered by keyword: "${matchedKeyword}"</div>
            <button style="
                background: #6C3FC5; color: white; border: none; padding: 8px 16px; 
                border-radius: 4px; cursor: pointer; font-weight: bold;
            ">Show Anyway</button>
        `;
        
        overlay.querySelector('button').addEventListener('click', () => {
            postNode.removeChild(overlay);
        }, { once: true });

        postNode.appendChild(overlay);
    }

});
