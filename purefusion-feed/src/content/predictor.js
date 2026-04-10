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
    }

    // =========================================================================
    // Core Node Loop Hook
    // =========================================================================

    applyToNodes(nodes) {
        if (!this.settings.predictions.enabled) return;

        nodes.forEach(node => {
            // Ensure we ONLY process actual posts, or search inside injected wrappers
            if (!node.matches || !node.matches(PF_SELECTOR_MAP.postContainer)) {
                if (node.querySelectorAll) {
                    const innerPosts = node.querySelectorAll(PF_SELECTOR_MAP.postContainer);
                    innerPosts.forEach(innerNode => this._processSingleNode(innerNode));
                }
                return;
            }
            this._processSingleNode(node);
        });
    }

    _processSingleNode(node) {
        if (node.dataset.pfPredictProcessed) return;
        node.dataset.pfPredictProcessed = "true";

        // 1. Analyze text for trend mapping
        this._analyzeForTrends(node);

        // 2. Score the post based on history
        const scoreDetails = this._scorePost(node);
        const score = scoreDetails.score;

        // 3. Apply Visual Badges and True-Affinity Flexbox Sorting
        this._injectBadge(node, score, scoreDetails);

        if (this.settings.predictions.trueAffinitySort) {
            this._applyNativeAffinitySort(node, score);
        }

        // 4. Attach Engagement Listeners (so we can learn)
        this._bindInteractionListeners(node);
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
            const rageWords = ['outrage', 'disgusting', 'furious', 'ban', 'cancel', 'boycott', 'destroy', 'stupid', 'idiot', 'libs', 'maga', 'woke', 'fake', 'hypocrite', 'exposed', 'aggress'];
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
        }

        // Clamp 0 to 100
        const rawRounded = Math.round(score);
        const finalScore = Math.max(0, Math.min(100, rawRounded));
        if (finalScore !== rawRounded) {
            reasonSignals.push({ short: 'clamped', detail: `Score clamped into range: ${finalScore}` });
        }

        return {
            score: finalScore,
            reasonSummary: this._summarizeReasonSignals(reasonSignals),
            reasonDetails: reasonSignals.map((signal) => signal.detail)
        };
    }

    _injectBadge(postNode, score, scoreDetails = null) {
        if (!this.settings.predictions.showBadge) return;
        if (postNode.dataset.pfScored) return; // already injected

        let scoreColor = '#aaaaaa';
        let flair = '';

        if (postNode.dataset.pfRagebait === "true") {
            scoreColor = '#ff4444'; 
            flair = ' ⚠️ Rage-Bait';
            PF_Helpers.dimElement(postNode);
            // Deeply blur rage bait
            postNode.style.filter = 'blur(4px)';
            postNode.addEventListener('mouseenter', () => postNode.style.filter = 'none', { once: true });
        } else if (score >= this.settings.predictions.highThreshold) {
            scoreColor = '#00D4FF'; // Cyan
            flair = ' 🔥';
            if (this.settings.predictions.highlightHighInterest) {
                postNode.style.borderLeft = `4px solid ${scoreColor}`;
            }
        } else if (score <= this.settings.predictions.lowThreshold) {
            scoreColor = '#ff4444'; // Red
            if (this.settings.predictions.dimLowInterest) {
                PF_Helpers.dimElement(postNode);
            }
        } else {
            scoreColor = '#6C3FC5'; // Neutral Purple
        }

        const badge = document.createElement('div');
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
