/**
 * PureFusion Feed - Local AI Prediction Engine
 * 
 * A privacy-first, in-browser intelligence engine.
 * Observes user interactions (likes, clicks) to score future feed items locally.
 * Includes Trend Detection across text corpuses.
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
            });
        }

        this.applyToNodes(posts);

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
        const predictVersion = 'v11-unified-insight-chip';

        if (node.dataset.pfPredictProcessed === predictVersion) {
            const lastRefresh = Number(node.dataset.pfLastInsightRefresh || 0);
            const now = Date.now();
            if (now - lastRefresh < 2000) return; // Throttle: only refresh once every 2 seconds per node
            
            this._refreshPredictionDecorations(node);
            node.dataset.pfLastInsightRefresh = String(now);
            return;
        }

        node.dataset.pfPredictProcessed = predictVersion;

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
        node.dataset.pfLastInsightRefresh = String(Date.now());
    }

    _refreshPredictionDecorations(postNode) {
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
            feedWrapper.dataset.pfFlexReady = "true";
            feedWrapper.style.display = "flex";
            feedWrapper.style.flexDirection = "column"; 
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
            
            for (let word of rageWords) {
                if (tLower.includes(word)) rageHits++;
            }

            if (rageHits >= 2) {
                // High outrage vocabulary found directly in the text! 
                // Severely penalize it to break engagement farming.
                score -= 40; 
                postNode.dataset.pfRagebait = "true";
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
                postNode.dataset.pfEngagementBait = "true";
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
        const politicalTokens = [
            'president', 'congress', 'senate', 'democrat', 'republican', 'gop', 'liberal', 'conservative',
            'election', 'vote', 'voter', 'ballot', 'government', 'policy', 'legislation', 'bill',
            'politician', 'political', 'white house', 'governor', 'mayor', 'parliament',
            'prime minister', 'cabinet', 'administration', 'federal', 'supreme court', 'constitution',
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
        const newsTokens = [
            'breaking', 'breaking news', 'report', 'reported', 'according to', 'sources say',
            'officials say', 'study shows', 'research shows', 'published', 'investigation',
            'latest update', 'developing', 'exclusive', 'survey', 'poll shows',
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

        for (const token of politicalTokens) if (t.includes(token)) politicalScore++;
        for (const token of newsTokens)     if (t.includes(token)) newsScore++;
        for (const token of opinionTokens)  if (t.includes(token)) opinionScore++;
        for (const token of commercialTokens) if (t.includes(token)) commercialScore++;
        for (const token of emotionalTokens)  if (t.includes(token)) emotionalScore++;

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

    _injectBadge(postNode, score, scoreDetails = null) {
        if (!this.settings.predictions.showBadge) return;
        if (postNode.dataset.pfScored) return; // already injected

        let scoreColor = '#aaaaaa';
        let flair = '';

        if (postNode.dataset.pfRagebait === "true") {
            scoreColor = '#ff4444'; 
            flair = ' ⚠️ Rage-Bait';
        } else if (score >= this.settings.predictions.highThreshold) {
            scoreColor = '#00D4FF'; // Cyan
            flair = ' 🔥';
        } else if (score <= this.settings.predictions.lowThreshold) {
            scoreColor = '#ff4444'; // Red
        } else {
            scoreColor = '#6C3FC5'; // Neutral Purple
        }

        const badge = document.createElement('div');
        badge.className = 'pf-score-badge';
        const showReasons = this.settings?.predictions?.showScoreReasons !== false;
        const reasonSummary = showReasons ? String(scoreDetails?.reasonSummary || '') : '';
        const reasonDetails = Array.isArray(scoreDetails?.reasonDetails) ? scoreDetails.reasonDetails : [];

        badge.style.cssText = `
            display: inline-block; vertical-align: middle; margin-left: 8px;
            background: var(--surface-background, #fff); border: 1px solid ${scoreColor};
            border-radius: 12px; padding: 2px 8px; font-size: 11px; font-weight: bold;
            color: ${scoreColor}; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;
        const safeReasonSummary = this._escapeHtml(reasonSummary);
        const reasonSnippet = showReasons && safeReasonSummary
            ? `<span style="margin-left:6px; font-size:10px; font-weight:600; opacity:0.86;">${safeReasonSummary}</span>`
            : '';
        badge.innerHTML = `PF <span style="margin-left:4px; font-family: monospace;">${score}</span>${flair}${reasonSnippet}`;

        if (showReasons && reasonDetails.length) {
            badge.title = reasonDetails.join(' | ');
            badge.setAttribute('aria-label', `PF score ${score}. ${reasonDetails.join('. ')}`);
        }
        
        // Find a safe place to inject inline (Header area near Author)
        const authorNodes = postNode.querySelectorAll('h3, h4, strong');
        if (authorNodes && authorNodes.length > 0) {
            let container = authorNodes[0];
            // Walk up safely if needed, or simply append after the strong tag
            container.parentElement.appendChild(badge);
        } else {
            // Fallback prepend to top of post
            postNode.prepend(badge); 
        }
        
        postNode.dataset.pfScored = score;
    }

    _injectUnifiedInsightChip(postNode, scoreDetails = null) {
        if (!postNode || postNode.dataset.pfCollapsedLowScore === 'true') return;

        const predictions = this.settings?.predictions || {};
        const shouldShowScore = !!predictions.enabled && predictions.showBadge !== false;
        const shouldShowCred = !!predictions.credibilitySignalsEnabled
            && (predictions.showCredibilityBadge !== false || !!predictions.showCredibilityDebugPreview);
        if (!shouldShowScore && !shouldShowCred) return;

        const scoreValue = Number(scoreDetails?.score);
        const score = Number.isFinite(scoreValue)
            ? scoreValue
            : Math.max(0, Number(postNode.dataset.pfScored || 0));

        const insight = this._resolveUnifiedInsightState(postNode, score);
        const reasonSummary = String(scoreDetails?.reasonSummary || '').trim();
        const reasonDetails = Array.isArray(scoreDetails?.reasonDetails) ? scoreDetails.reasonDetails : [];

        const credibilitySummary = String(postNode.dataset.pfCredibilitySummary || '').trim();
        const reasons = String(postNode.dataset.pfCredibilityReasons || '')
            .split('||')
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 4);
        const claimSeed = String(postNode.dataset.pfCredibilityClaimSeed || '').trim();
        const sourceHint = String(postNode.dataset.pfCredibilitySourceHint || '').trim();
        const verificationUrl = this._buildVerificationSearchUrl(claimSeed || credibilitySummary);

        const chip = document.createElement('div');
        chip.className = `pf-insight-chip pf-insight-${insight.severity}`;

        const showReasons = predictions.showScoreReasons !== false;
        const summaryBits = [];

        if (shouldShowScore) {
            summaryBits.push(`PF ${score}`);
        }

        if (showReasons && reasonSummary) {
            summaryBits.push(reasonSummary);
        }

        if (credibilitySummary) {
            summaryBits.push(credibilitySummary);
        }

        const summaryText = summaryBits.join(' | ') || insight.label;
        const safeSummaryText = this._escapeHtml(summaryText);
        const safeStatusText = this._escapeHtml(insight.label);
        const toneText = this._escapeHtml(insight.tone);
        const detailHtml = this._buildUnifiedInsightDetailsHtml({
            score,
            shouldShowScore,
            reasonDetails,
            showReasons,
            credibilitySummary,
            credibilityReasons: reasons,
            sourceHint,
            verificationUrl,
            debugEnabled: !!predictions.showCredibilityDebugPreview,
            points: Math.max(0, Number(postNode.dataset.pfCredibilityPoints || 0)),
            sourceTier: String(postNode.dataset.pfCredibilitySourceTier || 'none'),
            collapseGuardBypass: postNode.dataset.pfCollapseGuardBypass === 'true',
            collapseGuardFloor: Number(postNode.dataset.pfCollapseGuardFloor || 0)
        });
        const isExpanded = postNode.dataset.pfInsightExpanded === 'true' || this._hasExpandedInsightInHost(postNode);
        const toggleLabel = isExpanded ? 'Hide' : 'Details';
        const detailsHiddenAttr = isExpanded ? '' : ' hidden';

        // Classification row (Model F)
        const chipContentType = String(postNode.dataset.pfContentType || '').trim();
        const chipContentTone = String(postNode.dataset.pfContentTone || '').trim();
        const chipContentConf = String(postNode.dataset.pfContentConfidence || '').trim();
        const showClassification = chipContentType && chipContentType !== 'Personal' && chipContentConf !== 'Low';
        const classificationHtml = showClassification
            ? `<div class="pf-insight-classification">` +
              `<span class="pf-insight-type-badge">${this._escapeHtml(chipContentType)}</span>` +
              `<span class="pf-insight-tone-badge">${this._escapeHtml(chipContentTone)}</span>` +
              `<span class="pf-insight-conf-label">Confidence: ${this._escapeHtml(chipContentConf)}</span>` +
              `</div>`
            : '';

        chip.innerHTML = `
            <div class="pf-insight-row">
                <span class="pf-insight-status">${safeStatusText}</span>
                <span class="pf-insight-summary" title="${safeSummaryText}">${safeSummaryText}</span>
                <button type="button" class="pf-insight-toggle">${toggleLabel}</button>
            </div>
            <div class="pf-insight-meta">Signal: ${toneText}</div>
            ${classificationHtml}
            <div class="pf-insight-details"${detailsHiddenAttr}>${detailHtml}</div>
        `;

        this._insertCredibilityElement(postNode, chip);
        postNode.dataset.pfInsightChipInjected = 'true';
        postNode.dataset.pfInsightExpanded = isExpanded ? 'true' : 'false';
    }

    _hasExpandedInsightInHost(postNode) {
        if (!postNode) return false;

        const dialogHost = this._getDialogHost(postNode);
        const host = dialogHost || this._resolvePostVisualHost(postNode) || postNode;
        if (!host || !host.querySelector) return false;

        return !!host.querySelector('.pf-insight-chip .pf-insight-details:not([hidden])');
    }

    _onInsightToggleClick(event) {
        const target = event?.target;
        if (!target || !target.closest) return;

        // Handle quick action buttons
        const actionBtn = target.closest('.pf-insight-action-btn');
        if (actionBtn) {
            if (event.preventDefault) event.preventDefault();
            if (event.stopPropagation) event.stopPropagation();
            if (event.stopImmediatePropagation) event.stopImmediatePropagation();
            this._handleInsightAction(actionBtn);
            return;
        }

        const toggle = target.closest('.pf-insight-toggle');
        if (!toggle) return;

        if (event.preventDefault) event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();

        const chip = toggle.closest('.pf-insight-chip');
        if (!chip) return;

        const details = chip.querySelector('.pf-insight-details');
        if (!details) return;

        const willOpen = !!details.hidden;
        details.hidden = !willOpen;
        toggle.textContent = willOpen ? 'Hide' : 'Details';

        const targets = [
            chip.closest('[data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"]'),
            chip.closest('[role="article"]'),
            chip.closest('[role="dialog"]')
        ].filter(Boolean);

        targets.forEach((node) => {
            if (!node || !node.dataset) return;
            node.dataset.pfInsightExpanded = willOpen ? 'true' : 'false';
        });
    }

    _handleInsightAction(btn) {
        const action = String(btn.dataset.pfAction || '');
        const chip = btn.closest('.pf-insight-chip');
        const postNode = chip
            ? (chip.closest('[data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"]') || chip.closest('[role="article"]'))
            : null;

        const toast = (msg, type, dur) => {
            if (window.PF_Helpers && typeof window.PF_Helpers.showToast === 'function') {
                window.PF_Helpers.showToast(msg, type || 'info', dur || 3000);
            }
        };

        if (action === 'hide-similar') {
            const contentType = String(postNode?.dataset?.pfContentType || '').trim();
            const label = contentType && contentType !== 'Personal' ? contentType : 'this content type';
            toast(`"Hide similar" noted for: ${label}. This preference will guide future scoring.`, 'info', 3500);
            btn.textContent = 'Noted';
            btn.disabled = true;
        }

        if (action === 'always-show') {
            const author = postNode ? this._extractAuthor(postNode) : null;
            if (author && author !== 'Unknown') {
                if (!this.engagementProfiles[author]) {
                    this.engagementProfiles[author] = { reactions: 0, clicks: 0, comments: 0 };
                }
                // Boost affinity for this author — equivalent to ~5 reaction events
                this.engagementProfiles[author].reactions = (this.engagementProfiles[author].reactions || 0) + 10;
                this._stateDirty = true;
                toast(`Affinity boosted for: ${author}`, 'success', 2800);
            } else {
                toast('Could not identify a source for this post.', 'warn', 2500);
            }
            btn.textContent = 'Boosted';
            btn.disabled = true;
        }

        if (action === 'block-source') {
            const author = postNode ? this._extractAuthor(postNode) : null;
            if (author && author !== 'Unknown') {
                if (!this.engagementProfiles[author]) {
                    this.engagementProfiles[author] = { reactions: 0, clicks: 0, comments: 0 };
                }
                // Severe affinity penalty — posts from this source will score much lower
                this.engagementProfiles[author].reactions = -20;
                this.engagementProfiles[author].clicks    = -20;
                this.engagementProfiles[author].comments  = -20;
                this._stateDirty = true;
                toast(`Source penalized: ${author}. Future posts will score lower.`, 'warn', 3500);
            } else {
                toast('Could not identify a source for this post.', 'warn', 2500);
            }
            btn.textContent = 'Penalized';
            btn.disabled = true;
        }
    }

    _resolveUnifiedInsightState(postNode, score) {
        const predictions = this.settings?.predictions || {};
        const lowThreshold = Number(predictions.lowThreshold || 20);
        const highThreshold = Number(predictions.highThreshold || 80);
        const credibilityLevel = String(postNode?.dataset?.pfCredibilityLevel || '').toLowerCase();

        if (String(postNode?.dataset?.pfRagebait || '') === 'true') {
            return {
                severity: 'high',
                label: 'Pattern: High Rage-Bait risk',
                tone: 'high emotional manipulation pattern'
            };
        }

        if (String(postNode?.dataset?.pfEngagementBait || '') === 'true') {
            return {
                severity: 'warn',
                label: 'Pattern: Engagement Bait detected',
                tone: 'viral loop manipulation prompt'
            };
        }

        if (credibilityLevel === 'high') {
            return {
                severity: 'high',
                label: 'Possible misleading claim',
                tone: 'multiple credibility risk signals'
            };
        }

        if (credibilityLevel === 'warn') {
            return {
                severity: 'warn',
                label: 'Source needs verification',
                tone: 'credibility caution detected'
            };
        }

        // --- Content classification (Model F) ---
        const contentType = String(postNode?.dataset?.pfContentType || '').trim();
        const contentTone = String(postNode?.dataset?.pfContentTone || '').trim();
        const contentConf  = String(postNode?.dataset?.pfContentConfidence || 'Low').trim();
        const hasClassification = contentType && contentType !== 'Personal';

        if (predictions.enabled && score <= lowThreshold) {
            return {
                severity: 'warn',
                label: 'Likely low-value content',
                tone: hasClassification
                    ? `${contentTone} signals · low relevance for your profile`
                    : 'low relevance for your profile'
            };
        }

        if (predictions.enabled && score >= highThreshold) {
            return {
                severity: 'ok',
                label: hasClassification ? `High Relevance · ${contentType}` : 'High Relevance',
                tone: hasClassification
                    ? `${contentTone} · strong match for your interests`
                    : 'strong match for your interests'
            };
        }

        // Classification-aware labels for mid-range scores
        if (contentType === 'Political Opinion') {
            return {
                severity: 'info',
                label: 'Opinionated Political Content',
                tone: `${contentTone} framing detected · ${contentConf} confidence`
            };
        }
        if (contentType === 'Political / News') {
            return {
                severity: 'ok',
                label: 'Political / News Content',
                tone: `${contentTone} framing · ${contentConf} confidence`
            };
        }
        if (contentType === 'Opinion') {
            return {
                severity: 'info',
                label: 'Opinion / Editorial',
                tone: `${contentTone} signals · ${contentConf} confidence`
            };
        }
        if (contentType === 'News / Report') {
            return {
                severity: 'ok',
                label: 'News / Report',
                tone: `${contentTone} signals · ${contentConf} confidence`
            };
        }
        if (contentType === 'Commercial') {
            return {
                severity: 'warn',
                label: 'Possible Promotional Content',
                tone: `commercial patterns detected · ${contentConf} confidence`
            };
        }

        // Final fallback
        return {
            severity: 'ok',
            label: contentTone && contentTone !== 'Neutral' ? `${contentTone} Content` : 'Mixed Signals',
            tone: contentTone && contentTone !== 'Neutral'
                ? `${contentTone} signals present · low classification confidence`
                : 'insufficient signals to classify content type'
        };
    }

    _buildUnifiedInsightDetailsHtml(data) {
        const items = [];

        if (data.shouldShowScore) {
            items.push(`<p><strong>PF Score:</strong> ${Number(data.score || 0)}</p>`);
        }

        if (data.showReasons && Array.isArray(data.reasonDetails) && data.reasonDetails.length) {
            const scoreItems = data.reasonDetails
                .slice(0, 4)
                .map((reason) => `<li>${this._escapeHtml(reason)}</li>`)
                .join('');
            items.push(`<div class="pf-insight-section"><div class="pf-insight-section-title">Score signals</div><ul>${scoreItems}</ul></div>`);
        }

        if (data.credibilitySummary) {
            items.push(`<p><strong>Credibility:</strong> ${this._escapeHtml(data.credibilitySummary)}</p>`);
        }

        if (Array.isArray(data.credibilityReasons) && data.credibilityReasons.length) {
            const credItems = data.credibilityReasons
                .map((reason) => `<li>${this._escapeHtml(reason)}</li>`)
                .join('');
            items.push(`<div class="pf-insight-section"><div class="pf-insight-section-title">Why flagged</div><ul>${credItems}</ul></div>`);
        }

        if (data.sourceHint) {
            items.push(`<p class="pf-insight-source"><strong>Source hint:</strong> ${this._escapeHtml(data.sourceHint)}</p>`);
        }

        if (data.verificationUrl) {
            const safeUrl = this._escapeHtml(data.verificationUrl);
            items.push(`<div class="pf-insight-actions"><a class="pf-insight-action-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer">Verify this claim</a></div>`);
        }

        if (data.debugEnabled) {
            const tier = this._escapeHtml(String(data.sourceTier || 'none'));
            const points = Math.max(0, Number(data.points || 0));
            items.push(`<p class="pf-insight-debug"><strong>Debug:</strong> points ${points}, source tier ${tier}</p>`);
        }

        if (data.collapseGuardBypass) {
            const floor = Math.max(1, Number(data.collapseGuardFloor || 0) || 1);
            items.push(`<p class="pf-insight-debug"><strong>Guard:</strong> kept visible to maintain at least ${floor} posts on screen.</p>`);
        }

        // --- Quick Action hooks ---
        items.push(`
            <div class="pf-insight-section pf-insight-actions-section">
                <div class="pf-insight-section-title">Quick Actions</div>
                <div class="pf-insight-action-row">
                    <button type="button" class="pf-insight-action-btn" data-pf-action="hide-similar">Hide similar posts</button>
                    <button type="button" class="pf-insight-action-btn" data-pf-action="always-show">Always show source</button>
                    <button type="button" class="pf-insight-action-btn pf-insight-action-btn-danger" data-pf-action="block-source">Block source</button>
                </div>
            </div>
        `);

        if (!items.length) {
            return '<p>No additional details yet.</p>';
        }

        return items.join('');
    }

    _injectCredibilityBadge(postNode, scoreDetails = null) {
        const predictions = this.settings?.predictions || {};
        if (!predictions.credibilitySignalsEnabled) return;
        if (predictions.showCredibilityBadge === false) return;
        if (!postNode || postNode.dataset.pfCredBadgeInjected === 'true') return;

        const level = String(postNode.dataset.pfCredibilityLevel || '');
        if (!level) return;

        const summary = String(postNode.dataset.pfCredibilitySummary || 'suspicious claim pattern');
        const reasonsRaw = String(postNode.dataset.pfCredibilityReasons || '');
        const reasons = reasonsRaw
            .split('||')
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 4);
        const claimSeed = String(postNode.dataset.pfCredibilityClaimSeed || '').trim();
        const sourceHint = String(postNode.dataset.pfCredibilitySourceHint || '').trim();
        const verificationUrl = this._buildVerificationSearchUrl(claimSeed || summary);

        const wrapper = document.createElement('div');
        wrapper.className = `pf-cred-block ${level === 'high' ? 'pf-cred-high' : 'pf-cred-warn'}`;

        const label = document.createElement('span');
        label.className = 'pf-cred-chip';
        label.textContent = level === 'high' ? 'VERIFY SOURCE (high risk)' : 'VERIFY SOURCE';
        label.title = `PureFusion credibility signal: ${summary}`;

        const whyBtn = document.createElement('button');
        whyBtn.type = 'button';
        whyBtn.className = 'pf-cred-why-btn';
        whyBtn.textContent = 'Why?';

        const details = document.createElement('div');
        details.className = 'pf-cred-details';
        details.hidden = true;
        details.innerHTML = this._buildCredibilityDetailsHtml(summary, reasons, verificationUrl, sourceHint);

        whyBtn.addEventListener('click', () => {
            const isHidden = details.hidden;
            details.hidden = !isHidden;
            whyBtn.textContent = isHidden ? 'Hide' : 'Why?';
        });

        wrapper.appendChild(label);
        wrapper.appendChild(whyBtn);
        wrapper.appendChild(details);

        const score = Number(scoreDetails?.score);
        if (Number.isFinite(score)) {
            wrapper.setAttribute('aria-label', `Verify source warning. PF score ${score}. ${summary}`);
        }

        this._insertCredibilityElement(postNode, wrapper);

        postNode.dataset.pfCredBadgeInjected = 'true';
    }

    _injectCredibilityDebugBadge(postNode, scoreDetails = null) {
        const predictions = this.settings?.predictions || {};
        if (!predictions.credibilitySignalsEnabled) return;
        if (!predictions.showCredibilityDebugPreview) return;
        if (!postNode || postNode.dataset.pfCredDebugInjected === 'true') return;

        const points = Math.max(0, Number(postNode.dataset.pfCredibilityPoints || 0));
        const sourceTier = String(postNode.dataset.pfCredibilitySourceTier || 'none');
        const sourceHint = String(postNode.dataset.pfCredibilitySourceHint || 'No source hint');
        const level = String(postNode.dataset.pfCredibilityLevel || 'none');

        const badge = document.createElement('div');
        const status = level === 'high' ? 'HIGH' : level === 'warn' ? 'WARN' : 'OK';
        const sourceShort = sourceTier === 'high-trust'
            ? 'trusted-source'
            : sourceTier === 'shortener'
                ? 'short-link'
                : sourceTier === 'unknown'
                    ? 'unknown-source'
                    : 'no-source';

        badge.className = `pf-cred-debug-chip pf-cred-debug-${status.toLowerCase()}`;
        badge.textContent = `Cred ${status} | pts ${points} | ${sourceShort}`;
        badge.title = `Credibility debug: ${sourceHint}`;

        const score = Number(scoreDetails?.score);
        if (Number.isFinite(score)) {
            badge.setAttribute('aria-label', `Credibility debug ${status}. Points ${points}. PF score ${score}. ${sourceHint}`);
        }

        this._insertCredibilityElement(postNode, badge);

        postNode.dataset.pfCredDebugInjected = 'true';
    }

    _insertCredibilityElement(postNode, element) {
        if (!postNode || !element) return;

        const dialogHost = this._getDialogHost(postNode);

        if (dialogHost) {
            this._insertIntoDialogAnchor(dialogHost, element);
            return;
        }

        const visualHost = this._resolvePostVisualHost(postNode);
        if (!visualHost) {
            postNode.prepend(element);
            return;
        }

        const inlineAnchor = this._ensureInlineCredAnchor(visualHost);
        this._upsertCredElement(inlineAnchor, element);
    }

    _ensureInlineCredAnchor(visualHost) {
        if (!visualHost) return null;

        const existing = Array.from(visualHost.children || []).find((child) => child.classList && child.classList.contains('pf-cred-inline-anchor'));
        if (existing) return existing;

        const anchor = document.createElement('div');
        anchor.className = 'pf-cred-inline-anchor';

        const headline = visualHost.querySelector('h3, h4');
        if (headline && headline.parentElement) {
            headline.parentElement.appendChild(anchor);
            return anchor;
        }

        const textBody = visualHost.querySelector(PF_SELECTOR_MAP.postTextBody);
        if (textBody && textBody.parentElement) {
            textBody.parentElement.insertBefore(anchor, textBody);
            return anchor;
        }

        visualHost.prepend(anchor);
        return anchor;
    }

    _insertIntoDialogAnchor(dialogHost, element) {
        if (!dialogHost || !element) return;

        const anchors = Array.from(dialogHost.querySelectorAll('.pf-cred-dialog-anchor'));
        let anchor = anchors[0] || null;

        if (anchors.length > 1) {
            anchors.slice(1).forEach((extra) => {
                if (extra && extra.remove) extra.remove();
            });
        }

        if (!anchor) {
            anchor = document.createElement('div');
            anchor.className = 'pf-cred-dialog-anchor';

            const titleNode = dialogHost.querySelector('h2, h3');
            if (titleNode && titleNode.parentElement && titleNode.parentElement.parentElement) {
                const titleRow = titleNode.parentElement;
                titleRow.parentElement.insertBefore(anchor, titleRow.nextSibling);
            } else {
                dialogHost.prepend(anchor);
            }
        }

        this._upsertCredElement(anchor, element);
    }

    _getDialogHost(postNode) {
        if (!postNode) return null;

        if (postNode.matches && postNode.matches('[role="dialog"]')) {
            return postNode;
        }

        if (postNode.closest) {
            return postNode.closest('[role="dialog"]');
        }

        return null;
    }

    _hasCredDebugElement(postNode) {
        if (!postNode) return false;

        const dialogHost = this._getDialogHost(postNode);
        if (dialogHost) {
            return !!dialogHost.querySelector('.pf-cred-debug-chip');
        }

        return !!postNode.querySelector('.pf-cred-debug-chip');
    }

    _hasCredBlockElement(postNode) {
        if (!postNode) return false;

        const dialogHost = this._getDialogHost(postNode);
        if (dialogHost) {
            return !!dialogHost.querySelector('.pf-cred-block');
        }

        return !!postNode.querySelector('.pf-cred-block');
    }

    _upsertCredElement(anchor, element) {
        if (!anchor || !element || !element.classList) return;

        if (element.classList.contains('pf-insight-chip')) {
            anchor.querySelectorAll('.pf-insight-chip, .pf-cred-debug-chip, .pf-cred-block, .pf-score-badge').forEach((existing) => {
                if (existing && existing.remove) existing.remove();
            });
        }

        if (element.classList.contains('pf-cred-debug-chip')) {
            anchor.querySelectorAll('.pf-cred-debug-chip').forEach((existing) => {
                if (existing && existing.remove) existing.remove();
            });
        }

        if (element.classList.contains('pf-cred-block')) {
            anchor.querySelectorAll('.pf-cred-block').forEach((existing) => {
                if (existing && existing.remove) existing.remove();
            });
        }

        anchor.appendChild(element);
    }

    _resolvePostVisualHost(postNode) {
        if (!postNode) return null;

        if (!postNode.matches || !postNode.matches('[role="dialog"]')) {
            return postNode;
        }

        const dialogCandidates = Array.from(postNode.querySelectorAll('[role="article"], [data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"]'));
        for (const candidate of dialogCandidates) {
            if (!candidate || !candidate.querySelector) continue;
            const hasText = !!candidate.querySelector(PF_SELECTOR_MAP.postTextBody);
            const hasMedia = !!candidate.querySelector('img, video');
            const hasHeader = !!candidate.querySelector('h3, h4');
            if ((hasText || hasMedia) && hasHeader) {
                return candidate;
            }
        }

        return postNode;
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

    _analyzeCredibilitySignals(textContent, postNode) {
        const predictions = this.settings?.predictions || {};
        if (!predictions.credibilitySignalsEnabled) {
            return {
                penalty: 0,
                level: '',
                summary: '',
                reasons: [],
                claimSeed: '',
                points: 0,
                sourceHint: '',
                sourceTier: 'none'
            };
        }

        const text = String(textContent || '').trim();
        if (!text) {
            return {
                penalty: 0,
                level: '',
                summary: '',
                reasons: [],
                claimSeed: '',
                points: 0,
                sourceHint: '',
                sourceTier: 'none'
            };
        }

        const lower = text.toLowerCase();
        let points = 0;
        const triggers = [];

        const phraseSignals = [
            { phrase: 'they do not want you to know', points: 3, label: 'conspiracy framing' },
            { phrase: "they don't want you to know", points: 3, label: 'conspiracy framing' },
            { phrase: 'share before it is deleted', points: 3, label: 'share-before-delete prompt' },
            { phrase: 'share before deleted', points: 3, label: 'share-before-delete prompt' },
            { phrase: 'mainstream media will not show this', points: 3, label: 'anti-media framing' },
            { phrase: '100% proven', points: 2, label: 'absolute certainty claim' },
            { phrase: 'secret cure', points: 2, label: 'miracle cure claim' },
            { phrase: 'miracle cure', points: 2, label: 'miracle cure claim' },
            { phrase: 'breaking', points: 1, label: 'breaking claim tone' },
            { phrase: 'wake up people', points: 2, label: 'manipulative urgency phrase' },
            { phrase: 'source: trust me bro', points: 4, label: 'explicit non-source' },
            { phrase: 'ai generated', points: 1, label: 'AI-generated disclosure' },
            { phrase: 'deepfake', points: 2, label: 'deepfake mention' }
        ];

        for (const signal of phraseSignals) {
            if (lower.includes(signal.phrase)) {
                points += signal.points;
                triggers.push(signal.label);
            }
        }

        const exclamations = (text.match(/!/g) || []).length;
        const questions = (text.match(/\?/g) || []).length;
        if (exclamations >= 6 || questions >= 6) {
            points += 1;
            triggers.push('heavy punctuation spam');
        }

        const letters = text.replace(/[^A-Za-z]/g, '');
        const upperLetters = letters.replace(/[^A-Z]/g, '');
        if (letters.length >= 80) {
            const upperRatio = upperLetters.length / letters.length;
            if (upperRatio >= 0.6) {
                points += 2;
                triggers.push('excessive all-caps pattern');
            }
        }

        const sourceInfo = this._analyzeSourceDomain(postNode);
        const hasOutboundSourceLink = !!sourceInfo.hasSource;
        const claimWords = ['proof', 'exposed', 'leak', 'revealed', 'cure', 'hoax', 'scam', 'truth'];
        const hasClaimWord = claimWords.some((word) => lower.includes(word));
        if (hasClaimWord && !hasOutboundSourceLink) {
            points += 1;
            triggers.push('strong claim without source link');
        }

        if (sourceInfo.tier === 'shortener') {
            points += 2;
            triggers.push('opaque short-link source');
        }

        if (hasClaimWord && sourceInfo.tier === 'unknown') {
            points += 1;
            triggers.push('claim tied to unverified source domain');
        }

        if (sourceInfo.tier === 'high-trust' && points > 0) {
            points = Math.max(0, points - 1);
            triggers.push('contains recognized source domain');
        }

        if (points < 3) {
            return {
                penalty: 0,
                level: '',
                summary: '',
                reasons: Array.from(new Set(triggers)),
                claimSeed: this._buildClaimSeed(text),
                points,
                sourceHint: sourceInfo.hint || '',
                sourceTier: sourceInfo.tier || 'none'
            };
        }

        const strict = !!predictions.strictCredibilityPenalty;
        const level = points >= 6 ? 'high' : 'warn';
        const basePenalty = strict ? (points * 4) : (points * 3);
        const penalty = Math.max(6, Math.min(strict ? 36 : 24, basePenalty));
        const uniqueReasons = Array.from(new Set(triggers));
        const summary = this._formatCredibilitySummary(uniqueReasons);
        const claimSeed = this._buildClaimSeed(text);
        const sourceHint = sourceInfo.hint || '';

        return {
            penalty,
            level,
            summary,
            reasons: uniqueReasons,
            claimSeed,
            points,
            sourceHint,
            sourceTier: sourceInfo.tier || 'none'
        };
    }

    _analyzeSourceDomain(postNode) {
        const result = {
            hasSource: false,
            domain: '',
            tier: 'none',
            hint: 'No outbound source domain detected.'
        };

        if (!postNode || !postNode.querySelectorAll) return result;

        const anchors = Array.from(postNode.querySelectorAll('a[href]'));
        if (!anchors.length) return result;

        const knownHighTrustDomains = [
            'apnews.com', 'reuters.com', 'bbc.com', 'bbc.co.uk', 'nytimes.com', 'npr.org',
            'who.int', 'cdc.gov', 'snopes.com', 'factcheck.org', 'politifact.com',
            'lemonde.fr', 'lefigaro.fr', 'spiegel.de', 'welt.de', 'corriere.it', 'repubblica.it', // FR, DE, IT
            'publico.pt', 'elpais.com', 'elmundo.es', // PT, ES
            'theguardian.com', 'wsj.com', 'bloomberg.com'
        ];

        const shortenerDomains = [
            'bit.ly', 'tinyurl.com', 't.co', 'ow.ly', 'rb.gy', 'is.gd', 'cutt.ly',
            'buff.ly', 'po.st', 'v.ht', 't.me', 'wa.me', 'goo.gl', 'dlvr.it'
        ];

        for (const anchor of anchors) {
            const rawHref = String(anchor.getAttribute('href') || '').trim();
            if (!rawHref) continue;

            const resolvedUrl = this._resolveOutboundUrl(rawHref);
            if (!resolvedUrl) continue;

            const domain = this._extractDomainFromUrl(resolvedUrl);
            if (!domain) continue;
            if (domain.includes('facebook.com') || domain.includes('fb.com') || domain.includes('messenger.com')) {
                continue;
            }

            result.hasSource = true;
            result.domain = domain;

            if (shortenerDomains.some((known) => domain === known || domain.endsWith(`.${known}`))) {
                result.tier = 'shortener';
                result.hint = `Source uses short-link domain: ${domain}`;
                return result;
            }

            if (knownHighTrustDomains.some((known) => domain === known || domain.endsWith(`.${known}`))) {
                result.tier = 'high-trust';
                result.hint = `Recognized source domain: ${domain}`;
                return result;
            }

            result.tier = 'unknown';
            result.hint = `Unverified source domain: ${domain}`;
            return result;
        }

        return result;
    }

    _resolveOutboundUrl(rawHref) {
        try {
            const absolute = new URL(rawHref, window.location.origin);

            if (absolute.pathname === '/l.php') {
                const encodedTarget = absolute.searchParams.get('u');
                if (encodedTarget) {
                    return decodeURIComponent(encodedTarget);
                }
            }

            return absolute.href;
        } catch (err) {
            return '';
        }
    }

    _extractDomainFromUrl(url) {
        try {
            const parsed = new URL(url);
            return String(parsed.hostname || '').toLowerCase().replace(/^www\./, '');
        } catch (err) {
            return '';
        }
    }

    _formatCredibilitySummary(triggers) {
        if (!Array.isArray(triggers) || triggers.length === 0) {
            return 'suspicious claim pattern';
        }

        const unique = Array.from(new Set(triggers));
        return unique.slice(0, 3).join(', ');
    }

    _buildCredibilityDetailsHtml(summary, reasons, verificationUrl = '', sourceHint = '') {
        const safeSummary = this._escapeHtml(summary || 'suspicious claim pattern');
        const reasonItems = Array.isArray(reasons) && reasons.length
            ? reasons.map((reason) => `<li>${this._escapeHtml(reason)}</li>`).join('')
            : '<li>Suspicious claim pattern</li>';
        const safeVerificationUrl = this._escapeHtml(verificationUrl || '');
        const safeSourceHint = this._escapeHtml(sourceHint || 'No outbound source domain detected.');
        const verificationAction = safeVerificationUrl
            ? `<div class="pf-cred-actions"><a class="pf-cred-action-link" href="${safeVerificationUrl}" target="_blank" rel="noopener noreferrer">Verify this claim</a></div>`
            : '';

        return `
            <div class="pf-cred-details-title">Why this was flagged</div>
            <p>${safeSummary}</p>
            <ul>${reasonItems}</ul>
            <p class="pf-cred-source-hint">${safeSourceHint}</p>
            ${verificationAction}
            <p class="pf-cred-details-tip">Tip: Verify with trusted outlets or official sources before resharing.</p>
        `;
    }

    _buildVerificationSearchUrl(claimSeed) {
        const seed = String(claimSeed || '').replace(/\s+/g, ' ').trim();
        if (!seed) return '';

        const shortSeed = seed.slice(0, 180);
        const query = `"${shortSeed}" fact check`;
        return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    }

    _buildClaimSeed(text) {
        const normalized = String(text || '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!normalized) return '';

        return normalized.slice(0, 220);
    }

    _injectPredictorStyles() {
        if (this._stylesInjected || document.getElementById('pf-predictor-styles')) return;

        const style = document.createElement('style');
        style.id = 'pf-predictor-styles';
        style.textContent = `
            .pf-predict-chip {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin: 8px 0;
                padding: 8px 10px;
                border-radius: 10px;
                border: 1px solid rgba(255, 90, 105, 0.45);
                background: rgba(37, 24, 29, 0.9);
                color: #ffe9ec;
                font: 700 12px/1.3 "Segoe UI Variable Text", "Segoe UI", sans-serif;
            }

            .pf-predict-chip button {
                appearance: none;
                border: 1px solid rgba(255, 132, 146, 0.65);
                background: rgba(76, 34, 42, 0.96);
                color: #ffd6dc;
                border-radius: 999px;
                padding: 4px 10px;
                cursor: pointer;
                font: 700 11px/1.2 "Segoe UI Variable Text", "Segoe UI", sans-serif;
            }

            .pf-predict-chip button:hover {
                border-color: rgba(255, 171, 180, 0.95);
                color: #ffffff;
            }

            .pf-insight-chip {
                display: block;
                width: min(480px, calc(100vw - 48px));
                margin: 6px 8px 4px;
                padding: 6px 8px;
                border-radius: 12px;
                border: 1px solid rgba(126, 151, 188, 0.5);
                background: rgba(20, 26, 38, 0.95);
                color: #d9e7fb;
                font: 700 11px/1.32 "Segoe UI Variable Text", "Segoe UI", sans-serif;
                position: relative;
                z-index: 1;
                pointer-events: auto;
            }

            .pf-insight-chip.pf-insight-ok {
                border-color: rgba(126, 226, 255, 0.56);
                background: rgba(23, 41, 56, 0.93);
            }

            .pf-insight-chip.pf-insight-warn {
                border-color: rgba(255, 209, 102, 0.62);
                background: rgba(60, 45, 22, 0.93);
            }

            .pf-insight-chip.pf-insight-high {
                border-color: rgba(255, 142, 160, 0.72);
                background: rgba(66, 26, 36, 0.94);
            }

            .pf-insight-chip.pf-insight-info {
                border-color: rgba(186, 162, 255, 0.62);
                background: rgba(40, 28, 72, 0.94);
            }

            .pf-insight-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .pf-insight-status {
                display: inline-flex;
                align-items: center;
                border-radius: 999px;
                padding: 2px 8px;
                border: 1px solid rgba(165, 190, 226, 0.62);
                background: rgba(25, 34, 52, 0.65);
                font-weight: 800;
                letter-spacing: 0.03em;
                text-transform: uppercase;
                flex-shrink: 0;
            }

            .pf-insight-summary {
                flex: 1;
                min-width: 0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                color: #deebff;
                font-weight: 700;
            }

            .pf-insight-toggle {
                appearance: none;
                border: 1px solid rgba(171, 190, 221, 0.62);
                background: rgba(24, 31, 44, 0.94);
                color: #e4eeff;
                border-radius: 999px;
                padding: 2px 9px;
                cursor: pointer;
                font: 700 10px/1.2 "Segoe UI Variable Text", "Segoe UI", sans-serif;
                flex-shrink: 0;
                pointer-events: auto;
                position: relative;
                z-index: 3;
            }

            .pf-insight-toggle:hover {
                border-color: rgba(210, 226, 255, 0.92);
                color: #ffffff;
            }

            .pf-insight-meta {
                margin-top: 3px;
                color: #bad0ef;
                font-size: 10px;
                font-weight: 700;
            }

            .pf-insight-details {
                margin-top: 6px;
                padding-top: 6px;
                border-top: 1px solid rgba(144, 166, 198, 0.28);
                color: #e8f0ff;
                font: 600 10px/1.34 "Segoe UI Variable Text", "Segoe UI", sans-serif;
            }

            .pf-insight-details[hidden] {
                display: none;
            }

            .pf-insight-details p {
                margin: 0 0 6px;
                color: #d4e3fa;
            }

            .pf-insight-section {
                margin: 0 0 6px;
            }

            .pf-insight-section-title {
                margin-bottom: 2px;
                color: #f0f6ff;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.03em;
                font-size: 10px;
            }

            .pf-insight-section ul {
                margin: 0 0 0 15px;
                padding: 0;
                display: grid;
                gap: 2px;
            }

            .pf-insight-source {
                color: #c6daf8 !important;
            }

            .pf-insight-debug {
                color: #9bcff9 !important;
                margin-bottom: 0 !important;
            }

            .pf-insight-actions {
                margin-bottom: 6px;
            }

            .pf-insight-action-link {
                display: inline-flex;
                align-items: center;
                text-decoration: none;
                border: 1px solid rgba(136, 188, 255, 0.6);
                border-radius: 999px;
                padding: 3px 10px;
                background: rgba(29, 58, 102, 0.35);
                color: #d5e8ff;
                font: 700 10px/1.2 "Segoe UI Variable Text", "Segoe UI", sans-serif;
            }

            .pf-insight-action-link:hover {
                border-color: rgba(162, 210, 255, 0.95);
                color: #ffffff;
                background: rgba(39, 77, 132, 0.52);
            }

            .pf-insight-classification {
                display: flex;
                align-items: center;
                gap: 5px;
                margin-top: 4px;
                flex-wrap: wrap;
            }

            .pf-insight-type-badge,
            .pf-insight-tone-badge {
                display: inline-flex;
                align-items: center;
                border-radius: 999px;
                padding: 1px 7px;
                font-size: 10px;
                font-weight: 700;
                border: 1px solid rgba(180, 165, 255, 0.5);
                background: rgba(80, 50, 160, 0.3);
                color: #d9cdff;
            }

            .pf-insight-conf-label {
                font-size: 10px;
                color: #9ab0cc;
                font-weight: 600;
            }

            .pf-insight-actions-section {
                margin-top: 8px;
                padding-top: 6px;
                border-top: 1px solid rgba(144, 166, 198, 0.18);
            }

            .pf-insight-action-row {
                display: flex;
                flex-wrap: wrap;
                gap: 5px;
                margin-top: 4px;
            }

            .pf-insight-action-btn {
                appearance: none;
                border: 1px solid rgba(136, 188, 255, 0.5);
                background: rgba(29, 58, 102, 0.28);
                color: #c8deff;
                border-radius: 999px;
                padding: 3px 9px;
                cursor: pointer;
                font: 700 10px/1.2 "Segoe UI Variable Text", "Segoe UI", sans-serif;
                pointer-events: auto;
                position: relative;
                z-index: 3;
                transition: background 0.15s, border-color 0.15s;
            }

            .pf-insight-action-btn:hover {
                border-color: rgba(162, 210, 255, 0.9);
                background: rgba(39, 77, 132, 0.48);
                color: #ffffff;
            }

            .pf-insight-action-btn:disabled {
                opacity: 0.55;
                cursor: default;
            }

            .pf-insight-action-btn.pf-insight-action-btn-danger {
                border-color: rgba(255, 130, 150, 0.5);
                background: rgba(100, 26, 40, 0.28);
                color: #ffb8c6;
            }

            .pf-insight-action-btn.pf-insight-action-btn-danger:hover {
                border-color: rgba(255, 160, 175, 0.9);
                background: rgba(120, 36, 52, 0.52);
                color: #ffffff;
            }

            .pf-cred-chip {
                display: inline-block;
                margin-left: 0;
                padding: 2px 8px;
                border-radius: 999px;
                font: 800 10px/1.2 "Segoe UI Variable Text", "Segoe UI", sans-serif;
                letter-spacing: 0.03em;
                text-transform: uppercase;
                border: 1px solid;
            }

            .pf-cred-debug-chip {
                display: inline-flex;
                align-items: center;
                margin: 6px 8px 4px;
                padding: 2px 8px;
                border-radius: 999px;
                font: 800 10px/1.2 "Segoe UI Variable Text", "Segoe UI", sans-serif;
                letter-spacing: 0.02em;
                text-transform: uppercase;
                border: 1px solid;
                width: fit-content;
                position: relative;
                z-index: 1;
            }

            .pf-cred-debug-chip.pf-cred-debug-ok {
                color: #87e5ff;
                background: rgba(34, 86, 108, 0.24);
                border-color: rgba(135, 229, 255, 0.62);
            }

            .pf-cred-debug-chip.pf-cred-debug-warn {
                color: #ffd166;
                background: rgba(113, 85, 23, 0.25);
                border-color: rgba(255, 209, 102, 0.72);
            }

            .pf-cred-debug-chip.pf-cred-debug-high {
                color: #ff95a6;
                background: rgba(111, 32, 47, 0.28);
                border-color: rgba(255, 149, 166, 0.78);
            }

            .pf-cred-inline-anchor {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                align-items: center;
                margin-top: 4px;
            }

            .pf-cred-dialog-anchor {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                align-items: center;
                padding: 4px 10px 6px;
                border-top: 1px solid rgba(129, 144, 168, 0.35);
                border-bottom: 1px solid rgba(129, 144, 168, 0.2);
                background: rgba(25, 30, 38, 0.66);
            }

            .pf-cred-block {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                margin-left: 8px;
                flex-wrap: wrap;
            }

            .pf-cred-why-btn {
                appearance: none;
                border: 1px solid rgba(126, 138, 160, 0.65);
                background: rgba(24, 29, 39, 0.94);
                color: #dce6fb;
                border-radius: 999px;
                padding: 2px 8px;
                cursor: pointer;
                font: 700 10px/1.2 "Segoe UI Variable Text", "Segoe UI", sans-serif;
            }

            .pf-cred-why-btn:hover {
                border-color: rgba(177, 196, 224, 0.95);
                color: #ffffff;
            }

            .pf-cred-details {
                width: min(360px, calc(100vw - 40px));
                margin-top: 4px;
                padding: 8px 10px;
                border-radius: 10px;
                border: 1px solid rgba(126, 138, 160, 0.4);
                background: rgba(22, 26, 34, 0.96);
                color: #ecf1ff;
                font: 600 11px/1.35 "Segoe UI Variable Text", "Segoe UI", sans-serif;
            }

            .pf-cred-details[hidden] {
                display: none;
            }

            .pf-cred-details-title {
                margin-bottom: 4px;
                font-weight: 800;
                color: #e8efff;
            }

            .pf-cred-details p {
                margin: 0 0 6px;
                color: #cfdaef;
            }

            .pf-cred-details ul {
                margin: 0 0 6px 16px;
                padding: 0;
                display: grid;
                gap: 2px;
            }

            .pf-cred-details-tip {
                margin-bottom: 0 !important;
                color: #b9c9e8 !important;
            }

            .pf-cred-source-hint {
                margin-bottom: 6px !important;
                color: #c2d3f0 !important;
                font-weight: 700;
            }

            .pf-cred-actions {
                margin-bottom: 6px;
            }

            .pf-cred-action-link {
                display: inline-flex;
                align-items: center;
                text-decoration: none;
                border: 1px solid rgba(136, 188, 255, 0.6);
                border-radius: 999px;
                padding: 3px 10px;
                background: rgba(29, 58, 102, 0.35);
                color: #d5e8ff;
                font: 700 11px/1.2 "Segoe UI Variable Text", "Segoe UI", sans-serif;
            }

            .pf-cred-action-link:hover {
                border-color: rgba(162, 210, 255, 0.95);
                color: #ffffff;
                background: rgba(39, 77, 132, 0.52);
            }

            .pf-cred-block.pf-cred-warn .pf-cred-chip {
                color: #ffd166;
                background: rgba(110, 82, 18, 0.22);
                border-color: rgba(255, 209, 102, 0.7);
            }

            .pf-cred-block.pf-cred-high .pf-cred-chip {
                color: #ff8fa1;
                background: rgba(94, 28, 40, 0.3);
                border-color: rgba(255, 143, 161, 0.8);
            }
        `;

        document.head.appendChild(style);
        this._stylesInjected = true;
    }

    // =========================================================================
    // 3. Trend Analyis
    // =========================================================================

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
        return "Unknown";
    }

    _extractText(postNode) {
        const messageContainer = postNode.querySelector(PF_SELECTOR_MAP.postTextBody);
        return messageContainer ? messageContainer.textContent : "";
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
        let topCounts = [];
        for (const [author, data] of Object.entries(this.engagementProfiles)) {
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
                PF_Logger.warn("PF_Predictor: ⚠️ Local Echo Chamber Detected.");
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
