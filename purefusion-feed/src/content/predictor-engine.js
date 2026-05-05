/**
 * PureFusion Feed - Predictor Engine
 *
 * Defines the PF_Predictor class with its constructor, core node-processing
 * pipeline, scoring models, score effects, engagement learning, trend analysis,
 * utility helpers, and lifecycle management.  Prototype methods that belong to
 * specific feature areas (blocklist/allowlist persistence, UI injection) are
 * added by the sibling files predictor-sources.js and predictor-ui.js, which
 * must be loaded after this file.
 *
 * Load order requirement: this file FIRST, then predictor-sources.js and
 * predictor-ui.js, then main.js (which calls `new window.PF_Predictor(settings)`).
 */

class PF_Predictor {
    constructor(settings) {
        this.settings = settings;

        // Internal state
        this.engagementProfiles = {}; // { 'authorId/Name': { likes: 5, comments: 2, lastSeen: time } }
        this.keywordFrequency = {}; // { 'word': count }

        // Tracking queue so we don't hammer local storage on every click
        this._stateDirty = false;
        this.syncIntervalId = null;
        this.boundVisibilityHandler = null;
        this.boundInsightToggleHandler = null;
        this._stylesInjected = false;

        // Session content-type filters — populated by "Hide similar" action; cleared on reset or page reload
        this.sessionContentFilters = new Set();

        // Persistent author blocklist — loaded from local storage, survives page reloads
        this.blocklist = new Set();

        // Persistent author allowlist — "Always show source" entries; exempt from session filters
        this.allowlist = new Set();

        // Friend Activity Feed Insight — authors seen as post authors this session
        this._sessionFeedAuthors = new Set();
        this._friendBadgeDebounce = null;

        this._injectPredictorStyles();
        this.init();
    }

    async init() {
        // Load history from local storage (bypasses sync 5mb limit)
        const history = await PF_Storage.getLocalData('pf_prediction_history');
        if (history) {
            this.engagementProfiles = history.profiles || {};
            this.keywordFrequency = history.freq || {};
        }

        // Load persistent author blocklist
        const blocklistData = await PF_Storage.getLocalData('pf_blocklist');
        if (Array.isArray(blocklistData) && blocklistData.length > 0) {
            this.blocklist = new Set(blocklistData);
        }

        // Load persistent author allowlist
        const allowlistData = await PF_Storage.getLocalData('pf_allowlist');
        if (Array.isArray(allowlistData) && allowlistData.length > 0) {
            this.allowlist = new Set(allowlistData);
        }

        // Start periodic sync
        if (!this.syncIntervalId) {
            this.syncIntervalId = setInterval(() => {
                if (document.hidden) return;
                this._syncState();
            }, 10000); // 10 seconds flush
        }

        if (!this.boundVisibilityHandler) {
            this.boundVisibilityHandler = () => {
                if (!document.hidden) this._syncState();
            };
            document.addEventListener('visibilitychange', this.boundVisibilityHandler);
        }

        if (!this.boundInsightToggleHandler) {
            this.boundInsightToggleHandler = this._onInsightToggleClick.bind(this);
            document.addEventListener('click', this.boundInsightToggleHandler, true);
        }
    }

    // =========================================================================
    // Core Node Loop Hook
    // =========================================================================

    applyToNodes(nodes) {
        const predictions = this.settings?.predictions || {};
        const scoringEnabled = !!predictions.enabled;
        const credibilityEnabled = !!predictions.credibilitySignalsEnabled;
        if (!scoringEnabled && !credibilityEnabled) return;

        nodes.forEach(node => {
            const candidates = this._collectPostCandidatesFromNode(node);
            candidates.forEach((candidateNode) => this._processSingleNode(candidateNode));
        });
    }

