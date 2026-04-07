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
        setInterval(() => this._syncState(), 10000); // 10 seconds flush
    }

    // =========================================================================
    // Core Node Loop Hook
    // =========================================================================

    applyToNodes(nodes) {
        if (!this.settings.predictions.enabled) return;

        nodes.forEach(node => {
            // 1. Analyze text for trend mapping
            this._analyzeForTrends(node);

            // 2. Score the post based on history
            const score = this._scorePost(node);

            // 3. Apply Visual Badges 
            this._injectBadge(node, score);

            // 4. Attach Engagement Listeners (so we can learn)
            this._bindInteractionListeners(node);
        });
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

        const authorInfo = this._extractAuthor(postNode);
        const textContent = this._extractText(postNode);

        // --- Model A: Author Affinity ---
        if (authorInfo && this.engagementProfiles[authorInfo]) {
            const p = this.engagementProfiles[authorInfo];
            // Simple weighted linear addition
            score += (p.reactions * 2);
            score += (p.comments * 5);
            score += (p.clicks * 1);
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
        }

        // --- Model C: Length/Effort multiplier ---
        if (textContent.length > 500) score += 5; // Long form text
        else if (textContent.length < 20) score -= 5; // Low effort text

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
            }
        }

        // Clamp 0 to 100
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    _injectBadge(postNode, score) {
        if (!this.settings.predictions.showBadge) return;
        if (postNode.dataset.pfScored) return; // already injected

        let scoreColor = '#aaaaaa';
        let flair = '';

        if (postNode.dataset.pfRagebait === "true") {
            scoreColor = '#ff4444'; 
            flair = '⚠️ Rage-Bait Predicted';
            PF_Helpers.dimElement(postNode);
            // Deeply blur rage bait
            postNode.style.filter = 'blur(4px)';
            postNode.addEventListener('mouseenter', () => postNode.style.filter = 'none', { once: true });
        } else if (score >= this.settings.predictions.highThreshold) {
            scoreColor = '#00D4FF'; // Cyan
            flair = '🔥 ';
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
        badge.style.cssText = `
            display: inline-block; vertical-align: middle; margin-left: 8px;
            background: var(--surface-background, #fff); border: 1px solid ${scoreColor};
            border-radius: 12px; padding: 2px 8px; font-size: 11px; font-weight: bold;
            color: ${scoreColor}; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;
        badge.innerHTML = `PF <span style="margin-left:4px; font-family: monospace;">${score}</span>${flair}`;
        
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

        PF_Storage.setLocalData('pf_prediction_history', {
            profiles: this.engagementProfiles,
            freq: this.keywordFrequency,
            lastSaved: Date.now()
        });

        this._stateDirty = false;
    }
}

window.PF_Predictor = PF_Predictor;
