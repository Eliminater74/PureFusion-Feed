/**
 * PureFusion Feed - Predictor UI
 *
 * Extends PF_Predictor (defined in predictor-engine.js) with all DOM-injection
 * and credibility-analysis methods: the unified insight chip, legacy credibility
 * badge, debug badge, DOM anchor helpers, credibility signal analysis, domain
 * resolution, friend-activity badges, and the predictor stylesheet injection.
 *
 * Must be loaded AFTER predictor-engine.js (and predictor-sources.js).
 */

// Extends PF_Predictor — defined in predictor-engine.js
Object.assign(window.PF_Predictor.prototype, {

    _injectBadge(postNode, score, scoreDetails = null) {
        if (!this.settings.predictions.showBadge) return;
        if (postNode.dataset.pfScored) return; // already injected

        let scoreColor = '#aaaaaa';
        let flair = '';

        if (postNode.dataset.pfRagebait === 'true') {
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
            const container = authorNodes[0];
            // Walk up safely if needed, or simply append after the strong tag
            container.parentElement.appendChild(badge);
        } else {
            // Fallback prepend to top of post
            postNode.prepend(badge);
        }

        postNode.dataset.pfScored = score;
    },

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
        const authorAllowlisted = this._isAllowlisted(postNode);
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
            collapseGuardFloor: Number(postNode.dataset.pfCollapseGuardFloor || 0),
            sessionFilters: Array.from(this.sessionContentFilters),
            authorBlocked: (() => {
                const a = this._extractAuthor(postNode);
                return !!(a && a !== 'Unknown' && this.blocklist.has(a));
            })(),
            blocklistSize: this.blocklist.size,
            authorAllowlisted,
            allowlistSize: this.allowlist.size
        });
        const isExpanded = postNode.dataset.pfInsightExpanded === 'true' || this._hasExpandedInsightInHost(postNode);
        const toggleLabel = isExpanded ? 'Hide' : 'Details';
        const detailsHiddenAttr = isExpanded ? '' : ' hidden';

        // Classification row (Model F) — also shows Trusted Source badge if allowlisted
        const chipContentType = String(postNode.dataset.pfContentType || '').trim();
        const chipContentTone = String(postNode.dataset.pfContentTone || '').trim();
        const chipContentConf = String(postNode.dataset.pfContentConfidence || '').trim();
        const showClassification = (chipContentType && chipContentType !== 'Personal' && chipContentConf !== 'Low') || authorAllowlisted;
        const trustedBadge = authorAllowlisted
            ? '<span class="pf-insight-trusted-badge">Trusted Source</span>'
            : '';
        const classificationHtml = showClassification
            ? '<div class="pf-insight-classification">' +
              trustedBadge +
              (chipContentType && chipContentType !== 'Personal' && chipContentConf !== 'Low'
                  ? `<span class="pf-insight-type-badge">${this._escapeHtml(chipContentType)}</span>` +
                    `<span class="pf-insight-tone-badge">${this._escapeHtml(chipContentTone)}</span>` +
                    `<span class="pf-insight-conf-label">Confidence: ${this._escapeHtml(chipContentConf)}</span>`
                  : '') +
              '</div>'
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
    },

    _hasExpandedInsightInHost(postNode) {
        if (!postNode) return false;

        const dialogHost = this._getDialogHost(postNode);
        const host = dialogHost || this._resolvePostVisualHost(postNode) || postNode;
        if (!host || !host.querySelector) return false;

        return !!host.querySelector('.pf-insight-chip .pf-insight-details:not([hidden])');
    },

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
    },

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
            if (contentType && contentType !== 'Personal') {
                this.sessionContentFilters.add(contentType);
                // Force a full re-sweep so all currently visible matching posts are hidden immediately
                this.sweepDocument(true);
                toast(`Hiding all "${contentType}" posts for this session. Reload page to reset.`, 'info', 4500);
                btn.textContent = 'Hidden';
            } else {
                toast('Could not determine a specific content type for this post.', 'warn', 2500);
                btn.textContent = 'Noted';
            }
            btn.disabled = true;
        }

        if (action === 'reset-session-filters') {
            this.sessionContentFilters.clear();
            this.sweepDocument(true);
            toast('Session filters cleared — hidden posts restored.', 'success', 3000);
        }

        if (action === 'always-show') {
            const author = postNode ? this._extractAuthor(postNode) : null;
            if (author && author !== 'Unknown') {
                // Add to persistent allowlist — exempt from session content-type filters permanently
                this.allowlist.add(author);
                this._saveAllowlist();
                // Also boost affinity so the post scores higher
                if (!this.engagementProfiles[author]) {
                    this.engagementProfiles[author] = { reactions: 0, clicks: 0, comments: 0 };
                }
                this.engagementProfiles[author].reactions = (this.engagementProfiles[author].reactions || 0) + 10;
                this._stateDirty = true;
                this.sweepDocument(true);
                toast(`"${author}" added to trusted sources — always shown, even with active session filters.`, 'success', 4000);
            } else {
                toast('Could not identify a source for this post.', 'warn', 2500);
            }
            btn.textContent = 'Trusted';
            btn.disabled = true;
        }

        if (action === 'unallow-source') {
            const author = postNode ? this._extractAuthor(postNode) : null;
            if (author && this.allowlist.has(author)) {
                this.allowlist.delete(author);
                this._saveAllowlist();
                this.sweepDocument(true);
                toast(`"${author}" removed from trusted sources.`, 'info', 3000);
            } else {
                toast('Source not found in trusted list.', 'warn', 2500);
            }
        }

        if (action === 'block-source') {
            const author = postNode ? this._extractAuthor(postNode) : null;
            if (author && author !== 'Unknown') {
                // Add to persistent blocklist
                this.blocklist.add(author);
                this._saveBlocklist();
                // Also penalize engagement profile so scores reflect the block even before next full sweep
                if (!this.engagementProfiles[author]) {
                    this.engagementProfiles[author] = { reactions: 0, clicks: 0, comments: 0 };
                }
                this.engagementProfiles[author].reactions = -20;
                this.engagementProfiles[author].clicks    = -20;
                this.engagementProfiles[author].comments  = -20;
                this._stateDirty = true;
                // Hide the current post immediately, then sweep the rest
                if (postNode) {
                    postNode.style.setProperty('display', 'none', 'important');
                    postNode.dataset.pfBlocked = 'true';
                }
                this.sweepDocument(true);
                toast(`"${author}" permanently blocked. All posts hidden — survives page reload.`, 'warn', 4500);
            } else {
                toast('Could not identify a source for this post.', 'warn', 2500);
            }
            btn.textContent = 'Blocked';
            btn.disabled = true;
        }

        if (action === 'unblock-source') {
            const author = postNode ? this._extractAuthor(postNode) : null;
            if (author && this.blocklist.has(author)) {
                this.blocklist.delete(author);
                this._saveBlocklist();
                // Reset engagement penalty
                if (this.engagementProfiles[author]) {
                    this.engagementProfiles[author].reactions = 0;
                    this.engagementProfiles[author].clicks    = 0;
                    this.engagementProfiles[author].comments  = 0;
                    this._stateDirty = true;
                }
                this.sweepDocument(true);
                toast(`"${author}" unblocked. Posts from this source will reappear.`, 'success', 3500);
            } else {
                toast('Source not found in blocklist.', 'warn', 2500);
            }
        }
    },

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
    },

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

        // --- Active session filters notice ---
        const sessionFilters = Array.isArray(data.sessionFilters) ? data.sessionFilters : [];
        if (sessionFilters.length > 0) {
            const filterList = sessionFilters.map((f) => `<em>${this._escapeHtml(f)}</em>`).join(', ');
            items.push(`
                <div class="pf-insight-section pf-insight-session-section">
                    <div class="pf-insight-section-title">Session Filters Active</div>
                    <p>Currently hiding: ${filterList}</p>
                    <button type="button" class="pf-insight-action-btn pf-insight-action-btn-reset" data-pf-action="reset-session-filters">Reset (restore hidden posts)</button>
                </div>
            `);
        }

        // --- Trusted source notice ---
        if (data.authorAllowlisted) {
            items.push(`
                <div class="pf-insight-section pf-insight-trusted-section">
                    <div class="pf-insight-section-title">Source Status</div>
                    <p>This source is <strong>trusted</strong> — exempt from session content filters.</p>
                    <button type="button" class="pf-insight-action-btn pf-insight-action-btn-reset" data-pf-action="unallow-source">Remove from trusted sources</button>
                </div>
            `);
        }

        // --- Blocked source notice ---
        if (data.authorBlocked) {
            items.push(`
                <div class="pf-insight-section pf-insight-blocked-section">
                    <div class="pf-insight-section-title">Source Status</div>
                    <p>This source is <strong>permanently blocked</strong>.</p>
                    <button type="button" class="pf-insight-action-btn pf-insight-action-btn-reset" data-pf-action="unblock-source">Unblock source</button>
                </div>
            `);
        }

        // --- Quick Action hooks ---
        const blockLabel       = data.authorBlocked    ? 'Already blocked'  : 'Block source';
        const blockDisabled    = data.authorBlocked    ? ' disabled'         : '';
        const alwaysShowLabel  = data.authorAllowlisted ? 'Already trusted'  : 'Always show source';
        const alwaysShowDis    = data.authorAllowlisted ? ' disabled'         : '';
        const blocklistNote = data.blocklistSize > 0
            ? `<span class="pf-insight-blocklist-count">${data.blocklistSize} source${data.blocklistSize !== 1 ? 's' : ''} blocked</span>`
            : '';
        const allowlistNote = data.allowlistSize > 0
            ? `<span class="pf-insight-blocklist-count">${data.allowlistSize} trusted</span>`
            : '';
        items.push(`
            <div class="pf-insight-section pf-insight-actions-section">
                <div class="pf-insight-section-title">Quick Actions ${blocklistNote}${allowlistNote}</div>
                <div class="pf-insight-action-row">
                    <button type="button" class="pf-insight-action-btn" data-pf-action="hide-similar">Hide similar posts</button>
                    <button type="button" class="pf-insight-action-btn"${alwaysShowDis} data-pf-action="always-show">${alwaysShowLabel}</button>
                    <button type="button" class="pf-insight-action-btn pf-insight-action-btn-danger"${blockDisabled} data-pf-action="block-source">${blockLabel}</button>
                </div>
            </div>
        `);

        if (!items.length) {
            return '<p>No additional details yet.</p>';
        }

        return items.join('');
    },

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
    },

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
    },

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
    },

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
    },

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
    },

    _getDialogHost(postNode) {
        if (!postNode) return null;

        if (postNode.matches && postNode.matches('[role="dialog"]')) {
            return postNode;
        }

        if (postNode.closest) {
            return postNode.closest('[role="dialog"]');
        }

        return null;
    },

    _hasCredDebugElement(postNode) {
        if (!postNode) return false;

        const dialogHost = this._getDialogHost(postNode);
        if (dialogHost) {
            return !!dialogHost.querySelector('.pf-cred-debug-chip');
        }

        return !!postNode.querySelector('.pf-cred-debug-chip');
    },

    _hasCredBlockElement(postNode) {
        if (!postNode) return false;

        const dialogHost = this._getDialogHost(postNode);
        if (dialogHost) {
            return !!dialogHost.querySelector('.pf-cred-block');
        }

        return !!postNode.querySelector('.pf-cred-block');
    },

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
    },

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
    },

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
    },

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
    },

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
    },

    _extractDomainFromUrl(url) {
        try {
            const parsed = new URL(url);
            return String(parsed.hostname || '').toLowerCase().replace(/^www\./, '');
        } catch (err) {
            return '';
        }
    },

    _formatCredibilitySummary(triggers) {
        if (!Array.isArray(triggers) || triggers.length === 0) {
            return 'suspicious claim pattern';
        }

        const unique = Array.from(new Set(triggers));
        return unique.slice(0, 3).join(', ');
    },

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
    },

    _buildVerificationSearchUrl(claimSeed) {
        const seed = String(claimSeed || '').replace(/\s+/g, ' ').trim();
        if (!seed) return '';

        const shortSeed = seed.slice(0, 180);
        const query = `"${shortSeed}" fact check`;
        return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    },

    _buildClaimSeed(text) {
        const normalized = String(text || '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!normalized) return '';

        return normalized.slice(0, 220);
    },

    // ── Friend Activity Feed Insight ──────────────────────────────────────────

    _applyFriendActivityBadges() {
        if (!this.settings?.predictions?.showFriendActivity) return;

        // Locate the contacts panel — FB uses several possible aria-labels across locales
        const contactsPanelSelectors = [
            '[aria-label="Contacts"]',
            '[aria-label="Contactos"]',
            '[aria-label="Kontakte"]',
            '[aria-label="Contacts"]',
            '[aria-label="Contatti"]',
            '[aria-label="Contacten"]',
            '[aria-label="Kontakter"]',
            '[aria-label="Kontakter"]',
        ];
        let panel = null;
        for (const sel of contactsPanelSelectors) {
            panel = document.querySelector(sel);
            if (panel) break;
        }
        if (!panel) return;

        // Each visible contact entry — FB renders them as listitem or link rows
        const rows = panel.querySelectorAll('[role="listitem"], [role="row"]');
        if (!rows.length) return;

        rows.forEach((row) => {
            // Extract name from aria-label on a child anchor/button, or from visible text
            let name = '';
            const labelEl = row.querySelector('[aria-label]');
            if (labelEl) {
                name = (labelEl.getAttribute('aria-label') || '').trim();
            }
            if (!name) {
                const textEl = row.querySelector('span[dir="auto"], span[class]');
                if (textEl) name = textEl.textContent.trim();
            }
            if (!name) return;

            const normalizedName = name.toLowerCase();
            const existingBadge = row.querySelector('.pf-friend-unseen');

            // Check if this contact's name (or a word from it) appears in session feed authors
            const seenInFeed = this._sessionFeedAuthors.size > 0 && (
                this._sessionFeedAuthors.has(normalizedName) ||
                // Partial match: contacts may show full name while feed shows first name
                Array.from(this._sessionFeedAuthors).some((a) =>
                    a.startsWith(normalizedName.split(' ')[0] + ' ') ||
                    normalizedName.startsWith(a.split(' ')[0] + ' ')
                )
            );

            if (!seenInFeed && this._sessionFeedAuthors.size >= 3) {
                // Only badge after we have enough data (≥3 authors seen in feed this session)
                if (!existingBadge) {
                    const badge = document.createElement('span');
                    badge.className = 'pf-friend-unseen';
                    badge.textContent = 'not in feed';
                    badge.title = 'This friend\'s posts haven\'t appeared in your feed this session — Facebook may be suppressing them.';
                    // Insert inline after the name element
                    const target = labelEl || row.querySelector('span[dir="auto"]');
                    if (target && target.parentElement) {
                        target.parentElement.insertBefore(badge, target.nextSibling);
                    } else {
                        row.appendChild(badge);
                    }
                }
            } else if (existingBadge) {
                existingBadge.remove();
            }
        });
    },

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

            .pf-insight-action-btn.pf-insight-action-btn-reset {
                border-color: rgba(255, 200, 80, 0.55);
                background: rgba(80, 60, 10, 0.28);
                color: #ffe080;
            }

            .pf-insight-action-btn.pf-insight-action-btn-reset:hover {
                border-color: rgba(255, 220, 100, 0.9);
                background: rgba(100, 80, 20, 0.52);
                color: #ffffff;
            }

            .pf-insight-session-section {
                margin-top: 8px;
                padding-top: 6px;
                border-top: 1px solid rgba(255, 200, 80, 0.22);
            }

            .pf-insight-session-section em {
                font-style: normal;
                color: #ffe080;
                font-weight: 800;
            }

            .pf-insight-trusted-badge {
                display: inline-flex;
                align-items: center;
                border-radius: 999px;
                padding: 1px 7px;
                font-size: 10px;
                font-weight: 700;
                border: 1px solid rgba(90, 230, 160, 0.55);
                background: rgba(20, 80, 50, 0.35);
                color: #7effc8;
            }

            .pf-insight-trusted-section {
                margin-top: 8px;
                padding-top: 6px;
                border-top: 1px solid rgba(90, 230, 160, 0.28);
            }

            .pf-insight-trusted-section p strong {
                color: #7effc8;
            }

            .pf-insight-blocked-section {
                margin-top: 8px;
                padding-top: 6px;
                border-top: 1px solid rgba(255, 130, 150, 0.28);
            }

            .pf-insight-blocked-section p strong {
                color: #ffb8c6;
            }

            .pf-insight-blocklist-count {
                font-size: 9px;
                font-weight: 600;
                color: #9ab0cc;
                margin-left: 6px;
                text-transform: none;
                letter-spacing: 0;
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

            /* Friend Activity Feed Insight — right-rail contact badge */
            .pf-friend-unseen {
                display: inline-block;
                margin-left: 4px;
                padding: 1px 5px;
                border-radius: 999px;
                border: 1px solid rgba(255, 185, 55, 0.45);
                background: rgba(38, 26, 4, 0.72);
                color: rgba(255, 210, 110, 0.9);
                font: 600 9px/1.4 "Segoe UI Variable Text", "Segoe UI", sans-serif;
                white-space: nowrap;
                vertical-align: middle;
                pointer-events: none;
                cursor: default;
            }
        `;

        document.head.appendChild(style);
        this._stylesInjected = true;
    },

});