    sweepDocument(forceRescore = true) {
        const predictions = this.settings?.predictions || {};
        const scoringEnabled = !!predictions.enabled;
        const credibilityEnabled = !!predictions.credibilitySignalsEnabled;
        if (!scoringEnabled && !credibilityEnabled) return;
        const debugPreview = !!predictions.showCredibilityDebugPreview;

        const root = document.body || document.documentElement;
        if (!root || !root.querySelectorAll) return;

        const feedRoot = document.querySelector(PF_SELECTOR_MAP.mainFeedRegion) || root;

        // Performance: only run full leaked chip cleanup if the document seems busy or specifically on forceRescore
        if (forceRescore || (Math.random() > 0.82)) {
            this._cleanupLeakedDebugChips();
        }

        const rawPosts = [
            ...Array.from(feedRoot.querySelectorAll(PF_SELECTOR_MAP.postContainer)),
            ...Array.from(feedRoot.querySelectorAll('[role="article"]')),
            ...Array.from(document.querySelectorAll('[role="dialog"]'))
        ];
        const posts = this._dedupeNestedPosts(rawPosts.filter((postNode) => this._isLikelyFeedPost(postNode)));

        if (forceRescore) {
            this._cleanupLeakedDebugChips(posts);
        }
        const visibleCount = posts.filter((postNode) => this._isElementVisible(postNode)).length;

        if (!posts.length) {
            if (debugPreview && forceRescore && window.PF_Helpers && typeof window.PF_Helpers.showToast === 'function') {
                window.PF_Helpers.showToast('Credibility scan found 0 feed posts in main feed region.', 'warn', 2800);
            }
            return;
        }

        if (forceRescore) {
            posts.forEach((postNode) => {
                this._clearPredictionDecorations(postNode);
                delete postNode.dataset.pfPredictProcessed;
                delete postNode.dataset.pfScored;
                delete postNode.dataset.pfInsightChipInjected;
                delete postNode.dataset.pfInsightExpanded;
                delete postNode.dataset.pfCredBadgeInjected;
                delete postNode.dataset.pfCredDebugInjected;
                delete postNode.dataset.pfContentType;
                delete postNode.dataset.pfContentTone;
                delete postNode.dataset.pfContentConfidence;
                delete postNode.dataset.pfBlocked;
                delete postNode.dataset.pfAllowlisted;
            });
        }

        this.applyToNodes(posts);

        // Debounced friend-activity badge pass after main sweep
        if (this.settings?.predictions?.showFriendActivity) {
            clearTimeout(this._friendBadgeDebounce);
            this._friendBadgeDebounce = setTimeout(() => this._applyFriendActivityBadges(), 800);
        }

        if (debugPreview && forceRescore && window.PF_Helpers && typeof window.PF_Helpers.showToast === 'function') {
            const sampleAuthors = posts
                .slice(0, 3)
                .map((postNode) => this._extractAuthor(postNode))
                .map((name) => String(name || '').trim())
                .filter((name) => name && name !== 'Unknown')
                .join(', ');

            const suffix = sampleAuthors ? ` Sample: ${sampleAuthors}` : '';
            window.PF_Helpers.showToast(
                `Credibility scan active: ${posts.length} feed posts (${visibleCount} visible).${suffix}`,
                'info',
                3600
            );
        }
    }

    _dedupeNestedPosts(posts) {
        if (!Array.isArray(posts) || posts.length <= 1) return Array.isArray(posts) ? posts : [];

        return posts.filter((candidate) => {
            return !posts.some((other) => other !== candidate && candidate.contains && candidate.contains(other));
        });
    }

    _isLikelyFeedPost(postNode) {
        if (!postNode || !postNode.matches) return false;

        const pagelet = String(postNode.getAttribute('data-pagelet') || '');
        if (pagelet.startsWith('FeedUnit_') || pagelet.startsWith('AdUnit_')) return true;

        if (postNode.matches('[role="dialog"]')) {
            return this._isLikelyPostDialog(postNode);
        }

        const role = String(postNode.getAttribute('role') || '').toLowerCase();
        if (role === 'article') {
            const insideFeed = !!postNode.closest(PF_SELECTOR_MAP.mainFeedRegion);
            const insideDialog = !!postNode.closest('[role="dialog"]');
            const hasPostText = !!postNode.querySelector(PF_SELECTOR_MAP.postTextBody);
            const hasHeader = !!postNode.querySelector('h3, h4');
            const hasMedia = !!postNode.querySelector('img, video');
            return (insideFeed || insideDialog) && (hasPostText || (hasHeader && hasMedia));
        }

        return !!postNode.querySelector(PF_SELECTOR_MAP.postTextBody);
    }

    _isLikelyPostDialog(dialogNode) {
        if (!dialogNode || !dialogNode.querySelector) return false;

        const hasPostText = !!dialogNode.querySelector(PF_SELECTOR_MAP.postTextBody);
        if (hasPostText) return true;

        const hasCommentComposer = !!dialogNode.querySelector('div[role="textbox"][contenteditable="true"]');
        const commentArticleCount = dialogNode.querySelectorAll('[role="article"]').length;
        const hasCommentRows = commentArticleCount >= 2;

        const headingText = String(dialogNode.querySelector('h2, h3')?.textContent || '').toLowerCase();
        const hasPostHeading = headingText.includes('post') || headingText.includes('publicacion') || headingText.includes('publicación');

        return (hasCommentComposer && hasCommentRows) || (hasPostHeading && hasCommentRows);
    }

    _collectPostCandidatesFromNode(node) {
        if (!node) return [];

        const candidates = [];
        const seen = new Set();
        const addCandidate = (candidate) => {
            if (!candidate || seen.has(candidate)) return;
            if (!this._isLikelyFeedPost(candidate)) return;
            seen.add(candidate);
            candidates.push(candidate);
        };

        if (node.matches && node.matches(PF_SELECTOR_MAP.postContainer)) {
            addCandidate(node);
        }

        if (node.matches && node.matches('[role="article"]')) {
            addCandidate(node);
        }

        const closestCandidate = this._findClosestPostCandidate(node);
        if (closestCandidate) {
            addCandidate(closestCandidate);
        }

        if (node.querySelectorAll) {
            node.querySelectorAll(PF_SELECTOR_MAP.postContainer).forEach((candidate) => addCandidate(candidate));
            node.querySelectorAll('[role="article"]').forEach((candidate) => addCandidate(candidate));
        }

        return this._dedupeNestedPosts(candidates);
    }

    _findClosestPostCandidate(node) {
        const element = (node && node.nodeType === Node.ELEMENT_NODE)
            ? node
            : (node?.parentElement || null);
        if (!element || !element.closest) return null;

        return element.closest('[data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"], [role="article"], [role="dialog"]');
    }

