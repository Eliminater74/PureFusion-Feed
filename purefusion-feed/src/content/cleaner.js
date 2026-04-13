/**
 * PureFusion Feed - Cleaner Engine
 * 
 * Handles the logic required to identify Spam, Ads, and clutter and remove them.
 * Relies on PF_SELECTOR_MAP and settings defined by user.
 */

class PF_Cleaner {
    constructor(settings) {
        this.settings = settings;
        this._undoStyleInjected = false;
        this._panicMode = false;
        this._recoveryIntervalId = null;
        this._reelsSeenCount = 0;
        this._reelsTrackedNodes = new WeakSet();
        this._reelsLimitNoticeShown = false;
        this._lastSurfaceScopeSkipKey = '';
        this.sponsoredTokens = [
            'sponsored',
            'publicidad',
            'patrocinado',
            'patrocinada',
            'sponsorise',
            'sponsorisee',
            'sponsorizzato',
            'gesponsert',
            'gesponsord',   // NL
            'sponsrad',     // SV
            'sponsoreret',  // DA
            'sponset',      // NO
        ];
        this._injectUndoChipStyles();
        this._startRecoveryWatchdog();
    }

    updateSettings(settings) {
        const prevLimiterEnabled = !!this.settings?.wellbeing?.reelsLimiterEnabled;
        const prevLimit = Number(this.settings?.wellbeing?.reelsSessionLimit || 3);

        this.settings = settings;

        const nextLimiterEnabled = !!this.settings?.wellbeing?.reelsLimiterEnabled;
        const nextLimit = Number(this.settings?.wellbeing?.reelsSessionLimit || 3);

        if (!nextLimiterEnabled || !prevLimiterEnabled || nextLimit !== prevLimit) {
            this._resetReelsLimiterSession();
        }
    }

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
    }

    /**
     * Run a full sweep on the entire document body (usually done on navigation end).
     */
    sweepDocument() {
        PF_Logger.log("Running initial document sweep...");
        this._applyAllFilters(document.body);
        this._checkFeedRecovery();
    }

    /**
     * Sweep specific nodes recently added by the observer.
     * @param {Array<HTMLElement>} nodes 
     */
    sweepNodes(nodes) {
        for (const node of nodes) {
            this._applyAllFilters(node);
        }
        this._checkFeedRecovery();
    }

    _applyAllFilters(rootNode) {
        if (!rootNode || !rootNode.querySelectorAll) return;

        this._restoreCriticalContainers();
        if (this._panicMode) return;

        if (!this._shouldApplyForCurrentSurface()) {
            return;
        }

        if (this.settings.filters.removeAds) {
            this.removeSponsored(rootNode);
            this.removeRightRailAds(rootNode);
        }
        if (this.settings.filters.removeSuggested) this.removeSuggestedPosts(rootNode); // Shared logic for suggested, pymk, groups

        if (this._hasPostTypeFiltersEnabled()) {
            this.removePostTypePosts(rootNode);
        }

        if (this._hasStoryActivityFiltersEnabled()) {
            this.removeStoryActivityPosts(rootNode);
        }

        if (this._hasImageSubjectFiltersEnabled()) {
            this.removeImageSubjectPosts(rootNode);
        }
        
        if (this.settings.filters.removeColoredBackgrounds) this.removeColoredBackgrounds(rootNode);
        
        if (this._hasSidebarVisibilityFilters()) {
            this.removeNavigationModules(rootNode);
        }

        if (this._hasTopbarFiltersEnabled()) {
            this.removeTopbarModules(rootNode);
        }

        // Apply "Soul-Soother" notification jewel styling
        this._applyNotificationJewelStyle(rootNode);

        if (this._hasReelsSessionLimiterEnabled()) {
            this.applyReelsSessionLimiter(rootNode);
        }
        
        // Hide features like Reels, Marketplace, Stories if toggled
        if (this.settings.filters.hideReels) this.removeReelsTray(rootNode);
        if (this.settings.filters.hideStories) this.removeStoriesTray(rootNode);
        if (this.settings.filters.hideMarketplace) this.hideTarget(rootNode, PF_SELECTOR_MAP.marketplaceTray || '[data-pagelet*="Marketplace"]', "Marketplace Tray");
        if (this.settings.filters.hideMarketplace) {
            // General marketplace injections in the feed often share the 'suggested' wrappers or a specific aria-label
            // For safety we catch strings here
            const marketplaceNodes = PF_Helpers.findContains(rootNode, '[role="article"]', 'Marketplace');
            marketplaceNodes.forEach(node => this._hidePostNode(PF_Helpers.getClosest(node, PF_SELECTOR_MAP.postContainer), "Marketplace Unit"));
        }

        // F.B. Purity Parity Feature: Algorithmic Friend Activity (X liked this, Y commented on this)
        // This targets Facebook's attempt to force unrelated posts into your feed based on what your friends interact with.
        if (this.settings.social.hideMetaAI) {
            this.removeMetaAI(rootNode);
        }

        // Apply advanced Clickbait filtering (Phase 10)
        if (this.settings.wellbeing && this.settings.wellbeing.clickbaitBlocker) {
            this.removeClickbait(rootNode);
        }

        // Apply keyword sweeping
        this.applyKeywordFilters(rootNode);

        // Messenger Privacy (Ghost Mode Title Suppression)
        this._applyMessengerPrivacyFilters();
    }

    _hasStoryActivityFiltersEnabled() {
        if (this._panicMode) return false;

        const sf = this.settings?.storyFilters;
        if (!sf) return false;

        return !!(
            sf.hideBecameFriends
            || sf.hideJoinedGroups
            || sf.hideCommentedOnThis
            || sf.hideLikedThis
            || sf.hideAttendingEvents
            || sf.hideSharedMemories
            || sf.hideProfilePhotoUpdates
            || sf.hideCoverPhotoUpdates
            || sf.hideLifeEvents
            || sf.hideCheckIns
            || sf.hideMilestones
            || sf.hideJobWorkUpdates
            || sf.hideRelationshipUpdates
            || sf.hideGroupActivityPosts
        );
    }

    _hasImageSubjectFiltersEnabled() {
        if (this._panicMode) return false;

        const imageFilters = this.settings?.imageFilters;
        if (!imageFilters || !imageFilters.enabled) return false;

        return !!(
            imageFilters.hideSports
            || imageFilters.hideFood
            || imageFilters.hidePets
            || imageFilters.hideVehicles
            || imageFilters.hideScreenshotsMemes
            || imageFilters.hideTravelScenery
        );
    }

    _hasSidebarVisibilityFilters() {
        if (this._panicMode) return false;

        const sidebar = this.settings?.sidebar;
        if (!sidebar || !sidebar.enableModuleFilters) return false;

        return !!(
            sidebar.hideLeftMarketplace
            || sidebar.hideLeftGaming
            || sidebar.hideLeftWatch
            || sidebar.hideLeftMemories
            || sidebar.hideLeftMetaAI
            || sidebar.hideLeftManusAI
            || sidebar.hideRightTrending
            || sidebar.hideRightContacts
            || sidebar.hideRightMetaAIContact
            || sidebar.hideRightManusAIContact
            || sidebar.hideRightEvents
            || sidebar.hideRightBirthdays
        );
    }

    _hasPostTypeFiltersEnabled() {
        if (this._panicMode) return false;

        const filters = this.settings?.filters;
        if (!filters) return false;

        return !!(
            filters.hideVideoPosts
            || filters.hidePhotoPosts
            || filters.hideLinkPosts
            || filters.hideTextOnlyPosts
            || filters.hideLiveVideoPosts
            || filters.hideShareReposts
            || filters.hidePollPosts
        );
    }

    _getCurrentSurfaceKey() {
        const pathname = String(window?.location?.pathname || '/').toLowerCase();

        if (pathname === '/' || pathname === '/home.php') return 'home';
        if (pathname.startsWith('/groups')) return 'groups';
        if (pathname.startsWith('/watch')) return 'watch';
        if (pathname.startsWith('/marketplace')) return 'marketplace';
        return 'other';
    }

    _shouldApplyForCurrentSurface() {
        const surfaceControls = this.settings?.surfaceControls;
        if (!surfaceControls || !surfaceControls.enabled) {
            this._lastSurfaceScopeSkipKey = '';
            return true;
        }

        const surfaceKey = this._getCurrentSurfaceKey();
        let allowed = true;

        switch (surfaceKey) {
            case 'home':
                allowed = surfaceControls.applyHome !== false;
                break;
            case 'groups':
                allowed = surfaceControls.applyGroups !== false;
                break;
            case 'watch':
                allowed = surfaceControls.applyWatch !== false;
                break;
            case 'marketplace':
                allowed = surfaceControls.applyMarketplace !== false;
                break;
            default:
                allowed = surfaceControls.applyOther !== false;
                break;
        }

        if (allowed) {
            this._lastSurfaceScopeSkipKey = '';
            return true;
        }

        const skipKey = `${surfaceKey}:${window.location.pathname}`;
        if (skipKey !== this._lastSurfaceScopeSkipKey) {
            this._lastSurfaceScopeSkipKey = skipKey;
            PF_Logger.log(`Surface scope active: filters skipped on '${surfaceKey}' surface.`);
        }

        return false;
    }

    _hasTopbarFiltersEnabled() {
        if (this._panicMode) return false;

        const topbar = this.settings?.topbarFilters;
        if (!topbar || !topbar.enabled) return false;

        return !!(
            topbar.hideHome
            || topbar.hideFriends
            || topbar.hideWatch
            || topbar.hideMarketplace
            || topbar.hideGroups
            || topbar.hideMessenger
            || topbar.hideNotifications
            || topbar.hideMenu
            || topbar.hideCreate
            || topbar.hideGaming
        );
    }

    _hasReelsSessionLimiterEnabled() {
        if (this._panicMode) return false;
        if (this.settings?.filters?.hideReels) return false;

        const wellbeing = this.settings?.wellbeing;
        if (!wellbeing) return false;

        return !!wellbeing.reelsLimiterEnabled;
    }

    removeStoryActivityPosts(rootNode) {
        const sf = this.settings?.storyFilters;
        if (!sf) return;

        const rules = [
            {
                enabled: sf.hideBecameFriends,
                reason: 'Story Type: Became Friends',
                rx: /\b(became friends|are now friends|now friends with|celebrating friendship|se hicieron amigos|ahora son amigos)\b/,
                tokens: ['sont maintenant amis', 'agora sao amigos', 'sind jetzt befreundet', 'ora sono amici']
            },
            {
                enabled: sf.hideJoinedGroups,
                reason: 'Story Type: Joined Groups',
                rx: /\b(joined (a )?group|joined .* group|se unio a(l)? (un )?grupo)\b/,
                tokens: ['a rejoint le groupe', 'entrou no grupo', 'der gruppe beigetreten', 'si e unito al gruppo']
            },
            {
                enabled: sf.hideCommentedOnThis,
                reason: 'Story Type: Commented On This',
                rx: /\b(commented on this|ha comentado|comento en esto)\b/,
                tokens: ['a commente ceci', 'comentou isto', 'dies kommentiert', 'ha commentato questo']
            },
            {
                enabled: sf.hideLikedThis,
                reason: 'Story Type: Liked This',
                rx: /\b(liked this|reacted to this|le gusto esto|reacciono a esto)\b/,
                tokens: ['a aime ceci', 'curtiu isto', 'gefallt das', 'messo mi piace a questo']
            },
            {
                enabled: sf.hideAttendingEvents,
                reason: 'Story Type: Event Attendance',
                rx: /\b(is going to (an )?event|is interested in (an )?event|attending (an )?event|attended (an )?event|interesado en (un )?evento|asistira a (un )?evento|asistio a (un )?evento)\b/,
                tokens: ['participe a un evenement', 'interesse par un evenement', 'vai a um evento', 'interessado em um evento', 'nimmt an einer veranstaltung teil', 'interessiert an einer veranstaltung', 'partecipera a un evento', 'interessato a un evento']
            },
            {
                enabled: sf.hideSharedMemories,
                reason: 'Story Type: Shared Memory',
                rx: /\b(shared a memory|your memories on facebook|compartio un recuerdo|recuerdos en facebook)\b/,
                tokens: ['a partage un souvenir', 'souvenirs sur facebook', 'compartilhou uma lembranca', 'lembrancas no facebook', 'hat eine erinnerung geteilt', 'erinnerungen auf facebook', 'ha condiviso un ricordo', 'ricordi su facebook']
            },
            {
                enabled: sf.hideProfilePhotoUpdates,
                reason: 'Story Type: Profile Photo Update',
                rx: /\b(updated (his|her|their) profile picture|updated profile picture|changed profile picture|actualizo su foto de perfil|cambio su foto de perfil)\b/,
                tokens: ['a mis a jour sa photo de profil', 'a change sa photo de profil', 'atualizou a foto do perfil', 'alterou a foto do perfil', 'hat sein profilbild aktualisiert', 'profilbild aktualisiert', 'ha aggiornato la foto del profilo', 'ha cambiato la foto del profilo']
            },
            {
                enabled: sf.hideCoverPhotoUpdates,
                reason: 'Story Type: Cover Photo Update',
                rx: /\b(updated (his|her|their) cover photo|updated cover photo|changed cover photo|actualizo su foto de portada|cambio su foto de portada)\b/,
                tokens: ['a mis a jour sa photo de couverture', 'a change sa photo de couverture', 'atualizou a foto de capa', 'alterou a foto de capa', 'hat sein titelbild aktualisiert', 'titelbild aktualisiert', 'ha aggiornato la foto di copertina', 'ha cambiato la foto di copertina']
            },
            {
                enabled: sf.hideLifeEvents,
                reason: 'Story Type: Life Event',
                rx: /\b(added a life event|life event|evento importante|agrego un evento importante)\b/,
                tokens: ['a ajoute un evenement marquant', 'adicionou um evento importante', 'hat ein lebensereignis hinzugefugt', 'ha aggiunto un evento importante']
            },
            {
                enabled: sf.hideCheckIns,
                reason: 'Story Type: Check-In',
                rx: /\b(checked in at|check-in|is at .* with|registro en|se registro en|esta en .* con)\b/,
                tokens: ['s est enregistre a', 'fez check in em', 'hat eingecheckt bei', 'ha fatto il check in a']
            },
            {
                enabled: sf.hideMilestones,
                reason: 'Story Type: Milestone',
                rx: /\b(milestone|celebrating .* milestone|hito|celebrando un hito)\b/,
                tokens: ['etape importante', 'marco importante', 'meilenstein', 'traguardo']
            },
            {
                enabled: sf.hideJobWorkUpdates,
                reason: 'Story Type: Job/Work Update',
                rx: /\b(started working at|works at|new job|job update|comenzo a trabajar en|trabaja en|nuevo trabajo|actualizacion laboral)\b/,
                tokens: ['a commence a travailler chez', 'travaille chez', 'comecou a trabalhar na', 'trabalha na', 'arbeitet bei', 'hat einen neuen job', 'ha iniziato a lavorare presso', 'lavora presso']
            },
            {
                enabled: sf.hideRelationshipUpdates,
                reason: 'Story Type: Relationship Update',
                rx: /\b(is in a relationship|got engaged|got married|relationship status|esta en una relacion|se comprometio|se caso|estado de relacion)\b/,
                tokens: ['est en couple', 's est fiance', 's est marie', 'status relationnel', 'esta em um relacionamento', 'ficou noivo', 'beziehungsstatus', 'ist in einer beziehung', 'hat sich verlobt', 'hat geheiratet', 'ha una relazione', 'si e fidanzato', 'si e sposato', 'stato sentimentale']
            },
            {
                enabled: sf.hideGroupActivityPosts,
                reason: 'Story Type: Group Activity Post',
                rx: /\b(posted in .* group|shared in .* group|publico en .* grupo|compartio en .* grupo)\b/,
                tokens: ['a publie dans le groupe', 'a partage dans le groupe', 'publicou em um grupo', 'compartilhou em um grupo', 'hat in einer gruppe gepostet', 'hat in einer gruppe geteilt', 'ha pubblicato nel gruppo', 'ha condiviso nel gruppo']
            }
        ].filter((r) => r.enabled);

        if (!rules.length) return;

        const postCandidates = this._getPostCandidates(rootNode)
            .filter((postWrapper) => {
                if (!postWrapper || postWrapper.dataset.pfHidden) return false;
                if (!this._isValidPostScope(postWrapper)) return false;
                if (!this._isLikelySingleFeedPost(postWrapper)) return false;
                return true;
            });

        if (!postCandidates.length) return;

        const matchedPosts = [];

        postCandidates.forEach((postWrapper) => {
            const headerSignals = this._extractStoryHeaderSignals(postWrapper);
            if (!headerSignals.length) return;

            for (const rule of rules) {
                if (headerSignals.some((signal) => rule.rx.test(signal) || this._containsAnyToken(signal, rule.tokens))) {
                    matchedPosts.push({ node: postWrapper, reason: rule.reason });
                    break;
                }
            }
        });

        if (!matchedPosts.length) return;

        // Safety valve: if matching spikes too high, abort this pass.
        const scannedCount = postCandidates.length;
        const maxHide = Math.max(4, Math.floor(scannedCount * 0.45));
        if ((scannedCount > 2 && matchedPosts.length >= scannedCount) || matchedPosts.length > maxHide) {
            PF_Logger.warn(`Story activity filter safety bailout: matched ${matchedPosts.length}/${scannedCount}.`);
            return;
        }

        matchedPosts.forEach(({ node, reason }) => {
            this._hidePostNode(node, reason);
        });
    }

    removePostTypePosts(rootNode) {
        const filters = this.settings?.filters;
        if (!filters) return;

        const rules = [
            {
                enabled: !!filters.hideVideoPosts,
                reason: 'Post Type: Video',
                key: 'video'
            },
            {
                enabled: !!filters.hidePhotoPosts,
                reason: 'Post Type: Photo',
                key: 'photo'
            },
            {
                enabled: !!filters.hideLinkPosts,
                reason: 'Post Type: Link Share',
                key: 'link'
            },
            {
                enabled: !!filters.hideTextOnlyPosts,
                reason: 'Post Type: Text Only',
                key: 'textOnly'
            },
            {
                enabled: !!filters.hideLiveVideoPosts,
                reason: 'Post Type: Live Video',
                key: 'liveVideo'
            },
            {
                enabled: !!filters.hideShareReposts,
                reason: 'Post Type: Share/Repost',
                key: 'shareRepost'
            },
            {
                enabled: !!filters.hidePollPosts,
                reason: 'Post Type: Poll',
                key: 'poll'
            }
        ].filter((rule) => rule.enabled);

        if (!rules.length) return;

        const postCandidates = this._getPostCandidates(rootNode)
            .filter((postWrapper) => {
                if (!postWrapper || postWrapper.dataset.pfHidden) return false;
                if (!this._isValidPostScope(postWrapper)) return false;
                if (!this._isLikelySingleFeedPost(postWrapper)) return false;
                return true;
            });

        if (!postCandidates.length) return;

        const matchedPosts = [];

        postCandidates.forEach((postWrapper) => {
            const classification = this._classifyPostType(postWrapper);
            if (!classification) return;

            for (const rule of rules) {
                if (classification[rule.key]) {
                    matchedPosts.push({ node: postWrapper, reason: rule.reason });
                    break;
                }
            }
        });

        if (!matchedPosts.length) return;

        const scannedCount = postCandidates.length;
        const maxHide = Math.max(3, Math.floor(scannedCount * 0.4));
        if ((scannedCount > 2 && matchedPosts.length >= scannedCount) || matchedPosts.length > maxHide) {
            PF_Logger.warn(`Post-type filter safety bailout: matched ${matchedPosts.length}/${scannedCount}.`);
            return;
        }

        matchedPosts.forEach(({ node, reason }) => {
            this._hidePostNode(node, reason);
        });
    }

    removeImageSubjectPosts(rootNode) {
        const imageFilters = this.settings?.imageFilters;
        if (!imageFilters || !imageFilters.enabled) return;

        const rules = [
            {
                enabled: imageFilters.hideSports,
                reason: 'Image Subject: Sports',
                tokens: ['soccer', 'football', 'basketball', 'baseball', 'hockey', 'tennis', 'athlete', 'stadium', 'sport']
            },
            {
                enabled: imageFilters.hideFood,
                reason: 'Image Subject: Food',
                tokens: ['food', 'meal', 'dish', 'plate', 'pizza', 'burger', 'drink', 'restaurant', 'cocina', 'comida', 'bebida']
            },
            {
                enabled: imageFilters.hidePets,
                reason: 'Image Subject: Pets',
                tokens: ['dog', 'cat', 'puppy', 'kitten', 'pet', 'perro', 'gato', 'mascota']
            },
            {
                enabled: imageFilters.hideVehicles,
                reason: 'Image Subject: Vehicles',
                tokens: ['car', 'truck', 'vehicle', 'motorcycle', 'bike', 'van', 'bus', 'coche', 'camion', 'vehiculo', 'moto']
            },
            {
                enabled: imageFilters.hideScreenshotsMemes,
                reason: 'Image Subject: Screenshots/Memes',
                tokens: ['screenshot', 'meme', 'text that says', 'caption', 'captura de pantalla', 'texto que dice']
            },
            {
                enabled: imageFilters.hideTravelScenery,
                reason: 'Image Subject: Travel/Scenery',
                tokens: ['beach', 'mountain', 'sunset', 'landscape', 'travel', 'vacation', 'playa', 'montana', 'atardecer', 'paisaje', 'viaje', 'vacaciones']
            }
        ].filter((rule) => rule.enabled);

        if (!rules.length) return;

        const postCandidates = this._getPostCandidates(rootNode)
            .filter((postWrapper) => {
                if (!postWrapper || postWrapper.dataset.pfHidden) return false;
                if (!this._isValidPostScope(postWrapper)) return false;
                if (!this._isLikelySingleFeedPost(postWrapper)) return false;
                return true;
            });

        if (!postCandidates.length) return;

        const matchedPosts = [];

        postCandidates.forEach((postWrapper) => {
            const imageSignals = this._extractImageSubjectSignals(postWrapper);
            if (!imageSignals.length) return;

            for (const rule of rules) {
                if (imageSignals.some((signal) => this._containsAnyToken(signal, rule.tokens))) {
                    matchedPosts.push({ node: postWrapper, reason: rule.reason });
                    break;
                }
            }
        });

        if (!matchedPosts.length) return;

        const scannedCount = postCandidates.length;
        const maxHide = Math.max(3, Math.floor(scannedCount * 0.35));
        if ((scannedCount > 2 && matchedPosts.length >= scannedCount) || matchedPosts.length > maxHide) {
            PF_Logger.warn(`Image subject filter safety bailout: matched ${matchedPosts.length}/${scannedCount}.`);
            return;
        }

        matchedPosts.forEach(({ node, reason }) => {
            this._hidePostNode(node, reason);
        });
    }

    removeNavigationModules(rootNode) {
        const sidebar = this.settings?.sidebar;
        if (!sidebar || !sidebar.enableModuleFilters) return;

        const rightSelector = PF_SELECTOR_MAP.rightSidebar || '[role="complementary"]';

        const leftNav = this._resolveLeftNavigationContainer(rootNode);
        const rightNav = this._resolveScopedContainer(rootNode, rightSelector);

        // Optional check for topbar again (rootNode might be the whole body or just a fragment)
        // If removeTopbarModules is called separately, we ensure it's robust.

        if (leftNav) {
            if (sidebar.hideLeftMarketplace) {
                this._hideLeftNavByHref(leftNav, ['/marketplace'], 'Left Nav: Marketplace');
            }
            if (sidebar.hideLeftWatch) {
                this._hideLeftNavByHref(leftNav, ['/watch'], 'Left Nav: Watch');
            }
            if (sidebar.hideLeftGaming) {
                this._hideLeftNavByHref(leftNav, ['/gaming', '/games'], 'Left Nav: Gaming');
            }
            if (sidebar.hideLeftMemories) {
                this._hideLeftNavByHref(leftNav, ['/memories'], 'Left Nav: Memories');
            }
            if (sidebar.hideLeftMetaAI) {
                this._hideLeftNavByHref(leftNav, ['/ai', 'meta.ai'], 'Left Nav: Meta AI');
                this._hideLeftNavByExactLabel(leftNav, ['meta ai', 'meta ia'], 'Left Nav: Meta AI');
                this._hideLeftAIModules(leftNav, 'Left Nav: Meta AI', {
                    labels: ['meta ai', 'meta ia'],
                    hrefTokens: ['meta.ai', '/ai']
                });
            }
            if (sidebar.hideLeftManusAI) {
                this._hideLeftAIModules(leftNav, 'Left Nav: Manus AI', {
                    labels: ['manus ai', 'manus'],
                    hrefTokens: ['/manus', 'manus.ai']
                });
            }
        }

        if (rightNav) {
            if (sidebar.hideRightTrending) {
                this._hideRightModuleByHeading(rightNav, ['trending', 'tendencias', 'popular now'], 'Right Sidebar: Trending');
                this._hideRightModuleByLink(rightNav, ['/search/top/', '/hashtag/'], 'Right Sidebar: Trending');
            }

            if (sidebar.hideRightContacts) {
                this._hideRightModuleByAriaLabel(rightNav, ['contacts', 'contactos'], 'Right Sidebar: Contacts');
                this._hideRightModuleByHeading(rightNav, ['contacts', 'contactos'], 'Right Sidebar: Contacts');
            }

            if (sidebar.hideRightMetaAIContact) {
                this._hideRightContactsByNames(rightNav, ['meta ai', 'meta ia'], 'Right Sidebar: Meta AI Contact');
            }

            if (sidebar.hideRightManusAIContact) {
                this._hideRightContactsByNames(rightNav, ['manus ai', 'manus'], 'Right Sidebar: Manus AI Contact');
            }

            if (sidebar.hideRightEvents) {
                this._hideRightModuleByHeading(rightNav, ['events', 'eventos', 'upcoming events', 'proximos eventos'], 'Right Sidebar: Events');
                this._hideRightModuleByLink(rightNav, ['/events/'], 'Right Sidebar: Events');
            }

            if (sidebar.hideRightBirthdays) {
                this._hideRightModuleByHeading(rightNav, ['birthdays', 'birthday', 'cumpleanos', 'cumpleanos proximos'], 'Right Sidebar: Birthdays');
                this._hideRightModuleByLink(rightNav, ['/events/birthdays/', '/birthdays/'], 'Right Sidebar: Birthdays');
            }
        }
    }

    _resolveScopedContainer(rootNode, selector) {
        if (!selector) return null;

        if (rootNode?.matches && rootNode.matches(selector)) {
            return rootNode;
        }

        if (rootNode?.querySelector) {
            const inside = rootNode.querySelector(selector);
            if (inside) return inside;
        }

        if (rootNode?.closest) {
            const ancestor = rootNode.closest(selector);
            if (ancestor) return ancestor;
        }

        return document.querySelector(selector);
    }

    _resolveLeftNavigationContainer(rootNode) {
        const strictSelector = PF_SELECTOR_MAP.leftSidebar || '[role="navigation"][aria-label="Facebook"]';

        const strict = this._resolveScopedContainer(rootNode, strictSelector);
        if (strict) return strict;

        const candidates = Array.from(document.querySelectorAll('[role="navigation"]'))
            .filter((node) => node && this._isLikelyLeftNavRegion(node));

        if (candidates.length === 0) return null;

        const withShortcuts = candidates.find((node) => this._hasShortcutsHeading(node));
        if (withShortcuts) return withShortcuts;

        return candidates[0] || null;
    }

    _isLikelyLeftNavRegion(node) {
        if (!node || !node.getBoundingClientRect) return false;

        const rect = node.getBoundingClientRect();
        if (rect.width < 180 || rect.width > 520) return false;
        if (rect.height < 240) return false;
        if (rect.left > window.innerWidth * 0.42) return false;

        if (node.querySelector('[role="feed"], [role="complementary"], [role="banner"]')) return false;

        const linkCount = node.querySelectorAll('a[role="link"], a[href], [role="link"]').length;
        return linkCount >= 6;
    }

    _hasShortcutsHeading(node) {
        if (!node || !node.querySelectorAll) return false;

        return Array.from(node.querySelectorAll('h2, h3, [role="heading"], span, div')).some((el) => {
            const text = this._normalizeComparableText(el.textContent || '');
            return text === 'your shortcuts' || text === 'tus accesos directos';
        });
    }

    removeTopbarModules(rootNode) {
        const topbar = this.settings?.topbarFilters;
        if (!topbar || !topbar.enabled) return;

        const banner = this._resolveTopbarBanner(rootNode);
        if (!banner) return;

        const topbarScopes = this._resolveTopbarScopes(banner);

        if (topbar.hideHome) {
            this._hideTopbarByAriaLabels(topbarScopes, ['home', 'inicio', 'accueil', 'inicial', 'startseite', 'hem', 'thuis'], 'Topbar: Home');
            this._hideTopbarByHrefTokens(topbarScopes, ['/home.php', '/?sk=welcome', '/?sk=h_nor', '/?sk=h_chr'], 'Topbar: Home');
            // FB home button often uses href="/" exactly — too short for a substring
            // match so we use the exact-href helper instead.
            this._hideTopbarByExactHref(topbarScopes, ['/'], 'Topbar: Home');
        }
        if (topbar.hideFriends) {
            this._hideTopbarByAriaLabels(topbarScopes, [
                // EN / ES / FR / PT / DE / IT / NL / SV / NO / DA
                'friends', 'amigos', 'amis', 'freunde', 'amici', 'vrienden', 'vanner', 'venner'
            ], 'Topbar: Friends');
            this._hideTopbarByHrefTokens(topbarScopes, ['/friends'], 'Topbar: Friends');
        }
        if (topbar.hideWatch) {
            this._hideTopbarByAriaLabels(topbarScopes, [
                // FB keeps "Watch" in most locales; add native-language variants where known
                'watch', 'videos', 'video',
                'regarder',             // FR
                'assistir',             // PT
                'ver videos', 'ver video', // ES
                'videos ansehen',       // DE
                'guarda', 'guarda i video', // IT
                'bekijk videos',        // NL
                'titta pa',             // SV
            ], 'Topbar: Watch');
            this._hideTopbarByHrefTokens(topbarScopes, ['/watch'], 'Topbar: Watch');
        }
        if (topbar.hideMarketplace) {
            this._hideTopbarByAriaLabels(topbarScopes, [
                // "Marketplace" is kept in English in most locales
                'marketplace', 'mercado', 'marktplatz', 'mercato', 'marche'
            ], 'Topbar: Marketplace');
            this._hideTopbarByHrefTokens(topbarScopes, ['/marketplace'], 'Topbar: Marketplace');
        }
        if (topbar.hideGroups) {
            this._hideTopbarByAriaLabels(topbarScopes, [
                'groups', 'grupos', 'groupes', 'gruppen', 'gruppi',
                'groepen',              // NL
                'grupper',              // SV / NO / DA
            ], 'Topbar: Groups');
            this._hideTopbarByHrefTokens(topbarScopes, ['/groups'], 'Topbar: Groups');
        }
        if (topbar.hideMessenger) {
            this._hideTopbarByAriaLabels(topbarScopes, [
                'messenger', 'messages', 'mensajes', 'mensagens', 'nachrichten', 'messaggi',
                'berichten',            // NL
                'meddelanden',          // SV
                'meldinger',            // NO
                'beskeder',             // DA
            ], 'Topbar: Messenger');
            this._hideTopbarByHrefTokens(topbarScopes, ['/messages', '/chats', '/t/'], 'Topbar: Messenger');
        }
        if (topbar.hideNotifications) {
            // Count-badge stripping in _matchesTopbarLabels handles "(N unread)" suffix.
            this._hideTopbarByAriaLabels(topbarScopes, [
                'notifications', 'notificaciones', 'notificacoes', 'notifiche', 'benachrichtigungen',
                'notifications',        // FR (same as EN)
                'notificaties',         // NL
                'aviseringar',          // SV
                'varsler', 'notifikationer', // NO / DA
            ], 'Topbar: Notifications');
            this._hideTopbarByHrefTokens(topbarScopes, ['/notifications'], 'Topbar: Notifications');
        }
        if (topbar.hideMenu) {
            // Diacritics are stripped by _normalizeComparableText, so "menú" / "menü" → "menu"
            this._hideTopbarByAriaLabels(topbarScopes, [
                'menu', 'meniu', 'more', 'mas', 'voir plus', 'mehr',
            ], 'Topbar: Menu');
            this._hideTopbarByHrefTokens(topbarScopes, ['/menu'], 'Topbar: Menu');
        }
        if (topbar.hideCreate) {
            this._hideTopbarByAriaLabels(topbarScopes, [
                'create', 'crear', 'creer', 'criar', 'erstellen', 'crea',
                'creeren',              // NL (diacritics stripped)
                'skapa',                // SV
                'opprette',             // NO
                'opret',                // DA
            ], 'Topbar: Create');
            this._hideTopbarByHrefTokens(topbarScopes, ['/create'], 'Topbar: Create');
        }
        if (topbar.hideGaming) {
            this._hideTopbarByAriaLabels(topbarScopes, [
                'gaming', 'games', 'play',
                'juegos',               // ES
                'jeux',                 // FR
                'jogos',                // PT
                'spiele',               // DE
                'giochi',               // IT
                'spellen',              // NL
                'spel',                 // SV
            ], 'Topbar: Gaming');
            this._hideTopbarByHrefTokens(topbarScopes, ['/gaming', '/games', '/play'], 'Topbar: Gaming');
        }
    }

    _resolveTopbarBanner(rootNode) {
        const banner = this._resolveScopedContainer(rootNode, '[role="banner"]');
        if (!banner || !banner.getBoundingClientRect) return banner;

        const rect = banner.getBoundingClientRect();
        if (rect.width < 280 || rect.height < 36 || rect.height > 320) return null;
        return banner;
    }

    _resolveTopbarScopes(banner) {
        if (!banner || !banner.querySelectorAll) return [];

        const scopes = [];
        const addScope = (node) => {
            if (!node || scopes.includes(node)) return;
            if (!this._isLikelyTopbarScope(node, banner)) return;
            scopes.push(node);
        };

        addScope(banner);

        const selectors = [
            '[role="navigation"]',
            'nav',
            '[data-pagelet*="TopNav"]',
            '[data-pagelet*="CometAppNavigation"]',
            '[data-pagelet*="AppTabBar"]'
        ];

        selectors.forEach((selector) => {
            banner.querySelectorAll(selector).forEach(addScope);
        });

        return scopes.length ? scopes : [banner];
    }

    _isLikelyTopbarScope(node, banner) {
        if (!node || !node.querySelectorAll || !banner) return false;
        if (node !== banner && !banner.contains(node)) return false;

        const actionCount = node.querySelectorAll('a[href], a[role="link"], [role="button"], [role="link"], button').length;
        if (actionCount < 3) return false;

        if (!node.getBoundingClientRect || !banner.getBoundingClientRect) return true;

        const rect = node.getBoundingClientRect();
        const bannerRect = banner.getBoundingClientRect();

        if (rect.width < 180) return false;
        if (rect.height < 24 || rect.height > 220) return false;
        if (rect.top < bannerRect.top - 16 || rect.bottom > bannerRect.bottom + 28) return false;

        return true;
    }

    _iterateTopbarScopes(scopeNodes, visitor) {
        const scopes = Array.isArray(scopeNodes) ? scopeNodes : [scopeNodes];
        const seen = new Set();

        scopes.forEach((scopeNode) => {
            if (!scopeNode || !scopeNode.querySelectorAll || seen.has(scopeNode)) return;
            seen.add(scopeNode);
            visitor(scopeNode);
        });
    }

    _extractTopbarLabelSignals(node) {
        const signals = [];
        const seen = new Set();
        const addSignal = (value) => {
            const normalized = this._normalizeComparableText(value || '');
            if (!normalized || normalized.length < 2 || normalized.length > 90) return;
            if (seen.has(normalized)) return;
            seen.add(normalized);
            signals.push(normalized);
        };

        if (!node) return signals;

        addSignal(node.getAttribute && node.getAttribute('aria-label'));
        addSignal(node.getAttribute && node.getAttribute('title'));
        addSignal(node.textContent || '');

        const clickable = PF_Helpers.getClosest(node, 'a[role="link"], a[href], [role="button"], button', 3);
        if (clickable && clickable !== node) {
            addSignal(clickable.getAttribute && clickable.getAttribute('aria-label'));
            addSignal(clickable.getAttribute && clickable.getAttribute('title'));
            addSignal(clickable.textContent || '');
        }

        return signals;
    }

    _matchesTopbarLabels(labelSignals, normalizedLabels) {
        if (!Array.isArray(labelSignals) || !labelSignals.length) return false;
        if (!Array.isArray(normalizedLabels) || !normalizedLabels.length) return false;

        return labelSignals.some((signal) => {
            // FB appends/prepends unread counts to icon labels:
            // Suffix: "Notifications (3 unread)", "Messages (2)"
            // Prefix: "3 unread Notifications", "5 Messages"
            // Colon/Dash: "Notifications: 3", "2 - Messages"
            
            let stripped = signal
                .replace(/\s*\(\d+[^)]*\)\s*$/, '') // Suffix (N)
                .replace(/^\s*\d+[^a-z]*\s*/i, '')  // Prefix N
                .replace(/\s*[:\-]\s*\d+\s*$/, '')  // Suffix : N or - N
                .trim();

            return normalizedLabels.some((label) =>
                signal === label
                || signal.startsWith(`${label} `)
                || stripped === label
                || stripped.startsWith(`${label} `)
            );
        });
    }

    _hideTopbarByHrefTokens(scopeNodes, hrefTokens, reason) {
        if (!Array.isArray(hrefTokens) || hrefTokens.length === 0) return;

        const normalizedTokens = hrefTokens
            .map((token) => String(token || '').toLowerCase().trim())
            .filter(Boolean);
        if (!normalizedTokens.length) return;

        this._iterateTopbarScopes(scopeNodes, (scopeNode) => {
            scopeNode.querySelectorAll('a[href]').forEach((anchor) => {
                const href = String(anchor.getAttribute('href') || '').toLowerCase();
                if (!href) return;
                if (!normalizedTokens.some((token) => href.includes(token))) return;

                const target = this._findTopbarHideTarget(anchor, scopeNode);
                if (!target) return;

                this._hideNodeSafely(target, reason);
            });
        });
    }

    /**
     * Like _hideTopbarByHrefTokens but performs an exact href match rather than
     * a substring includes check.  Needed for the Home button whose href is
     * simply "/" — too short and common to use as a substring token.
     */
    _hideTopbarByExactHref(scopeNodes, exactHrefs, reason) {
        if (!Array.isArray(exactHrefs) || exactHrefs.length === 0) return;

        const normalizedHrefs = exactHrefs
            .map((h) => String(h || '').toLowerCase().trim())
            .filter(Boolean);
        if (!normalizedHrefs.length) return;

        this._iterateTopbarScopes(scopeNodes, (scopeNode) => {
            scopeNode.querySelectorAll('a[href]').forEach((anchor) => {
                const href = String(anchor.getAttribute('href') || '').toLowerCase().split('?')[0].replace(/\/$/, '');
                if (!normalizedHrefs.some((h) => {
                    const normalized = h.split('?')[0].replace(/\/$/, '');
                    return href === normalized || href === h;
                })) return;

                const target = this._findTopbarHideTarget(anchor, scopeNode);
                if (!target) return;

                this._hideNodeSafely(target, reason);
            });
        });
    }

    _hideTopbarByAriaLabels(scopeNodes, labels, reason) {
        if (!Array.isArray(labels) || labels.length === 0) return;

        const normalizedLabels = labels
            .map((label) => this._normalizeComparableText(label))
            .filter(Boolean);
        if (!normalizedLabels.length) return;

        this._iterateTopbarScopes(scopeNodes, (scopeNode) => {
            const candidates = new Set();

            scopeNode.querySelectorAll('a[role="link"], a[href], [role="button"], [role="link"], button, [aria-label], [title]').forEach((node) => {
                candidates.add(node);
            });

            candidates.forEach((node) => {
                const labelSignals = this._extractTopbarLabelSignals(node);
                if (!this._matchesTopbarLabels(labelSignals, normalizedLabels)) return;

                const target = this._findTopbarHideTarget(node, scopeNode);
                if (!target) return;

                this._hideNodeSafely(target, reason);
            });
        });
    }

    _findTopbarHideTarget(node, scopeNode) {
        if (!node) return null;

        const clickable = PF_Helpers.getClosest(node, 'a[role="link"], a[href], [role="button"], button', 4) || node;
        if (!clickable || clickable === scopeNode) return null;
        if (clickable.querySelector && clickable.querySelector('[role="banner"]')) return null;

        const navItem = PF_Helpers.getClosest(clickable, '[role="listitem"], li', 4);
        if (navItem && navItem !== scopeNode && this._isReasonableTopbarTarget(navItem)) {
            return navItem;
        }

        if (clickable.getBoundingClientRect) {
            const rect = clickable.getBoundingClientRect();
            if (rect.width < 18 || rect.width > 320) return null;
            if (rect.height < 18 || rect.height > 120) return null;
        }

        const inBanner = !!PF_Helpers.getClosest(clickable, '[role="banner"]', 8);
        if (!inBanner) return null;

        return clickable;
    }

    _hideLeftNavByHref(scopeNode, hrefTokens, reason) {
        if (!scopeNode || !scopeNode.querySelectorAll || !Array.isArray(hrefTokens) || hrefTokens.length === 0) return;

        scopeNode.querySelectorAll('a[href]').forEach((anchor) => {
            const href = (anchor.getAttribute('href') || '').toLowerCase();
            if (!href) return;
            if (!hrefTokens.some((token) => href.includes(token))) return;

            const target = this._findCompactNavContainer(anchor, scopeNode);
            this._hideNodeSafely(target, reason);
        });
    }

    _hideLeftNavByExactLabel(scopeNode, labels, reason) {
        if (!scopeNode || !scopeNode.querySelectorAll || !Array.isArray(labels) || labels.length === 0) return;

        const normalizedLabels = labels
            .map((label) => this._normalizeComparableText(label))
            .filter(Boolean);

        if (!normalizedLabels.length) return;

        scopeNode.querySelectorAll('a[role="link"], a[href]').forEach((anchor) => {
            const text = this._normalizeComparableText(anchor.textContent || '');
            if (!text || text.length < 4 || text.length > 48) return;
            if (!normalizedLabels.some((label) => text === label)) return;

            const target = this._findCompactNavContainer(anchor, scopeNode);
            this._hideNodeSafely(target, reason);
        });
    }

    _hideLeftAIModules(scopeNode, reason, config = {}) {
        const labels = Array.isArray(config.labels) ? config.labels : [];
        const hrefTokens = Array.isArray(config.hrefTokens) ? config.hrefTokens : [];

        const navScopes = [];
        if (scopeNode && scopeNode.querySelectorAll) navScopes.push(scopeNode);

        document.querySelectorAll('[role="navigation"]').forEach((node) => {
            if (!node || navScopes.includes(node)) return;
            if (!this._isLikelyLeftNavRegion(node)) return;
            navScopes.push(node);
        });

        if (!navScopes.length) return;

        navScopes.forEach((navScope) => {
            const shortcutsHeading = Array.from(navScope.querySelectorAll('h2, h3, [role="heading"], span, div')).find((node) => {
                const text = this._normalizeComparableText(node.textContent || '');
                return text === 'your shortcuts' || text === 'tus accesos directos';
            });

            const shortcutsTop = shortcutsHeading?.getBoundingClientRect ? shortcutsHeading.getBoundingClientRect().top : null;

            navScope.querySelectorAll('a[role="link"], a[href], [role="link"], [role="button"]').forEach((entry) => {
                if (!entry || !this._isVisibleNavRow(entry)) return;

                if (shortcutsTop !== null && entry.getBoundingClientRect) {
                    const top = entry.getBoundingClientRect().top;
                    if (top >= shortcutsTop - 4) return;
                }

                const text = this._normalizeComparableText(entry.textContent || '');
                if (!text || text.length < 2 || text.length > 48) return;

                const href = (entry.getAttribute && entry.getAttribute('href') ? entry.getAttribute('href') : '').toLowerCase();
                if (!this._isLikelyLeftAIItem(text, href, labels, hrefTokens)) return;

                const target = this._findLeftNavRowContainer(entry, navScope);
                this._hideNodeSafely(target, reason);
            });
        });
    }

    _findLeftNavRowContainer(entry, navScope) {
        if (!entry) return null;

        const clickable = entry.matches && entry.matches('a, [role="button"], [role="link"]')
            ? entry
            : (PF_Helpers.getClosest(entry, 'a, [role="button"], [role="link"]', 4) || entry);

        let current = clickable;
        let depth = 0;
        while (current && current !== navScope && depth < 8) {
            if (this._isVisibleNavRow(current)) {
                return current;
            }
            current = current.parentElement;
            depth += 1;
        }

        return clickable;
    }

    _isVisibleNavRow(node) {
        if (!node || !node.getBoundingClientRect) return false;

        const rect = node.getBoundingClientRect();
        if (rect.width < 70 || rect.width > 560) return false;
        if (rect.height < 20 || rect.height > 120) return false;
        if (rect.bottom < 0 || rect.top > window.innerHeight) return false;

        return true;
    }

    _isLikelyLeftAIItem(text, href, labels = [], hrefTokens = []) {
        if (!text) return false;

        const normalizedLabels = labels.map((label) => this._normalizeComparableText(label)).filter(Boolean);
        if (normalizedLabels.length > 0) {
            if (normalizedLabels.some((label) => {
                const isExact = text === label || text.startsWith(`${label} `);
                const isPartial = label.length >= 4 && text.includes(label);
                return isExact || isPartial;
            })) {
                return true;
            }
        }

        if (href && hrefTokens.length > 0) {
            const normalizedHrefTokens = hrefTokens
                .map((token) => String(token || '').toLowerCase())
                .filter(Boolean);

            if (normalizedHrefTokens.some((token) => href.includes(token))) {
                return true;
            }
        }

        return false;
    }

    _hideRightModuleByAriaLabel(scopeNode, labels, reason) {
        if (!scopeNode || !scopeNode.querySelectorAll || !Array.isArray(labels) || labels.length === 0) return;

        const normalizedLabels = labels
            .map((label) => this._normalizeComparableText(label))
            .filter(Boolean);

        if (!normalizedLabels.length) return;

        scopeNode.querySelectorAll('[aria-label]').forEach((node) => {
            const aria = this._normalizeComparableText(node.getAttribute('aria-label') || '');
            if (!aria || !normalizedLabels.some((label) => aria === label || aria.startsWith(`${label} `))) return;

            const target = this._findRightModuleContainer(node, scopeNode);
            this._hideNodeSafely(target, reason);
        });
    }

    _hideRightModuleByHeading(scopeNode, labels, reason) {
        if (!scopeNode || !scopeNode.querySelectorAll || !Array.isArray(labels) || labels.length === 0) return;

        const normalizedLabels = labels
            .map((label) => this._normalizeComparableText(label))
            .filter(Boolean);

        if (!normalizedLabels.length) return;

        const headingSelector = 'h2, h3, [role="heading"], [role="heading"][aria-level]';
        scopeNode.querySelectorAll(headingSelector).forEach((heading) => {
            const text = this._normalizeComparableText(heading.textContent || '');
            if (!text || text.length < 4 || text.length > 72) return;
            if (!normalizedLabels.some((label) => text === label || text.startsWith(`${label} `))) return;

            const target = this._findRightModuleContainer(heading, scopeNode);
            this._hideNodeSafely(target, reason);
        });
    }

    _hideRightModuleByLink(scopeNode, hrefTokens, reason) {
        if (!scopeNode || !scopeNode.querySelectorAll || !Array.isArray(hrefTokens) || hrefTokens.length === 0) return;

        scopeNode.querySelectorAll('a[href]').forEach((anchor) => {
            const href = (anchor.getAttribute('href') || '').toLowerCase();
            if (!href) return;
            if (!hrefTokens.some((token) => href.includes(token))) return;

            const target = this._findRightModuleContainer(anchor, scopeNode);
            this._hideNodeSafely(target, reason);
        });
    }

    _hideRightContactsByNames(scopeNode, names, reason) {
        if (!scopeNode || !scopeNode.querySelectorAll || !Array.isArray(names) || names.length === 0) return;

        const normalized = names.map((name) => this._normalizeComparableText(name)).filter(Boolean);
        if (!normalized.length) return;

        scopeNode.querySelectorAll('a[role="link"], a[href], [role="button"], [role="link"]').forEach((entry) => {
            if (!entry || !this._isVisibleNavRow(entry)) return;

            const text = this._normalizeComparableText(entry.textContent || '');
            if (!text || text.length < 3 || text.length > 48) return;
            if (!normalized.some((value) => text === value || text.startsWith(`${value} `))) return;

            const target = this._findCompactNavContainer(entry, scopeNode);
            this._hideNodeSafely(target, reason);
        });
    }

    _findRightModuleContainer(node, scopeNode) {
        if (!node) return null;

        const moduleRegion = PF_Helpers.getClosest(node, '[role="region"], section, [data-pagelet], div[aria-label]', 8);
        if (moduleRegion && moduleRegion !== scopeNode && !moduleRegion.matches('[role="complementary"]')) {
            return moduleRegion;
        }

        return this._findCompactNavContainer(node, scopeNode);
    }

    _findCompactNavContainer(node, scopeNode) {
        if (!node) return null;

        if (node.getBoundingClientRect) {
            const ownRect = node.getBoundingClientRect();
            if (ownRect.height >= 24 && ownRect.height <= 140 && ownRect.width >= 80 && ownRect.width <= 560) {
                return node;
            }
        }

        const listItem = PF_Helpers.getClosest(node, '[role="listitem"], li', 6);
        if (listItem && listItem !== scopeNode) return listItem;

        let current = node.parentElement;
        let depth = 0;

        while (current && current !== scopeNode && depth < 8) {
            if (current.getBoundingClientRect) {
                const rect = current.getBoundingClientRect();
                if (rect.height >= 26 && rect.height <= 240 && rect.width > 80 && rect.width <= 520) {
                    return current;
                }
            }

            current = current.parentElement;
            depth++;
        }

        if (node.matches && node.matches('[role="listitem"], li')) return node;
        return null;
    }

    _hideNodeSafely(node, reason) {
        if (!node || node.dataset.pfHidden === 'true') return;
        if (reason && reason.startsWith('Topbar:') && !this._isReasonableTopbarTarget(node)) return;
        if (!this._isSafeHideTargetNode(node)) return;
        PF_Helpers.hideElement(node, reason);
    }

    _isReasonableTopbarTarget(node) {
        if (!node || !node.getBoundingClientRect) return false;
        if (node.matches && node.matches('[role="banner"]')) return false;
        if (node.querySelector && node.querySelector('[role="banner"]')) return false;

        const rect = node.getBoundingClientRect();
        if (rect.width < 18 || rect.width > 320) return false;
        if (rect.height < 18 || rect.height > 140) return false;

        const actionCount = node.querySelectorAll
            ? node.querySelectorAll('a[href], a[role="link"], [role="button"], [role="link"], button').length
            : 0;
        if (actionCount > 4) return false;

        const inBanner = !!PF_Helpers.getClosest(node, '[role="banner"]', 8);
        if (!inBanner) return false;

        const banner = PF_Helpers.getClosest(node, '[role="banner"]', 8);
        if (banner && banner.getBoundingClientRect) {
            const bannerRect = banner.getBoundingClientRect();
            if (rect.top < bannerRect.top - 14 || rect.bottom > bannerRect.bottom + 20) return false;
        }

        return true;
    }

    /**
     * Hunt for side-rail specific ads which Facebook generates using different logic than Feed units.
     * @param {HTMLElement} rootNode 
     */
    removeRightRailAds(rootNode) {
        // Find the right column container
        const rightCol = rootNode.matches('[role="complementary"]') ? rootNode : rootNode.querySelector('[role="complementary"]');
        if (!rightCol) return;

        // 1. Static known containers
        const staticAds = rightCol.querySelectorAll('[data-pagelet="RightRailAdUnits"], [data-pagelet="EgoPane"]');
        staticAds.forEach((ad) => {
            if (this._looksLikeContactsModule(ad)) return;
            this._hideNodeSafely(ad, "Right Rail Target");
        });

        // 2. Deep traverse for obfuscated text injection
        // FB injects "Sponsored" as literal text nodes in the sidebar
        const adSpans = PF_Helpers.findContains(rightCol, 'span, div, h2, h3', 'Sponsored')
            .concat(PF_Helpers.findContains(rightCol, 'span, div, h2, h3', 'Publicidad'))
            .concat(PF_Helpers.findContains(rightCol, 'span, div, h2, h3', 'Patrocinado'));
        adSpans.forEach(el => {
            // Verify exact match to prevent false positives if someone's name contains the word
            if (this._isSponsoredLabel(el.textContent)) {
                const targetWrap = this._findRightRailAdContainer(el, rightCol);
                if (targetWrap && !targetWrap.dataset.pfHidden) {
                    this._hideNodeSafely(targetWrap, "Right Rail Heuristics");
                }
            }
        });
    }

    _findRightRailAdContainer(markerNode, rightCol) {
        if (!markerNode) return null;

        const strictPagelet = PF_Helpers.getClosest(markerNode, '[data-pagelet="RightRailAdUnits"], [data-pagelet="EgoPane"]', 8);
        if (strictPagelet && !this._looksLikeContactsModule(strictPagelet)) {
            return strictPagelet;
        }

        const listItem = PF_Helpers.getClosest(markerNode, '[role="listitem"], li', 6);
        if (listItem && !this._looksLikeContactsModule(listItem) && this._isLikelyAdCardContainer(listItem)) {
            return listItem;
        }

        let current = markerNode.parentElement;
        let depth = 0;
        while (current && current !== rightCol && depth < 9) {
            if (this._looksLikeContactsModule(current)) return null;
            if (this._isLikelyAdCardContainer(current)) return current;
            current = current.parentElement;
            depth += 1;
        }

        return null;
    }

    _looksLikeContactsModule(node) {
        if (!node || !node.querySelector) return false;

        if (node.querySelector('[aria-label="Contacts"], [aria-label="Contactos"]')) return true;

        const heading = node.querySelector('h2, h3, [role="heading"]');
        const headingText = this._normalizeComparableText(heading?.textContent || '');
        if (headingText === 'contacts' || headingText === 'contactos') return true;

        const text = this._normalizeComparableText((node.textContent || '').slice(0, 800));
        if (!text) return false;

        const hasContactsToken = text.includes('contacts') || text.includes('contactos');
        const manyLinks = node.querySelectorAll('a[role="link"], a[href]').length >= 8;
        return hasContactsToken && manyLinks;
    }

    _isLikelyAdCardContainer(node) {
        if (!node || !node.getBoundingClientRect) return false;

        const rect = node.getBoundingClientRect();
        if (rect.width < 140 || rect.width > 560) return false;
        if (rect.height < 40 || rect.height > 760) return false;

        const text = this._normalizeComparableText((node.textContent || '').slice(0, 900));
        const hasSponsoredToken = this.sponsoredTokens.some((token) => text.includes(this._normalizeComparableText(token)));
        const hasOutboundLinks = node.querySelectorAll('a[href]').length >= 1;
        const hasMedia = !!node.querySelector('img, video, canvas');

        if (this._looksLikeContactsModule(node)) return false;
        if (hasSponsoredToken) return true;

        return hasOutboundLinks && hasMedia;
    }

    /**
     * More aggressive hunt for the Reels Tray since Facebook constantly changes the data-pagelet names.
     */
    removeReelsTray(rootNode) {
        // 1. Map Check
        this.hideTarget(rootNode, PF_SELECTOR_MAP.reelsTray, "Reels Target Array");

        // 2. Text Heuristic Check
        // The rootNode is usually the feed post itself during dynamic injection
        const textNodes = PF_Helpers.findContains(rootNode, 'span, h2, h3, div', 'Reels');
        textNodes.forEach(node => {
            const text = node.textContent.trim();
            // Match "Reels", "Reels and short videos", etc., ignoring long sentences
            if (text === 'Reels' || text.includes('Reels and short videos')) {
                // Try to find the specific post wrapper enclosing this element
                const postWrapper = PF_Helpers.getClosest(node, PF_SELECTOR_MAP.postContainer) || node.parentElement.parentElement.parentElement.parentElement;
                if (postWrapper && !postWrapper.dataset.pfHidden) {
                    this._hidePostNode(postWrapper, "Reels Tray Heuristic");
                }
            }
        });
    }

    applyReelsSessionLimiter(rootNode) {
        const wellbeing = this.settings?.wellbeing;
        if (!wellbeing?.reelsLimiterEnabled) return;

        const limit = Math.max(1, Math.min(20, Number(wellbeing.reelsSessionLimit || 3)));
        const hardLock = !!wellbeing.reelsHardLock;

        const candidates = this._findReelLimiterCandidates(rootNode);
        if (!candidates.length) return;

        candidates.forEach((candidate) => {
            if (!candidate || this._reelsTrackedNodes.has(candidate)) return;

            this._reelsTrackedNodes.add(candidate);
            this._reelsSeenCount += 1;

            const overLimit = this._reelsSeenCount > limit;
            if (!overLimit) return;

            const reason = hardLock ? 'Reels Session Hard Lock' : 'Reels Session Limit';
            this._hidePostNode(candidate, reason);

            if (!this._reelsLimitNoticeShown) {
                this._reelsLimitNoticeShown = true;
                const message = hardLock
                    ? `Reels hard lock active after ${limit} reels this session.`
                    : `Reels session limit reached (${limit}). Additional reels hidden.`;
                PF_Helpers.showToast(message, 'info', 4200);
            }
        });
    }

    _findReelLimiterCandidates(rootNode) {
        if (!rootNode || !rootNode.querySelectorAll) return [];

        const found = new Set();

        const addCandidate = (node) => {
            if (!node) return;
            const wrapper = PF_Helpers.getClosest(node, PF_SELECTOR_MAP.postContainer, 8)
                || PF_Helpers.getClosest(node, '[data-pagelet*="Reels"], [data-pagelet*="Shorts"]', 8)
                || (node.matches && node.matches(PF_SELECTOR_MAP.postContainer) ? node : null);
            if (!wrapper) return;
            if (wrapper.dataset?.pfHidden === 'true') return;
            found.add(wrapper);
        };

        const reelsSelectors = [
            PF_SELECTOR_MAP.reelsTray,
            '[data-pagelet*="Reels"]',
            '[data-pagelet*="Shorts"]',
            'a[href*="/reel/"]'
        ];

        reelsSelectors.forEach((selector) => {
            if (!selector) return;
            rootNode.querySelectorAll(selector).forEach(addCandidate);
        });

        const textMarkers = PF_Helpers.findContains(rootNode, 'span, h2, h3, div', 'Reels')
            .concat(PF_Helpers.findContains(rootNode, 'span, h2, h3, div', 'short videos'));

        textMarkers.forEach((node) => {
            const text = this._normalizeComparableText(node.textContent || '');
            if (text === 'reels' || text.includes('reels and short videos') || text.includes('short videos')) {
                addCandidate(node);
            }
        });

        return Array.from(found).filter((node) => this._isSafeHideTargetNode(node));
    }

    _resetReelsLimiterSession() {
        this._reelsSeenCount = 0;
        this._reelsTrackedNodes = new WeakSet();
        this._reelsLimitNoticeShown = false;
    }

    /**
     * Aggressively hunts the Stories bar which lacks distinct wrapper names.
     */
    removeStoriesTray(rootNode) {
        // 1. Map Check
        this.hideTarget(rootNode, PF_SELECTOR_MAP.storiesTray, "Stories Target Array");

        // 2. Text Heuristic Check
        // Stories bar almost always contains exactly "Create story"
        const spans = PF_Helpers.findContains(rootNode, 'span, div', 'Create story');
        spans.forEach(node => {
            if (node.textContent.trim() === 'Create story') {
                // Find the main horizontal scrolling wrapper
                // FB uses many nested divs, we want to find the one bounding the entire strip.
                const storyWrap = PF_Helpers.getClosest(node, 'div[data-pagelet]') || node.parentElement.parentElement.parentElement.parentElement.parentElement;
                if (storyWrap && !storyWrap.dataset.pfHidden) {
                    this._hidePostNode(storyWrap, "Stories Tray Heuristic");
                }
            }
        });
    }

    /**
     * Hunt for sponsored elements, tracking up to their feed post parent to eradicate.
     * @param {HTMLElement} rootNode 
     */
    removeSponsored(rootNode) {
        let targets = [];

        // 1. Standard Selector / SVG heuristic
        for (const selector of PF_SELECTOR_MAP.sponsoredIndicators) {
            if (selector.includes(':contains')) {
                const text = selector.match(/:contains\("([^"]+)"\)/)[1];
                const parts = selector.split(':');
                const baseSelector = parts[0];
                targets = targets.concat(PF_Helpers.findContains(rootNode, baseSelector, text));
            } else {
                targets = targets.concat(Array.from(rootNode.querySelectorAll(selector)));
            }
        }

        // 2. Advanced aria-labelledby heuristic (Manifest V3 God-Mode)
        // FB often uses: <span aria-labelledby="some-id"></span> ... <span id="some-id">Sponsored</span>
        const labeledElements = rootNode.querySelectorAll('[aria-labelledby]');
        labeledElements.forEach(el => {
            const labelId = el.getAttribute('aria-labelledby');
            const labelNode = document.getElementById(labelId);
            if (labelNode) {
                const text = labelNode.textContent.trim();
                if (this._isSponsoredLabel(text)) {
                    targets.push(el);
                }
            }
        });

        // 3. Post-level fallback scan for localized Sponsored markers.
        const postCandidates = this._getPostCandidates(rootNode);
        postCandidates.forEach((post) => {
            if (!post || post.dataset.pfHidden) return;
            const marker = this._findSponsoredMarkerInPost(post);
            if (marker) targets.push(marker);
        });

        // 4. data-ad-preview attribute scan — DISABLED.
        // Facebook uses data-ad-preview on both ad post bodies AND comment text containers.
        // There is no reliable way to distinguish the two without false-positive comment hiding.
        // Sponsored detection is handled by Steps 1, 2, 3, and 5.

        // 5. Multi-signal article scan — uses signals confirmed from live DOM inspection.
        // All of these are FB ad-infrastructure markers, never present on organic posts.
        rootNode.querySelectorAll('[role="article"]').forEach((article) => {
            if (article.parentElement?.closest('[role="article"]')) return;
            if (article.closest('[role="complementary"]')) return;
            if (article.dataset.pfHidden) return;

            const adSignal = article.querySelector([
                // Ad explanation page links (various FB domains)
                'a[href*="/ads/about"]',
                'a[href*="ad_preferences"]',
                'a[href*="about_ads"]',
                'a[href*="adchoices"]',
                'a[href*="facebook.com/ads"]',
                'a[href*="fb.com/ads"]',
                // Content Flow Token (_cft_) in href = Facebook ad tracking parameter.
                // FB appends this exclusively to links inside sponsored posts.
                'a[href*="_cft_[0]"]',
                'a[href*="_cft_%5B0%5D"]',
                // testid fallback
                '[data-testid="fbfeed_ads_native_container"]',
                // NOTE: [attributionsrc], [data-ad-rendering-role] removed —
                // both appear on organic comment profile links, not exclusive to ads.
            ].join(', '));

            if (adSignal) this._hidePostNode(article, 'Sponsored Post (Ad Signal)');
        });

        for (const indicator of targets) {
            // Skip any indicator that is inside a comment dialog or comment section.
            // Facebook uses identical markup for comments and ads, so any ad-signal
            // inside a comment area is a false positive.
            if (indicator.closest('[role="dialog"]')) continue;

            // Only hide if the indicator is inside a proper pagelet feed unit.
            // Do NOT fall back to hiding [role="article"] — comment articles pass
            // that check and are not distinguishable from post articles here.
            const postWrapper = PF_Helpers.getClosest(indicator, PF_SELECTOR_MAP.postContainer);

            if (postWrapper) {
                this._hidePostNode(postWrapper, "Sponsored Post (Heuristic)");
            }
        }
    }

    /**
     * Messenger Privacy: Suppresses 'Is typing...' in window title and 
     * other non-CSS signals.
     */
    _applyMessengerPrivacyFilters() {
        if (!this.settings?.social?.hideMessengerTyping) return;

        // Suppress "Is typing..." in the window title
        if (document.title.toLowerCase().includes('typing...')) {
            const originalTitle = document.title;
            // Facebook/Messenger title format: " (1) [Name] is typing..." or "[Name] is typing..."
            const newTitle = originalTitle.replace(/\s*is typing\.\.\.\s*/gi, ' ');
            if (newTitle !== originalTitle) {
                document.title = newTitle;
            }
        }
    }

    /**
     * Nuke Meta AI gradient icons and sparkle buttons.
     */
    removeMetaAI(rootNode) {
        // 1. Top Search Bar
        this.hideTarget(rootNode, PF_SELECTOR_MAP.metaAISearchIcon, "Meta AI Search Icon");
        
        // 2. Messenger Sparkle & AI Chats
        this.hideTarget(rootNode, PF_SELECTOR_MAP.metaAIMessengerSparkle, "Meta AI Messenger Sparkle");
        this.hideTarget(rootNode, PF_SELECTOR_MAP.metaAIHeader, "Meta AI Header");

        // 3. Left navigation AI modules (Meta AI / Manus AI / similar)
        const leftNav = this._resolveLeftNavigationContainer(rootNode);

        if (leftNav) {
            this._hideLeftAIModules(leftNav, 'Social: Hide Meta AI', {
                labels: ['meta ai', 'meta ia'],
                hrefTokens: ['meta.ai', '/ai']
            });

            // If Nuke Meta AI is on, we also sweep for Manus AI as it's a prominent AI module
            this._hideLeftAIModules(leftNav, 'Social: Hide Meta AI (Manus)', {
                labels: ['manus ai', 'manus'],
                hrefTokens: ['manus.ai', '/manus']
            });
        }

        const rightSelector = PF_SELECTOR_MAP.rightSidebar || '[role="complementary"]';
        const rightNav = this._resolveScopedContainer(rootNode, rightSelector);
        if (rightNav) {
            this._hideRightContactsByNames(rightNav, ['meta ai', 'meta ia'], 'Social: Hide Meta AI');
            this._hideRightContactsByNames(rightNav, ['manus ai', 'manus'], 'Social: Hide Meta AI (Manus)');
        }
    }

    /**
     * Notification Soul-Soother: Styles or hides red alert jewels in the header.
     */
    _applyNotificationJewelStyle(rootNode) {
        const style = this.settings?.uiMode?.notificationJewelStyle;
        if (!style || style === 'classic') return;

        const banner = this._resolveTopbarBanner(rootNode);
        if (!banner) return;

        // Target: Notification dot containers inside the header buttons.
        // FB Comet uses spans with red background color for count badges.
        const jewelCandidates = banner.querySelectorAll('span, div');
        jewelCandidates.forEach((el) => {
            if (this._isNotificationJewel(el)) {
                this._applyJewelStyleToNode(el, style);
            }
        });
    }

    _isNotificationJewel(el) {
        if (!el || !el.classList || el.children.length > 0) return false;

        // Visual identification: jewels are small, round, and RED.
        const computed = window.getComputedStyle(el);
        const bg = computed.backgroundColor;
        
        // Facebook red: rgb(240, 40, 73) / #f02849
        const isRed = bg.includes('240, 40, 73') || bg.includes('rgb(245, 61, 89)');
        if (!isRed) return false;

        // Size check: jewels are small (usually 14-22px depending on count)
        const rect = el.getBoundingClientRect();
        if (rect.width > 26 || rect.height > 26 || rect.width < 5) return false;

        // Context check: Must be inside a button-like or nav-like container in topbar
        return !!el.closest('[role="button"], [role="link"], a');
    }

    _applyJewelStyleToNode(node, style) {
        node.classList.remove('pf-jewel-blue', 'pf-jewel-purple', 'pf-jewel-grey', 'pf-jewel-hidden');
        
        if (style === 'hidden') {
            node.classList.add('pf-jewel-hidden');
        } else if (style === 'blue') {
            node.classList.add('pf-jewel-blue');
        } else if (style === 'purple') {
            node.classList.add('pf-jewel-purple');
        } else if (style === 'grey') {
            node.classList.add('pf-jewel-grey');
        }
    }

    removeSuggestedPosts(rootNode) {
        // Suggested for you
        const suggestedWrapper = rootNode.querySelectorAll(PF_SELECTOR_MAP.suggestedForYouWrapper);
        suggestedWrapper.forEach(node => this._hidePostNode(node, "Suggested Posts"));

        if (this.settings.filters.removePYMK) {
            const pymkWrapper = rootNode.querySelectorAll(PF_SELECTOR_MAP.peopleYouMayKnow);
            pymkWrapper.forEach(node => this._hidePostNode(node, "People You May Know"));
        }

        if (this.settings.filters.removeGroupSuggestions) {
            const selectors = Array.isArray(PF_SELECTOR_MAP.suggestedGroups) ? PF_SELECTOR_MAP.suggestedGroups : [PF_SELECTOR_MAP.suggestedGroups];
            for (const selector of selectors) {
                let targets = [];
                if (selector.includes(':contains')) {
                    const text = selector.match(/:contains\("([^"]+)"\)/)[1];
                    const parts = selector.split(':');
                    const baseSelector = parts[0];
                    targets = PF_Helpers.findContains(rootNode, baseSelector, text);
                } else {
                    targets = Array.from(rootNode.querySelectorAll(selector));
                }
                
                targets.forEach(node => {
                    // Try to find the bounding pagelet or post container
                    const wrap = PF_Helpers.getClosest(node, 'div[data-pagelet]') || node;
                    this._hidePostNode(wrap, "Suggested Groups");
                });
            }
        }
    }

    removeFriendActivity(rootNode) {
        // Find headers indicating friend algorithmic activity
        const activityPatterns = ['commented on', 'liked', 'replied to', 'was mentioned in', 'is interested in'];
        
        const authorHeaders = rootNode.querySelectorAll('h3, h4, span > strong');
        authorHeaders.forEach(header => {
            const text = header.parentElement.textContent.toLowerCase();
            for (const pattern of activityPatterns) {
                if (text.includes(pattern)) {
                    // Make sure it's not the user's actual post text. These headers usually sit above the actual post content.
                    const postWrapper = PF_Helpers.getClosest(header, PF_SELECTOR_MAP.postContainer);
                    if (postWrapper) {
                        this._hidePostNode(postWrapper, `Friend Activity Filter: ${pattern}`);
                    }
                    break;
                }
            }
        });
    }

    removeColoredBackgrounds(rootNode) {
        const coloredWrappers = rootNode.querySelectorAll(PF_SELECTOR_MAP.postColoredBackground);
        coloredWrappers.forEach(bg => {
            // Unset background styles forcing text back to standard rendering
            bg.style.backgroundImage = 'none';
            bg.style.backgroundColor = 'transparent';
            bg.style.color = 'var(--primary-text)';
            // Note: Facebook uses complex nested DOM, so this will strip styles but text may need sizing fixed which we handle in UI tweaks.
        });
    }

    removeClickbait(rootNode) {
        // Regex patterns matching traditional high-volume viral clickbait
        const clickbaitRegex = /(you won.?t believe|this one trick|what happens next|will shock you|leave you speechless|reason why|this is why)/i;
        
        // Headlines on shared links are typically inside anchor tags or header blocks within the post body
        // But to be thorough we'll just check the base text payload
        const textNodes = rootNode.querySelectorAll(PF_SELECTOR_MAP.postTextBody);
        textNodes.forEach(textContainer => {
            const textContent = textContainer.textContent;
            if (clickbaitRegex.test(textContent)) {
                const postWrapper = PF_Helpers.getClosest(textContainer, PF_SELECTOR_MAP.postContainer);
                if (postWrapper && !this._isAllowlistedPost(postWrapper, textContent.toLowerCase(), false)) {
                    this._collapsePost(postWrapper, "Clickbait Blocked", false);
                }
            }
        });
    }

    applyKeywordFilters(rootNode) {
        const autohide = this.settings.keywords.autohide || [];
        const blocklist = this.settings.keywords.blocklist || [];
        const allowlist = this.settings.keywords.allowlist || [];
        const sourceBlocklist = this.settings.keywords.sourceBlocklist || [];
        
        if (autohide.length === 0 && blocklist.length === 0 && allowlist.length === 0 && sourceBlocklist.length === 0) return;

        const normalizedSourceBlocklist = sourceBlocklist
            .map((value) => this._normalizeText(value))
            .filter(Boolean);

        const postCandidates = this._getPostCandidates(rootNode);

        postCandidates.forEach((postWrapper) => {
            if (!postWrapper || postWrapper.dataset.pfHidden) return;

            const textContent = this._extractPostText(postWrapper).toLowerCase();
            if (this._isAllowlistedPost(postWrapper, textContent, true)) return;

            if (normalizedSourceBlocklist.length > 0) {
                const source = this._normalizeText(this._extractPostSource(postWrapper));
                if (source && normalizedSourceBlocklist.some((term) => source.includes(term))) {
                    this._hidePostNode(postWrapper, 'Source Blocklist');
                    return;
                }
            }

            if (!textContent) return;

            // Check auto-hide (Full silent deletion)
            let hidden = false;
            for (const kw of autohide) {
                const normalized = this._normalizeText(kw);
                if (normalized && textContent.includes(normalized)) {
                    this._hidePostNode(postWrapper, `Keyword Autohide: ${kw}`);
                    hidden = true;
                    break;
                }
            }
            if (hidden) return;

            // Check blocklist (Soft hiding/collapse)
            for (const kw of blocklist) {
                const normalized = this._normalizeText(kw);
                if (normalized && textContent.includes(normalized)) {
                    this._collapsePost(postWrapper, kw, true);
                    break; // stop at first match
                }
            }

            // Friends Only Mode check
            if (this.settings.uiMode.friendsOnlyMode) {
                if (
                    postWrapper.querySelector('a[href*="/groups/"]')
                    || textContent.includes('suggested for you')
                    || textContent.includes('sponsored')
                    || textContent.includes('join group')
                ) {
                    this._hidePostNode(postWrapper, "Friends Only Mode: Group/Page Hidden");
                    return;
                }
            }

            // Fundraiser hide check
            if (this.settings.filters.hideFundraisers) {
                if (textContent.includes('fundraiser') || textContent.includes('donate')) {
                    this._hidePostNode(postWrapper, "Fundraiser Module");
                }
            }
        });
    }

    _getPostCandidates(rootNode) {
        const results = [];
        const seen = new Set();

        const addCandidate = (node) => {
            if (!node || seen.has(node)) return;
            seen.add(node);
            results.push(node);
        };

        if (rootNode.matches && rootNode.matches(PF_SELECTOR_MAP.postContainer)) {
            addCandidate(rootNode);
        }

        if (rootNode.querySelectorAll) {
            rootNode.querySelectorAll(PF_SELECTOR_MAP.postContainer).forEach(addCandidate);

            // Article-based post shells — Facebook's current Comet layout no longer
            // uses [role="feed"] as a wrapper, so we accept top-level articles
            // directly. Skip comment articles (nested inside a parent article) and
            // sidebar articles so we don't accidentally process non-post content.
            rootNode.querySelectorAll('[role="article"]').forEach((article) => {
                if (article.parentElement?.closest('[role="article"]')) return; // comment article
                if (article.closest('[role="complementary"]')) return;          // sidebar

                const wrapped = PF_Helpers.getClosest(article, PF_SELECTOR_MAP.postContainer, 3) || article;
                addCandidate(wrapped);
            });
        }

        return results;
    }

    _findSponsoredMarkerInPost(postNode) {
        const postRect = postNode.getBoundingClientRect ? postNode.getBoundingClientRect() : null;

        // Pass 1: aria-label and single-node textContent scan (fast path)
        const candidates = postNode.querySelectorAll('[aria-label], a[role="link"], span, div');
        for (const node of candidates) {
            const text = this._normalizeComparableText(
                node.getAttribute('aria-label')
                || node.textContent
                || ''
            );

            if (!text || text.length > 32) continue;
            if (!this._isSponsoredLabel(text)) continue;

            // Prefer markers near the top header area of a post.
            if (postRect && node.getBoundingClientRect) {
                const rect = node.getBoundingClientRect();
                if (rect.top - postRect.top > 260) continue;
            }

            return node;
        }

        // Pass 2: TreeWalker deep text reconstruction.
        // FB sometimes splits "Sponsored" across many tiny adjacent text nodes so
        // that no single node's textContent equals the full word.  TreeWalker
        // reconstructs the concatenated string and strips ZWC before matching.
        const strip = (s) => s.replace(/[\u00ad\u200b-\u200f\u2028\u2029\u202a-\u202f\u2060\u2061\ufeff]/g, '');
        const walker = document.createTreeWalker(postNode, NodeFilter.SHOW_TEXT, null, false);
        let rebuilt = '';
        let lastNode = null;
        while (walker.nextNode()) {
            const raw = walker.currentNode.nodeValue || '';
            rebuilt += strip(raw);
            // Once we accumulate enough chars to potentially contain a token, check.
            // Reset after 80 chars to avoid matching across unrelated text blocks.
            if (rebuilt.length > 80) rebuilt = rebuilt.slice(-40);
            if (this._isSponsoredLabel(rebuilt.trim())) return walker.currentNode.parentElement || postNode;
            lastNode = walker.currentNode;
        }
        void lastNode; // suppress unused-var lint

        return null;
    }

    _isSponsoredLabel(text) {
        // Strip zero-width and invisible Unicode chars FB injects between letters
        // (e.g. U+200B ZERO WIDTH SPACE, U+200C/D, U+2060, U+FEFF) to defeat text
        // matching. Then strip diacritics so accented forms match the token list.
        const cleaned = String(text || '').replace(/[\u00ad\u200b-\u200f\u2028\u2029\u202a-\u202f\u2060\u2061\ufeff]/g, '');
        const normalized = this._normalizeComparableText(cleaned);
        if (!normalized) return false;

        return this.sponsoredTokens.some((token) => {
            return normalized === token
                || normalized.startsWith(`${token} `)
                || normalized.startsWith(`${token} ·`)
                || normalized.startsWith(`${token}:`);
        });
    }

    _hidePostNode(node, reason) {
        if (!node || node.dataset.pfHidden === 'true') return;
        if (node.matches && node.matches('html, body, [role="main"], [role="feed"]')) return;
        if (!this._isSafeHideTargetNode(node)) return;
        if (this._isAllowlistedPost(node)) return;

        if (this._isUndoEligible(node)) {
            this._insertUndoChip(node, reason);
        }

        PF_Helpers.hideElement(node, reason);
    }

    _isUndoEligible(node) {
        if (!node || !node.matches) return false;
        if (node.matches('[role="dialog"]')) return false;

        return node.matches('[data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"]')
            || !!PF_Helpers.getClosest(node, '[role="feed"]', 8);
    }

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
    }

    _restorePost(node, chip) {
        if (!node) return;

        node.style.removeProperty('display');
        delete node.dataset.pfHidden;
        delete node.dataset.pfReason;
        delete node.dataset.pfUndoChip;

        if (chip && chip.remove) chip.remove();
    }

    _extractPostSource(node) {
        if (!node || !node.querySelector) return 'Unknown';

        const candidates = [
            'h2 a[role="link"]',
            'h3 a[role="link"]',
            'h4 a[role="link"]',
            'strong a[role="link"]',
            'h2',
            'h3',
            'h4',
            'strong'
        ];

        for (const selector of candidates) {
            const found = node.querySelector(selector);
            const text = found?.textContent?.trim();
            if (text && text.length > 1) return text;
        }

        return 'Unknown';
    }

    _isAllowlistedPost(node, cachedText = null, includeKeywordAllowlist = false) {
        if (!node) return false;

        const friends = (this.settings?.keywords?.allowlistFriends || [])
            .map((v) => String(v).trim().toLowerCase())
            .filter(Boolean);

        if (friends.length > 0) {
            const source = this._extractPostSource(node).toLowerCase();
            if (friends.some((friend) => source.includes(friend))) return true;
        }

        if (includeKeywordAllowlist) {
            const allowlist = (this.settings?.keywords?.allowlist || [])
                .map((v) => String(v).trim().toLowerCase())
                .filter(Boolean);

            if (allowlist.length > 0) {
                const textBody = (cachedText || this._extractPostText(node)).toLowerCase();
                if (allowlist.some((kw) => textBody.includes(kw))) return true;
            }
        }

        return false;
    }

    _extractStoryHeaderSignals(node) {
        if (!node || !node.querySelectorAll) return [];

        const parts = [];
        const seen = new Set();
        const postRect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
        const selectors = 'h2, h3, h4, [role="heading"], a[role="link"] span[dir="auto"], span[dir="auto"]';

        node.querySelectorAll(selectors).forEach((el) => {
            if (parts.length >= 20) return;

            const comparable = this._normalizeComparableText(el.textContent || '');
            if (!comparable || comparable.length < 8 || comparable.length > 220) return;
            if (seen.has(comparable)) return;

            if (postRect && el.getBoundingClientRect) {
                const rect = el.getBoundingClientRect();
                const topOffset = rect.top - postRect.top;
                if (topOffset < -4 || topOffset > 260) return;
            }

            if (!this._looksLikeStoryActivitySignal(comparable)) return;

            seen.add(comparable);
            parts.push(comparable);
        });

        return parts;
    }

    _looksLikeStoryActivitySignal(text) {
        if (!text) return false;

        return /(friends?|group|commented|liked|reacted|shared a memory|memories on facebook|event|attending|interested in|going to|amigos?|grupo|comento|comentado|gusto|reacciono|recuerdo|recuerdos|evento|asistio|asistira|interesado|amis|groupe|commente|aime|souvenir|evenement|freund|gruppe|kommentiert|gefallt|erinnerung|veranstaltung|interessiert|interessato|partecipa|relazione)/.test(text);
    }

    _extractImageSubjectSignals(node) {
        if (!node || !node.querySelectorAll) return [];

        const parts = [];
        const seen = new Set();
        const selectors = 'img[alt], [role="img"][aria-label], image[aria-label], video[aria-label]';

        node.querySelectorAll(selectors).forEach((el) => {
            if (parts.length >= 16) return;

            const raw = (el.getAttribute('alt') || el.getAttribute('aria-label') || '').trim();
            const comparable = this._normalizeComparableText(raw);
            if (!comparable || comparable.length < 8 || comparable.length > 280) return;
            if (!this._looksLikeImageDescriptor(comparable)) return;
            if (seen.has(comparable)) return;

            seen.add(comparable);
            parts.push(comparable);
        });

        return parts;
    }

    _classifyPostType(node) {
        if (!node || !node.querySelectorAll) return null;

        const anchors = this._extractPostTypeAnchors(node);
        const anchorText = anchors.join(' ');

        // ── Existing selectors ────────────────────────────────────────────────
        const hasVideoSelector = !!node.querySelector(
            'video, a[href*="/watch/"], a[href*="/videos/"], a[href*="/reel/"], [data-pagelet*="Video"], [data-pagelet*="Reels"], [data-pagelet*="Shorts"]'
        );

        const hasPhotoSelector = !!node.querySelector(
            'a[href*="/photo/"], a[href*="/photos/"], a[href*="fbid="][href*="/photo"], a[href*="/media/set/"], [data-pagelet*="Photo"]'
        );

        const hasExternalLinkSelector = this._hasExternalLinkTarget(node);

        // ── Live Video selectors ──────────────────────────────────────────────
        // FB live posts carry /live/ hrefs, data-pagelet Live markers, or a
        // streaming video element with autoplay that FB sets for live feeds.
        const hasLiveSelector = !!node.querySelector(
            'a[href*="/live/"], a[href*="live_status=LIVE"], a[href*="live_status=LIVE_STOPPED"], [data-pagelet*="LiveVideoUnit"]'
        );

        // ── Share/Repost selectors ────────────────────────────────────────────
        // Reposts typically carry a /share/ href and a nested blockquote-style
        // preview card.  We also detect them via the "shared [name]'s post"
        // header phrasing.
        const hasRepostSelector = !!node.querySelector(
            'a[href*="/share/"], a[href*="/permalink/"][href*="story_fbid"]'
        );

        // ── Poll selectors ────────────────────────────────────────────────────
        // Polls carry interactive option lists and "Vote" / "See Results"
        // buttons. We look for poll-specific aria-labels and test-id fragments.
        //
        // NOTE: [role="listbox"] alone is too broad — Facebook also uses it for
        // comment-sort dropdowns and other menus. We only count it if the listbox
        // contains at least 2 [role="option"] children (real poll answer rows),
        // which menus do not have at initial render.
        const pollListbox = node.querySelector('[role="listbox"]');
        const pollListboxIsReal = pollListbox
            ? pollListbox.querySelectorAll('[role="option"]').length >= 2
            : false;
        const hasPollSelector = pollListboxIsReal
            || !!node.querySelector('[aria-label*="poll" i], [data-testid*="poll"], [data-testid*="Poll"]');

        // ── Anchor-phrase matchers ────────────────────────────────────────────
        const hasVideoAnchor = /(shared (a )?video|watch(ing)?( now)?|reels?|short videos?|video en vivo|compartio (un )?video|ver video|videos? cortos?|a partage (une )?video|video en direct|regarder|partilhou (um )?video|video ao vivo|video curto|kurzvideos?|hat (ein )?video geteilt|ha condiviso (un )?video|guarda (il )?video)/.test(anchorText);
        const hasPhotoAnchor = /(shared (a )?(photo|album)|photo(s)?( update)?|image(s)?|album|compartio (una )?(foto|imagen)|compartio (un )?album|fotos?|imagenes?|a partage (une )?(photo|image|album)|photo de profil|partilhou (uma )?(foto|imagem|album)|fotos? de perfil|hat (ein )?(foto|bild|album) geteilt|profilbild|titelbild|ha condiviso (una )?(foto|immagine|album)|foto del profilo)/.test(anchorText);
        const hasLinkAnchor = /(shared (a )?link|read more|link preview|open link|enlace|leer mas|articulo|a partage (un )?lien|lire la suite|apercu du lien|partilhou (um )?link|ler mais|previa do link|hat (einen )?link geteilt|mehr lesen|linkvorschau|ha condiviso (un )?link|leggi di piu|anteprima link)/.test(anchorText)
            || /\bhttps?:\/\/|www\./.test(anchorText);

        // Live video anchors: "is live now", "went live", "watching live", etc.
        // EN / ES / FR / PT / DE / IT / NL / SV / DA / NO
        const hasLiveAnchor = /(is live( now)?|went live|live( now)?|watching live|live stream|live video|live broadcast|esta(ba)? en vivo( ahora)?|esta ao vivo|est en direct( maintenant)?|diffuse en direct|live-video|ist live( jetzt)?|geht live|ging live|e in diretta( ora)?|va in diretta|is live nu|gaat live|ging live|ar live nu|gar live|er live nu|gar live)/.test(anchorText);

        // Share/Repost anchors: "[name] shared [name]'s post", "shared a post", etc.
        const hasRepostAnchor = /(shared [a-z\u00c0-\u024f\u0400-\u04ff\u4e00-\u9fff\s''\-]{2,40}'s post|shared a post|shared [a-z\u00c0-\u024f\u0400-\u04ff\u4e00-\u9fff\s''\-]{2,40}'s (status|update)|compartio la publicacion de|compartio un post|a partage la publication de|a partage un post|partilhou a publicacao de|partilhou um post|hat den beitrag von|hat einen post geteilt|ha condiviso il post di|ha condiviso un post)/.test(anchorText);

        // Poll anchors: "voted in a poll", "created a poll", vote/result CTAs.
        const hasPollAnchor = /(voted? (in|on) a poll|created? a poll|see (poll )?results?|view (poll )?results?|voto en una encuesta|creo una encuesta|ver resultados de la encuesta|a vote dans un sondage|a cree un sondage|voir les resultats|votou numa sondagem|criou um inquerito|hat (an einer )?umfrage abgestimmt|ha votato (in|su) un sondaggio|heeft gestemd op een peiling|heeft een peiling aangemaakt|zie resultaten( van de peiling)?|rosta(de)? i en omrostning|skapade en omrostning|visa resultat(en)?|stemte pa en afstemning|se afstemningsresultaterne|stemte pa en avstemning|se resultatene)/.test(anchorText);

        // ── Evidence scoring ──────────────────────────────────────────────────
        const evidence = {
            video: (hasVideoSelector ? 2 : 0) + (hasVideoAnchor ? 1 : 0),
            photo: (hasPhotoSelector ? 2 : 0) + (hasPhotoAnchor ? 1 : 0),
            link: (hasExternalLinkSelector ? 2 : 0) + (hasLinkAnchor ? 1 : 0),
            liveVideo: (hasLiveSelector ? 2 : 0) + (hasLiveAnchor ? 1 : 0),
            shareRepost: (hasRepostSelector ? 2 : 0) + (hasRepostAnchor ? 1 : 0),
            poll: (hasPollSelector ? 2 : 0) + (hasPollAnchor ? 1 : 0)
        };

        const mediaNodeCount = this._countPostMediaNodes(node);

        // ── Base type decisions ───────────────────────────────────────────────
        const video = evidence.video >= 2 || (evidence.video >= 1 && evidence.photo === 0 && evidence.link === 0);
        const photo = !video && (evidence.photo >= 2 || (evidence.photo >= 1 && evidence.link === 0));
        const link = !video && !photo && (evidence.link >= 2);

        const textLength = this._extractPostText(node).length;
        const hasMeaningfulText = textLength >= 30;
        const textOnly = hasMeaningfulText && !video && !photo && !link && mediaNodeCount === 0;

        // ── Extended type decisions ───────────────────────────────────────────
        // Live video requires a strong signal (selector OR strong anchor match).
        // It is intentionally independent of the base `video` flag so that a
        // user can hide live-only without hiding all video posts.
        const liveVideo = evidence.liveVideo >= 2 || (evidence.liveVideo >= 1 && hasLiveAnchor);

        // Share/Repost: selector OR anchor phrase is sufficient given the
        // specificity of both signals.  Require at least 1 evidence point.
        const shareRepost = evidence.shareRepost >= 1;

        // Poll: selector alone is reliable; anchor alone is accepted too.
        const poll = evidence.poll >= 1;

        return {
            video,
            photo,
            link,
            textOnly,
            liveVideo,
            shareRepost,
            poll
        };
    }

    _extractPostTypeAnchors(node) {
        if (!node || !node.querySelectorAll) return [];

        const parts = [];
        const seen = new Set();
        const postRect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
        const selectors = 'h2, h3, h4, [role="heading"], a[role="link"], span[dir="auto"], div[dir="auto"]';

        node.querySelectorAll(selectors).forEach((el) => {
            if (parts.length >= 18) return;

            const comparable = this._normalizeComparableText(el.textContent || '');
            if (!comparable || comparable.length < 6 || comparable.length > 180) return;
            if (seen.has(comparable)) return;

            if (postRect && el.getBoundingClientRect) {
                const rect = el.getBoundingClientRect();
                const topOffset = rect.top - postRect.top;
                if (topOffset < -4 || topOffset > 300) return;
            }

            if (!this._looksLikePostTypeAnchor(comparable)) return;

            seen.add(comparable);
            parts.push(comparable);
        });

        return parts;
    }

    _countPostMediaNodes(node) {
        if (!node || !node.querySelectorAll) return 0;

        return node.querySelectorAll(
            'video, img, [role="img"], image, canvas, svg image, iframe, a[href*="/photo/"], a[href*="/videos/"], a[href*="/watch/"]'
        ).length;
    }

    _looksLikePostTypeAnchor(text) {
        if (!text) return false;

        // Base post-type tokens (video / photo / link / live / poll / repost)
        return /(video|watch|reel|short video|photo|photos|image|album|shared a link|link preview|read more|live(?: now)?|went live|is live|live stream|live video|live broadcast|poll|voted?|see results|view results|shared .{0,40}'s post|shared a post|enlace|leer mas|articulo|compartio|fotos?|imagenes?|lien|lire la suite|apercu|partage|sondage|est en direct|linkvorschau|mehr lesen|geteilt|umfrage|abgestimmt|immagine|leggi di piu|anteprima|sondaggio|condiviso|partilhou|ler mais|previa do link|inquerito|ging live|is live nu|peiling|gestemd)/.test(text);
    }

    _hasExternalLinkTarget(node) {
        if (!node || !node.querySelectorAll) return false;

        const anchors = node.querySelectorAll('a[href]');
        for (const anchor of anchors) {
            const href = String(anchor.getAttribute('href') || '').trim();
            if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
                continue;
            }

            const lowered = href.toLowerCase();
            if (lowered.includes('/l.php?u=')) return true;

            let url;
            try {
                url = new URL(href, window.location.origin);
            } catch (err) {
                continue;
            }

            const host = String(url.hostname || '').toLowerCase();
            if (!host) continue;

            const isFacebookHost = host === 'facebook.com'
                || host.endsWith('.facebook.com')
                || host === 'messenger.com'
                || host.endsWith('.messenger.com')
                || host === 'm.facebook.com';

            if (!isFacebookHost) return true;
        }

        return false;
    }

    _looksLikeImageDescriptor(text) {
        if (!text) return false;

        if (/(may be (an )?(image|photo)|image of|photo of|picture of|screenshot|meme|text that says|puede ser (una )?(imagen|foto)|imagen de|foto de|captura de pantalla|texto que dice)/.test(text)) {
            return true;
        }

        return /(soccer|football|basketball|food|pizza|dog|cat|car|truck|beach|mountain|atardecer|viaje|comida|mascota)/.test(text);
    }

    _containsAnyToken(text, tokens) {
        if (!text || !Array.isArray(tokens) || tokens.length === 0) return false;

        return tokens.some((token) => {
            const normalizedToken = this._normalizeComparableText(token);
            return normalizedToken && text.includes(normalizedToken);
        });
    }

    /**
     * Returns true if `postWrapper` is a valid feed post scope for post-type
     * filtering. Accepts both pagelet-wrapped posts (classic FB feed) and
     * top-level article posts (current Facebook Comet layout, which no longer
     * wraps posts in [data-pagelet] containers).
     */
    _isValidPostScope(postWrapper) {
        if (!postWrapper || !postWrapper.matches) return false;

        // Classic pagelet-wrapped feed/ad posts.
        if (postWrapper.matches(
            '[data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"], ' +
            '[data-pagelet^="GroupsFeedUnit_"], [data-pagelet^="GroupFeedUnit_"], ' +
            '[data-pagelet^="PageFeedUnit_"]'
        )) return true;

        // Article-based posts (Comet / current layout).
        if (postWrapper.matches('[role="article"]')) {
            if (postWrapper.parentElement?.closest('[role="article"]')) return false; // comment
            if (postWrapper.closest('[role="complementary"]')) return false;          // sidebar
            return true;
        }

        return false;
    }

    _isLikelySingleFeedPost(node) {
        if (!node || !node.querySelectorAll) return false;

        if (node.querySelector('[role="feed"]')) return false;

        const articleCount = node.querySelectorAll('[role="article"]').length;
        if (articleCount === 0) return false;
        if (articleCount > 1) return false;

        const textLength = (node.textContent || '').length;
        if (textLength > 9000) return false;

        return true;
    }

    _extractPostText(node) {
        if (!node || !node.querySelectorAll) return '';

        const parts = [];
        const seen = new Set();

        const selectors = [
            PF_SELECTOR_MAP.postTextBody,
            '[data-ad-comet-preview="message"]',
            'div[dir="auto"]',
            'span[dir="auto"]'
        ];

        selectors.forEach((selector) => {
            node.querySelectorAll(selector).forEach((el) => {
                const text = this._normalizeText(el.textContent || '');
                if (!text || text.length < 2) return;
                if (seen.has(text)) return;
                seen.add(text);
                parts.push(text);
            });
        });

        if (parts.length > 0) {
            return parts.join(' ');
        }

        return this._normalizeText(node.textContent || '');
    }

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
    }

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
    }

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
    }

    _startRecoveryWatchdog() {
        if (this._recoveryIntervalId) return;

        this._recoveryIntervalId = setInterval(() => {
            if (document.hidden) return;
            this._restoreCriticalContainers();
            this._checkFeedRecovery();
        }, 1500);
    }

    _checkFeedRecovery() {
        if (this._panicMode) return;

        const feed = document.querySelector('[role="feed"]');
        if (!feed) return;

        const hiddenByPF = feed.querySelectorAll('[data-pf-hidden="true"]').length;
        if (!hiddenByPF) return;

        const visibleArticles = Array.from(feed.querySelectorAll('[role="article"]')).filter((node) => {
            if (!node || node.dataset.pfHidden === 'true') return false;
            const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
            return !!rect && rect.width > 0 && rect.height > 0;
        }).length;

        if (visibleArticles > 0) return;

        PF_Logger.warn(`Cleaner panic recovery activated. Hidden feed nodes: ${hiddenByPF}.`);
        this._panicMode = true;

        document.querySelectorAll('[data-pf-hidden="true"]').forEach((node) => {
            if (!node) return;
            node.style.removeProperty('display');
            delete node.dataset.pfHidden;
            delete node.dataset.pfReason;
        });
    }

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
    }

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
    }

    _i18n(key, fallback) {
        if (typeof chrome === 'undefined' || !chrome.i18n) return fallback;
        return chrome.i18n.getMessage(key) || fallback;
    }

    _normalizeText(text) {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    _normalizeComparableText(text) {
        return String(text || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

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

    hideTarget(rootNode, selector, reason) {
        const targets = rootNode.querySelectorAll(selector);
        targets.forEach((node) => {
            if (!this._isSafeHideTargetNode(node)) return;
            PF_Helpers.hideElement(node, reason);
        });
    }
}

window.PF_Cleaner = PF_Cleaner;