    _cleanupLeakedDebugChips(activePosts = []) {
        const activeSet = new Set(Array.isArray(activePosts) ? activePosts : []);
        const leaked = Array.from(document.querySelectorAll('.pf-cred-debug-chip, .pf-cred-block, .pf-insight-chip'));
        leaked.forEach((chip) => {
            const host = chip.closest('[data-pagelet], [role="article"], [role="dialog"]');
            const relatedToActive = activeSet.size === 0
                || activeSet.has(host)
                || Array.from(activeSet).some((activeNode) => {
                    if (!activeNode) return false;
                    return (host.contains && host.contains(activeNode)) || (activeNode.contains && activeNode.contains(host));
                });

            if (!host || !this._isLikelyFeedPost(host) || !relatedToActive) {
                chip.remove();
            }
        });
    }

    _isElementVisible(element) {
        if (!element || !element.getBoundingClientRect) return false;

        const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
            return false;
        }

        const rect = element.getBoundingClientRect();
        const hasSize = rect.width > 40 && rect.height > 40;
        if (!hasSize) return false;

        return rect.bottom > 0 && rect.top < (window.innerHeight || document.documentElement.clientHeight || 0);
    }

    _processSingleNode(node) {
        const predictVersion = 'v13-allowlist';

        if (node.dataset.pfPredictProcessed === predictVersion) {
            const lastRefresh = Number(node.dataset.pfLastInsightRefresh || 0);
            const now = Date.now();
            if (now - lastRefresh < 2000) return; // Throttle: only refresh once every 2 seconds per node

            this._refreshPredictionDecorations(node);
            node.dataset.pfLastInsightRefresh = String(now);
            return;
        }

        // Persistent blocklist check — skip all expensive processing for blocked authors
        if (this.blocklist.size > 0) {
            const author = this._extractAuthor(node);
            if (author && author !== 'Unknown' && this.blocklist.has(author)) {
                node.dataset.pfPredictProcessed = predictVersion;
                node.dataset.pfBlocked = 'true';
                node.dataset.pfLastInsightRefresh = String(Date.now());
                node.style.setProperty('display', 'none', 'important');
                return;
            }
        }

        node.dataset.pfPredictProcessed = predictVersion;

        // Track author for Friend Activity Feed Insight
        if (this.settings?.predictions?.showFriendActivity) {
            const seenAuthor = this._extractAuthor(node);
            if (seenAuthor && seenAuthor !== 'Unknown') {
                this._sessionFeedAuthors.add(seenAuthor.trim().toLowerCase());
            }
        }

        // 1. Analyze text for trend mapping
        if (this.settings?.predictions?.enabled) {
            this._analyzeForTrends(node);
        }

        // 2. Score the post based on history
        const scoreDetails = this._scorePost(node);
        const score = scoreDetails.score;
        node.dataset.pfScored = String(score);

        if (this.settings?.predictions?.enabled) {
            this._applyScoreEffects(node, score, scoreDetails);
        }

        // 3. Apply Visual Badges and True-Affinity Flexbox Sorting
        this._injectUnifiedInsightChip(node, scoreDetails);

        if (this.settings?.predictions?.enabled && this.settings.predictions.trueAffinitySort) {
            this._applyNativeAffinitySort(node, score);
        }

        // 4. Attach Engagement Listeners (so we can learn)
        this._bindInteractionListeners(node);

        // 5. Session content-type filter (set by "Hide similar posts" action)
        // Allowlisted sources are always exempt from session filters.
        if (this.sessionContentFilters.size > 0 && !this._isAllowlisted(node)) {
            const ct = String(node.dataset.pfContentType || '').trim();
            if (ct && this.sessionContentFilters.has(ct)) {
                node.style.setProperty('display', 'none', 'important');
                node.dataset.pfSessionFiltered = 'true';
            }
        }

        node.dataset.pfLastInsightRefresh = String(Date.now());
    }

    _refreshPredictionDecorations(postNode) {
        // Re-apply persistent blocklist on already-processed nodes
        if (this.blocklist.size > 0) {
            const author = this._extractAuthor(postNode);
            if (author && author !== 'Unknown' && this.blocklist.has(author)) {
                postNode.style.setProperty('display', 'none', 'important');
                postNode.dataset.pfBlocked = 'true';
                return;
            }
        }

        // Re-apply session content-type filter on already-processed nodes
        // Allowlisted sources are always exempt.
        if (this.sessionContentFilters.size > 0 && !this._isAllowlisted(postNode)) {
            const ct = String(postNode.dataset.pfContentType || '').trim();
            if (ct && this.sessionContentFilters.has(ct)) {
                postNode.style.setProperty('display', 'none', 'important');
                postNode.dataset.pfSessionFiltered = 'true';
                return;
            }
        }

        const predictions = this.settings?.predictions || {};
        const score = Number(postNode?.dataset?.pfScored || 0);
        const scoreDetails = {
            score: Number.isFinite(score) ? score : 0
        };

        const shouldShowScore = !!predictions.enabled && predictions.showBadge !== false;
        const shouldShowCred = !!predictions.credibilitySignalsEnabled
            && (predictions.showCredibilityBadge !== false || !!predictions.showCredibilityDebugPreview);

        if (!shouldShowScore && !shouldShowCred) {
            postNode.querySelectorAll('.pf-insight-chip').forEach((node) => node.remove());
            delete postNode.dataset.pfInsightChipInjected;
            delete postNode.dataset.pfInsightExpanded;
            return;
        }

        if (this._hasInsightElement(postNode)) {
            postNode.dataset.pfInsightChipInjected = 'true';
            return;
        }

        delete postNode.dataset.pfInsightChipInjected;

        this._injectUnifiedInsightChip(postNode, scoreDetails);
    }

    _hasInsightElement(postNode) {
        if (!postNode) return false;

        const dialogHost = this._getDialogHost(postNode);
        if (dialogHost && dialogHost.querySelector) {
            return !!dialogHost.querySelector('.pf-insight-chip');
        }

        return !!(postNode.querySelector && postNode.querySelector('.pf-insight-chip'));
    }

    _clearPredictionDecorations(postNode) {
        if (!postNode || !postNode.querySelectorAll) return;

        postNode.querySelectorAll('.pf-score-badge, .pf-cred-block, .pf-cred-debug-chip, .pf-insight-chip, .pf-cred-inline-anchor, .pf-cred-dialog-anchor').forEach((node) => {
            if (node && node.remove) node.remove();
        });

        const dialogHost = this._getDialogHost(postNode);
        if (dialogHost && dialogHost.querySelectorAll) {
            dialogHost.querySelectorAll('.pf-cred-dialog-anchor').forEach((node) => {
                if (node && node.remove) node.remove();
            });
        }

        if (postNode.dataset.pfCollapsedLowScore) {
            postNode.style.removeProperty('display');
            delete postNode.dataset.pfCollapsedLowScore;
            delete postNode.dataset.pfCollapsedReason;
        }

        // Temporarily restore session-filtered posts so _scorePost can re-classify and re-hide them
        if (postNode.dataset.pfSessionFiltered) {
            postNode.style.removeProperty('display');
            delete postNode.dataset.pfSessionFiltered;
        }

        // Temporarily restore blocked posts — blocklist check in _processSingleNode will re-hide them
        if (postNode.dataset.pfBlocked) {
            postNode.style.removeProperty('display');
            delete postNode.dataset.pfBlocked;
        }

        delete postNode.dataset.pfCollapseGuardBypass;
        delete postNode.dataset.pfCollapseGuardFloor;

        const prev = postNode.previousElementSibling;
        if (prev && prev.classList && prev.classList.contains('pf-predict-chip') && prev.remove) {
            prev.remove();
        }

        delete postNode.dataset.pfInsightChipInjected;
        delete postNode.dataset.pfInsightExpanded;
        delete postNode.dataset.pfContentType;
        delete postNode.dataset.pfContentTone;
        delete postNode.dataset.pfContentConfidence;
    }

    _applyNativeAffinitySort(postNode, score) {
        // If sorting is enabled, we utilize CSS Flexbox order to visually rearrange the feed on the fly
        // WITHOUT destroying Facebook's React Virtual DOM hooks.
        const feedWrapper = PF_Helpers.getClosest(postNode, '[role="feed"]');
        if (feedWrapper && !feedWrapper.dataset.pfFlexReady) {
            feedWrapper.dataset.pfFlexReady = 'true';
            feedWrapper.style.display = 'flex';
            feedWrapper.style.flexDirection = 'column';
        }

        // CSS flex order: lower numbers appear first.
        // We want score 100 at the top (order=0), score 0 at the bottom (order=100)
        postNode.style.order = 100 - score;
    }

    // =========================================================================
    // 1. Interaction Tracking (The Learning phase)
    // =========================================================================

    _bindInteractionListeners(postNode) {
        if (!postNode || postNode.dataset.pfPredictBound === 'true') return;
        postNode.dataset.pfPredictBound = 'true';

        // Find reaction buttons (Like, Love, Haha, etc.) and Comment boxes
        // Facebook's interaction DOM is incredibly nested. We attach a bubbled listener to the post wrapper.

        postNode.addEventListener('click', (e) => {
            // Determine if the click target or its parent was a "Like" button or a "Comment" submit

            let actionType = null;
            const ariaLabel = e.target.getAttribute('aria-label') || (e.target.parentElement ? e.target.parentElement.getAttribute('aria-label') : '');

            if (ariaLabel && (ariaLabel.includes('Like') || ariaLabel.includes('React'))) {
                actionType = 'reaction';
            } else if (e.target.matches('div[role="textbox"]')) {
                // Clicking into a comment box indicates high interest
                actionType = 'comment_focus';
            } else if (e.target.tagName === 'A' && e.target.href && !e.target.href.includes('#')) {
                actionType = 'link_click';
            }

            if (actionType) {
                this._recordEngagement(postNode, actionType);
            }
        });
    }

    _recordEngagement(postNode, type) {
        // Extract meta-data about the post
        const authorInfo = this._extractAuthor(postNode);
        if (!authorInfo) return;

        // Build/Update Profile
        if (!this.engagementProfiles[authorInfo]) {
            this.engagementProfiles[authorInfo] = { reactions: 0, clicks: 0, comments: 0 };
        }

        const profile = this.engagementProfiles[authorInfo];
        if (type === 'reaction') profile.reactions++;
        if (type === 'link_click') profile.clicks++;
        if (type === 'comment_focus') profile.comments++;

        profile.lastEngaged = Date.now();
        this._stateDirty = true;

        PF_Logger.info(`PF_Predictor: Learned engagement action [${type}] for author [${authorInfo}]`);
    }

    // =========================================================================
    // 2. Feed Scoring (The Prediction phase)
    // =========================================================================

    _scorePost(postNode) {
        let score = 50; // Base neutral score
        const reasonSignals = [
            { short: 'base', detail: 'Base score: 50' }
        ];

        const authorInfo = this._extractAuthor(postNode);
        const textContent = this._extractText(postNode);

        // --- Model A: Author Affinity ---
        if (authorInfo && this.engagementProfiles[authorInfo]) {
            const p = this.engagementProfiles[authorInfo];
            const authorBonus = (p.reactions * 2) + (p.comments * 5) + (p.clicks * 1);
            // Simple weighted linear addition
            score += authorBonus;

            if (authorBonus !== 0) {
                reasonSignals.push({
                    short: `+${Math.round(authorBonus)} author`,
                    detail: `+${Math.round(authorBonus)} from author affinity (${p.reactions} reactions, ${p.comments} comments, ${p.clicks} clicks)`
                });
            }
        }

        // --- Model B: Keyword Sentiment/Match ---
        // Basic tf-idf / bag of words check against our tracked keyword frequency
        if (textContent) {
            const words = textContent.toLowerCase().split(/\W+/);
            let keywordBonus = 0;
            words.forEach(w => {
                if (w.length > 4 && this.keywordFrequency[w]) {
                    // Cap extreme outliers
                    keywordBonus += Math.min(this.keywordFrequency[w] * 0.1, 2);
                }
            });
            score += Math.min(keywordBonus, 15); // max 15 points from keyword affinity

            const roundedKeywordBonus = Math.round(Math.min(keywordBonus, 15));
            if (roundedKeywordBonus > 0) {
                reasonSignals.push({
                    short: `+${roundedKeywordBonus} keywords`,
                    detail: `+${roundedKeywordBonus} from keyword affinity trends`
                });
            }
        }

        // --- Model C: Length/Effort multiplier ---
        if (textContent.length > 500) {
            score += 5; // Long form text
            reasonSignals.push({ short: '+5 long-form', detail: '+5 for long-form post length' });
        }
        else if (textContent.length < 20) {
            score -= 5; // Low effort text
            reasonSignals.push({ short: '-5 short text', detail: '-5 for very short post text' });
        }

        // --- Model D: Rage-Bait Detection (Phase 10) ---
        if (this.settings.wellbeing && this.settings.wellbeing.ragebaitDetector) {
            const rageWords = [
                'outrage', 'disgusting', 'furious', 'ban', 'cancel', 'boycott', 'destroy', 'stupid', 'idiot', 'libs', 'maga', 'woke', 'fake', 'hypocrite', 'exposed', 'aggress',
                'honteux', 'scandaleux', 'pauvre', 'effrayant', // FR
                'schande', 'widerlich', 'skandal', 'unfassbar', // DE
                'vergogna', 'vergognoso', 'schifo', 'disgustoso', // IT
                'vergonha', 'absurdo', 'escandalo', 'ridiculo'  // PT
            ];
            let rageHits = 0;
            const tLower = textContent.toLowerCase();

            for (const word of rageWords) {
                if (tLower.includes(word)) rageHits++;
            }

            if (rageHits >= 2) {
                // High outrage vocabulary found directly in the text!
                // Severely penalize it to break engagement farming.
                score -= 40;
                postNode.dataset.pfRagebait = 'true';
                reasonSignals.push({ short: '-40 ragebait', detail: `-40 ragebait signal (${rageHits} trigger terms)` });
            }

            // --- Engagement Bait Detection (Prompt patterns) ---
            const engagementBaitPatterns = [
                /\b(tag a friend|comment your favorite|like if you|share if you agree|swipe to see|what's your birth month|only 1% can|bet you can't|amen if you agree)\b/i,
                /\b(identifie un ami|commente ton|aime si tu|partage si tu es d'accord)\b/i, // FR
                /\b(markiere einen freund|kommentiere dein|liken wenn du|teilen wenn du zustimmst)\b/i, // DE
                /\b(tagga un amico|commenta il tuo|metti mi piace se|condividi se sei d'accordo)\b/i, // IT
                /\b(marque um amigo|comente seu|curta se voce|compartilhe se concordar)\b/i // PT
            ];

            let baitHits = 0;
            for (const pattern of engagementBaitPatterns) {
                if (pattern.test(textContent)) baitHits++;
            }

            if (baitHits > 0) {
                score -= 30;
                postNode.dataset.pfEngagementBait = 'true';
                reasonSignals.push({ short: '-30 engagement-bait', detail: `-30 engagement manipulation pattern detected (${baitHits} matches)` });
            }
        }

        // --- Model E: Suspicious Claim / Credibility Signals (Local Heuristics) ---
        const credibility = this._analyzeCredibilitySignals(textContent, postNode);
        postNode.dataset.pfCredibilityPoints = String(Math.max(0, Number(credibility.points || 0)));
        postNode.dataset.pfCredibilitySourceHint = credibility.sourceHint || '';
        postNode.dataset.pfCredibilitySourceTier = credibility.sourceTier || 'none';

        if (credibility && credibility.penalty > 0) {
            score -= credibility.penalty;
            postNode.dataset.pfCredibilityLevel = credibility.level;
            postNode.dataset.pfCredibilitySummary = credibility.summary;
            postNode.dataset.pfCredibilityReasons = (credibility.reasons || []).join('||');
            postNode.dataset.pfCredibilityClaimSeed = credibility.claimSeed || '';

            reasonSignals.push({
                short: `-${credibility.penalty} verify`,
                detail: `-${credibility.penalty} suspicious-claim penalty (${credibility.summary})`
            });
        } else {
            delete postNode.dataset.pfCredibilityLevel;
            delete postNode.dataset.pfCredibilitySummary;
            delete postNode.dataset.pfCredibilityReasons;
            delete postNode.dataset.pfCredibilityClaimSeed;
        }

        // --- Model F: Content Type + Tone Classifier ---
        const contentClassification = this._classifyContentType(textContent);
        postNode.dataset.pfContentType = contentClassification.contentType;
        postNode.dataset.pfContentTone = contentClassification.tone;
        postNode.dataset.pfContentConfidence = contentClassification.confidence;
        // Model F is purely classificatory — no numeric score adjustment.

        // Clamp 0 to 100
        const rawRounded = Math.round(score);
        const finalScore = Math.max(0, Math.min(100, rawRounded));
        if (finalScore !== rawRounded) {
            reasonSignals.push({ short: 'clamped', detail: `Score clamped into range: ${finalScore}` });
        }

        return {
            score: finalScore,
            reasonSummary: this._summarizeReasonSignals(reasonSignals),
            reasonDetails: reasonSignals.map((signal) => signal.detail),
            credibility
        };
    }

    _classifyContentType(text) {
        if (!text || text.length < 10) {
            return { contentType: 'Personal', tone: 'Neutral', confidence: 'Low' };
        }

        const t = text.toLowerCase();

        // Political framing tokens (EN + major EU languages)
        // Note: 'bill' and 'cabinet' removed — too ambiguous (restaurant bill, kitchen cabinet).
        const politicalTokens = [
            'president', 'congress', 'senate', 'democrat', 'republican', 'gop', 'liberal', 'conservative',
            'election', 'vote', 'voter', 'ballot', 'government', 'policy', 'legislation',
            'politician', 'political', 'white house', 'governor', 'mayor', 'parliament',
            'prime minister', 'administration', 'federal', 'supreme court', 'constitution',
            'immigration', 'border wall', 'tax cut', 'welfare', 'social security', 'medicare',
            'military funding', 'pentagon', 'second amendment', 'department of defense',
            // DE
            'bundestag', 'kanzler', 'regierung', 'bundesregierung', 'wahl', 'wahlkampf',
            // FR
            'gouvernement', 'parlement', 'premier ministre', 'parti politique', 'ministre',
            // ES
            'gobierno', 'parlamento', 'elecciones', 'partido', 'ministro', 'presidente'
        ];

        // News framing tokens
        // Note: 'exclusive' removed — too easily confused with commercial promotional language.
        const newsTokens = [
            'breaking', 'breaking news', 'report', 'reported', 'according to', 'sources say',
            'officials say', 'study shows', 'research shows', 'published', 'investigation',
            'latest update', 'developing', 'survey', 'poll shows',
            'data shows', 'statistics show', 'per cent', 'officials confirm', 'journalists'
        ];

        // Opinion / editorial framing tokens
        const opinionTokens = [
            'i think', 'i believe', 'in my opinion', 'i feel', 'i argue',
            'it seems to me', 'my view is', 'unpopular opinion', 'hot take',
            'change my mind', 'fight me on this', 'prove me wrong', 'just saying',
            'let that sink in', 'think about it', 'wake up people', 'open your eyes',
            'nobody talks about', 'truth is', 'the real truth',
            // FR
            'je pense', 'a mon avis', 'je crois',
            // DE
            'ich denke', 'meiner meinung nach', 'ich glaube',
            // ES
            'yo creo', 'en mi opinion', 'pienso que'
        ];

        // Commercial / promotional framing tokens
        const commercialTokens = [
            'buy now', 'shop now', 'order now', 'limited time offer', 'discount', 'promo code', 'coupon',
            'free shipping', 'flash sale', 'link in bio', 'dm for info',
            'check out my', 'use code', 'affiliate', 'click the link', 'swipe up'
        ];

        // Emotional framing tokens (beyond ragebait)
        const emotionalTokens = [
            'so proud', 'so excited', 'crying right now', 'tears of joy', 'heartbroken',
            'devastated', 'blessed', 'grateful', 'rest in peace', 'thoughts and prayers',
            'broke my heart', 'can\'t believe this', 'speechless', 'sending prayers',
            'life changing', 'never forget', 'emotional', 'brought me to tears'
        ];

        let politicalScore = 0, newsScore = 0, opinionScore = 0, commercialScore = 0, emotionalScore = 0;

        for (const token of politicalTokens)  if (this._tokenMatch(t, token)) politicalScore++;
        for (const token of newsTokens)        if (this._tokenMatch(t, token)) newsScore++;
        for (const token of opinionTokens)     if (this._tokenMatch(t, token)) opinionScore++;
        for (const token of commercialTokens)  if (this._tokenMatch(t, token)) commercialScore++;
        for (const token of emotionalTokens)   if (this._tokenMatch(t, token)) emotionalScore++;

        const topDomainScore = Math.max(politicalScore, newsScore, opinionScore, commercialScore);

        // Determine content type (political > opinion > news > commercial > personal)
        let contentType = 'Personal';
        if (topDomainScore > 0) {
            if (politicalScore >= topDomainScore) {
                contentType = (opinionScore >= 2) ? 'Political Opinion' : 'Political / News';
            } else if (opinionScore >= topDomainScore) {
                contentType = 'Opinion';
            } else if (newsScore >= topDomainScore) {
                contentType = 'News / Report';
            } else if (commercialScore >= topDomainScore) {
                contentType = 'Commercial';
            }
        }

        // Determine tone
        let tone = 'Neutral';
        if (opinionScore >= 2 || (opinionScore >= 1 && politicalScore >= 2)) {
            tone = 'Opinionated';
        } else if (emotionalScore >= 2) {
            tone = 'Emotional';
        } else if (newsScore >= 2) {
            tone = 'Informational';
        } else if (politicalScore >= 2) {
            tone = 'Political framing';
        } else if (commercialScore >= 1) {
            tone = 'Promotional';
        }

        // Confidence: based on total evidence count
        const totalSignals = politicalScore + newsScore + opinionScore + commercialScore + emotionalScore;
        let confidence = 'Low';
        if (totalSignals >= 5) confidence = 'High';
        else if (totalSignals >= 2) confidence = 'Medium';

        return { contentType, tone, confidence };
    }

    _applyScoreEffects(postNode, score, scoreDetails) {
        const predictions = this.settings?.predictions || {};

        if (postNode.dataset.pfRagebait === 'true') {
            PF_Helpers.dimElement(postNode);
            postNode.style.filter = 'blur(4px)';
            postNode.addEventListener('mouseenter', () => {
                postNode.style.filter = 'none';
            }, { once: true });
            return;
        }

        if (score >= Number(predictions.highThreshold || 80)) {
            if (predictions.highlightHighInterest) {
                postNode.style.borderLeft = '4px solid #00D4FF';
            }
            return;
        }

        if (score <= Number(predictions.lowThreshold || 20)) {
            if (predictions.collapseLowInterest) {
                const collapsed = this._collapseLowScorePost(postNode, score, scoreDetails);
                if (collapsed) return;
            }

            if (predictions.dimLowInterest) {
                PF_Helpers.dimElement(postNode);
            }
        }
    }

    _collapseLowScorePost(postNode, score, scoreDetails) {
        if (!postNode || postNode.dataset.pfCollapsedLowScore === 'true') return false;

        const guard = this._getNeverEmptyGuardConfig();
        if (guard.enabled) {
            const visibleCount = this._countRenderableFeedPosts(postNode);
            if (visibleCount <= guard.minVisiblePosts) {
                postNode.dataset.pfCollapseGuardBypass = 'true';
                postNode.dataset.pfCollapseGuardFloor = String(guard.minVisiblePosts);
                return false;
            }
        }

        delete postNode.dataset.pfCollapseGuardBypass;
        delete postNode.dataset.pfCollapseGuardFloor;

        const summary = this._escapeHtml(scoreDetails?.reasonSummary || 'low interest');
        const chip = document.createElement('div');
        chip.className = 'pf-predict-chip';
        chip.innerHTML = `
            <span>Hidden low-score post (<strong>${score}</strong>)${summary ? ` - ${summary}` : ''}</span>
            <button type="button">Show post</button>
        `;

        const revealBtn = chip.querySelector('button');
        if (revealBtn) {
            revealBtn.addEventListener('click', () => {
                this._restoreCollapsedLowScorePost(postNode, chip);
            });
        }

        postNode.style.setProperty('display', 'none', 'important');
        postNode.dataset.pfCollapsedLowScore = 'true';
        postNode.dataset.pfCollapsedReason = summary || 'low interest score';

        postNode.parentElement?.insertBefore(chip, postNode);
        this._emitPredictorHiddenEvent('Low Interest Score Collapse');
        return true;
    }

    _restoreCollapsedLowScorePost(postNode, chip) {
        if (!postNode) return;

        postNode.style.removeProperty('display');
        postNode.dataset.pfCollapsedLowScore = 'revealed';
        if (chip && chip.remove) chip.remove();
    }

    _getNeverEmptyGuardConfig() {
        const predictions = this.settings?.predictions || {};
        const enabled = predictions.neverEmptyFeedGuard !== false;
        const rawMin = Number(predictions.neverEmptyFeedMinVisiblePosts);
        const minVisiblePosts = Math.max(1, Math.min(25, Number.isFinite(rawMin) ? Math.round(rawMin) : 3));

        return { enabled, minVisiblePosts };
    }

    _countRenderableFeedPosts(sampleNode) {
        const scopeRoot = (sampleNode && sampleNode.closest && sampleNode.closest(PF_SELECTOR_MAP.mainFeedRegion))
            || document.querySelector(PF_SELECTOR_MAP.mainFeedRegion)
            || document.body
            || document.documentElement;

        if (!scopeRoot || !scopeRoot.querySelectorAll) return 0;

        const raw = [
            ...Array.from(scopeRoot.querySelectorAll(PF_SELECTOR_MAP.postContainer)),
            ...Array.from(scopeRoot.querySelectorAll('[role="article"]'))
        ];

        const candidates = this._dedupeNestedPosts(raw.filter((node) => this._isLikelyFeedPost(node)));

        return candidates.reduce((count, node) => {
            if (!node || node.dataset?.pfHidden === 'true') return count;
            if (node.dataset?.pfCollapsedLowScore === 'true') return count;

            const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
            if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
                return count;
            }

            const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
            if (rect && (rect.width < 24 || rect.height < 24)) return count;

            return count + 1;
        }, 0);
    }

    _emitPredictorHiddenEvent(reason) {
        try {
            window.dispatchEvent(new CustomEvent('pf:element_hidden', {
                detail: {
                    reason: String(reason || 'Predictor Hidden'),
                    tag: 'ARTICLE',
                    role: 'feed-item',
                    pagelet: 'predictor'
                }
            }));
        } catch (err) {
            // no-op diagnostics event fallback
        }
    }

    _summarizeReasonSignals(signals) {
        if (!Array.isArray(signals) || signals.length === 0) return '';

        const compact = signals
            .map((signal) => String(signal?.short || '').trim())
            .filter((text) => text && text !== 'base' && text !== 'clamped')
            .slice(0, 2);

        if (compact.length === 0) return 'neutral';
        return compact.join(', ');
    }

    _escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    _analyzeForTrends(postNode) {
        if (!this.settings.predictions.showTrending) return;

        const textContent = this._extractText(postNode);
        if (!textContent) return;

        const words = textContent.toLowerCase().split(/\W+/).filter(w => w.length > 4); // Basic stop-word length filter

        const stopWords = ['these', 'those', 'their', 'there', 'where', 'about', 'would', 'could', 'should', 'which', 'facebook', 'https'];

        words.forEach(w => {
            if (!stopWords.includes(w)) {
                this.keywordFrequency[w] = (this.keywordFrequency[w] || 0) + 1;
                this._stateDirty = true;
            }
        });
    }

    // =========================================================================
    // Utilities
    // =========================================================================

    _extractAuthor(postNode) {
        // Find standard Facebook author link. Usually a prominent h3/h4 or specific arial-label link.
        // We look for the main bold text in the header of the post container.
        const authorHeaders = postNode.querySelectorAll('h3, h4, strong');
        if (authorHeaders && authorHeaders.length > 0) {
            // Usually the first strong or h3 is the author
            return authorHeaders[0].textContent.trim();
        }
        return 'Unknown';
    }

    _extractText(postNode) {
        const messageContainer = postNode.querySelector(PF_SELECTOR_MAP.postTextBody);
        return messageContainer ? messageContainer.textContent : '';
    }

    /**
     * Word-boundary-aware token match.
     * Multi-word tokens (containing a space) are matched with a plain substring check.
     * Single-word tokens verify that the match is not surrounded by [a-z0-9] characters,
     * eliminating false positives like 'bill' inside 'billboard' or 'ability'.
     */
    _tokenMatch(text, token) {
        if (token.includes(' ')) return text.includes(token);
        let idx = text.indexOf(token);
        while (idx !== -1) {
            const before = idx > 0 ? text[idx - 1] : ' ';
            const after  = idx + token.length < text.length ? text[idx + token.length] : ' ';
            if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
            idx = text.indexOf(token, idx + 1);
        }
        return false;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    destroy() {
        // Stop periodic state sync
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
            this.syncIntervalId = null;
        }
        // Remove event listeners
        if (this.boundVisibilityHandler) {
            document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
            this.boundVisibilityHandler = null;
        }
        if (this.boundInsightToggleHandler) {
            document.removeEventListener('click', this.boundInsightToggleHandler, true);
            this.boundInsightToggleHandler = null;
        }
        // Cancel pending friend badge pass
        if (this._friendBadgeDebounce) {
            clearTimeout(this._friendBadgeDebounce);
            this._friendBadgeDebounce = null;
        }
        // Remove any injected friend-unseen badges from the DOM
        document.querySelectorAll('.pf-friend-unseen').forEach((el) => el.remove());
        // Remove injected predictor styles
        const styleEl = document.getElementById('pf-predictor-styles');
        if (styleEl) styleEl.remove();
        this._stylesInjected = false;
    }

    _syncState() {
        if (!this._stateDirty) return;

        // Trim keyword frequency map so it doesn't grow infinitely
        // We only keep the top 1000 words.
        const sortedMap = Object.entries(this.keywordFrequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 1000);

        this.keywordFrequency = Object.fromEntries(sortedMap);

        // Calculate Echo Chamber Metric (if top 2 authors represent > 80% of all interactions)
        let totalInteractions = 0;
        const topCounts = [];
        for (const [, data] of Object.entries(this.engagementProfiles)) {
            const interactions = data.reactions + data.comments + data.clicks;
            totalInteractions += interactions;
            topCounts.push(interactions);
        }

        let isEchoChamber = false;
        if (totalInteractions > 20) {
            topCounts.sort((a,b) => b - a);
            const topTwo = (topCounts[0] || 0) + (topCounts[1] || 0);
            if (topTwo / totalInteractions > 0.8) {
                isEchoChamber = true;
                PF_Logger.warn('PF_Predictor: ⚠️ Local Echo Chamber Detected.');
            }
        }

        PF_Storage.setLocalData('pf_prediction_history', {
            profiles: this.engagementProfiles,
            freq: this.keywordFrequency,
            echoChamberActive: isEchoChamber,
            lastSaved: Date.now()
        });

        this._stateDirty = false;
    }
}

window.PF_Predictor = PF_Predictor;
