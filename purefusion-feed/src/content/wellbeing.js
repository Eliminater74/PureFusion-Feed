/**
 * PureFusion Feed - Digital Wellbeing
 * 
 * Breaking the psychological loops of Facebook via interface desaturation,
 * active doom-scrolling limits, and session time awareness HUD.
 */

class PF_Wellbeing {
    constructor(settings) {
        this.settings = settings;
        this.scrollCount = 0;
        this.isPaused = false;
        this.sessionStart = Date.now();
        this.timerIntervalId = null;
        this.reportIntervalId = null;
        this.lastReportShownAt = 0;
        this.reportHistoryStorageKey = 'pf_feed_report_weekly_v1';
        this.weeklyStatsCache = { days: {} };
        this.weeklyStatsLoaded = false;
        this.weeklyStatsFlushTimer = null;
        this.reportPanelEl = null;
        this.reportPanelTab = 'daily';
        this.reportPanelReasonExplain = '';
        this.lastSessionAwarenessPromptAt = 0;
        this.hiddenReasonCounts = new Map();
        this.reelsHiddenCount = 0;
        this.reelsWatchedCount = 0; // Incremented when actually watching immersive reels
        this.currentActiveReelId = null;
        this.reelActiveSince = 0;
        this.reelsObservedNodes = new WeakSet();
        this.reelsObserver = null;
        this.reelsPlayerInstance = null;
        
        this.scrollPulseTimestamps = [];
        this.sessionAwarenessListenerAttached = false;
        this.boundHiddenHandler = this._onElementHidden.bind(this);
        this.boundReportShortcutHandler = this._onReportShortcut.bind(this);
        this.boundWeeklyReportShortcutHandler = this._onWeeklyReportShortcut.bind(this);
        this.boundReportRequestHandler = this._onReportRequest.bind(this);
        this.boundWeeklyReportRequestHandler = this._onWeeklyReportRequest.bind(this);
        this.boundSessionAwarenessScrollHandler = this._onSessionAwarenessScroll.bind(this);
        this.boundReportPanelClickHandler = this._onReportPanelClick.bind(this);

        window.addEventListener('pf:element_hidden', this.boundHiddenHandler);
        window.addEventListener('keydown', this.boundReportShortcutHandler);
        window.addEventListener('keydown', this.boundWeeklyReportShortcutHandler);
        window.addEventListener('pf:show_feed_report', this.boundReportRequestHandler);
        window.addEventListener('pf:show_weekly_feed_report', this.boundWeeklyReportRequestHandler);
        this._loadWeeklyStatsCache();
        
        this.initDocumentLevel();
    }

    initDocumentLevel() {
        if (!this.settings) return;
        
        // 1. Grayscale System (Breaks visual dopamine loop)
        if (this.settings.wellbeing.grayscaleMode) {
            document.documentElement.style.setProperty('filter', 'grayscale(100%)', 'important');
            // To ensure photos don't flash in color during load, we slap it on the root HTML
            PF_Logger.info("PF_Wellbeing: Grayscale Mode Activated");
        } else {
            document.documentElement.style.removeProperty('filter');
        }

        // 2. Session Timer HUD
        if (this.settings.wellbeing.sessionTimer) {
            this._injectSessionTimer();
        } else {
            this._removeSessionTimer();
        }

        this._syncFeedReportLoop();
        this._syncSessionAwarenessLoop();
        this._syncReelsLimiterLoop();
    }

    updateSettings(settings) {
        this.settings = settings;
        this.initDocumentLevel();
    }

    _t(key, fallback, substitutions) {
        if (typeof chrome === 'undefined' || !chrome.i18n) return fallback;
        try {
            const localized = substitutions === undefined
                ? chrome.i18n.getMessage(key)
                : chrome.i18n.getMessage(key, substitutions);
            return localized || fallback;
        } catch (err) {
            return fallback;
        }
    }

    _onElementHidden(event) {
        const reason = String(event?.detail?.reason || 'Unknown');
        this.hiddenReasonCounts.set(reason, (this.hiddenReasonCounts.get(reason) || 0) + 1);

        if (reason.includes('Reels Session')) {
            this.reelsHiddenCount += 1;
        }

        this._recordWeeklyHiddenEvent(reason);

        if (this.reportPanelEl && this.reportPanelEl.style.display !== 'none') {
            this._renderFeedReportPanel();
        }
    }

    _onReportShortcut(event) {
        if (!event || event.defaultPrevented) return;
        if (!event.altKey || !event.shiftKey) return;
        if (String(event.key || '').toLowerCase() !== 'r') return;

        if (this._isEditableContext()) return;

        event.preventDefault();
        this._openFeedReportPanel('daily');
    }

    _onWeeklyReportShortcut(event) {
        if (!event || event.defaultPrevented) return;
        if (!event.altKey || !event.shiftKey) return;
        if (String(event.key || '').toLowerCase() !== 'w') return;

        if (this._isEditableContext()) return;

        event.preventDefault();
        this._openFeedReportPanel('weekly');
    }

    _onReportRequest() {
        this._openFeedReportPanel('daily');
    }

    _onWeeklyReportRequest() {
        this._openFeedReportPanel('weekly');
    }

    _isEditableContext() {
        const active = document.activeElement;
        if (!active) return false;

        const tag = String(active.tagName || '').toLowerCase();
        return active.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
    }

    _syncFeedReportLoop() {
        if (this.reportIntervalId) {
            clearInterval(this.reportIntervalId);
            this.reportIntervalId = null;
        }

        if (!this.settings?.wellbeing?.dailyFeedReportEnabled) return;

        const intervalMs = this._getReportIntervalMs();
        this.reportIntervalId = setInterval(() => {
            if (document.hidden) return;

            const sinceLastReport = Date.now() - this.lastReportShownAt;
            const elapsed = Date.now() - this.sessionStart;
            if (elapsed < intervalMs) return;
            if (sinceLastReport < intervalMs) return;

            this._showFeedReportToast('auto');
        }, 30000);
    }

    _syncSessionAwarenessLoop() {
        const enabled = !!this.settings?.wellbeing?.sessionAwarenessEnabled;

        if (!enabled) {
            if (this.sessionAwarenessListenerAttached) {
                window.removeEventListener('scroll', this.boundSessionAwarenessScrollHandler);
                this.sessionAwarenessListenerAttached = false;
            }
            this.scrollPulseTimestamps = [];
            return;
        }

        if (!this.sessionAwarenessListenerAttached) {
            window.addEventListener('scroll', this.boundSessionAwarenessScrollHandler, { passive: true });
            this.sessionAwarenessListenerAttached = true;
        }
    }

    _onSessionAwarenessScroll() {
        if (!this.settings?.wellbeing?.sessionAwarenessEnabled) return;
        if (document.hidden) return;

        const now = Date.now();
        this.scrollPulseTimestamps.push(now);
        this._trimScrollPulseWindow(now);

        const threshold = this._clampInt(
            this.settings?.wellbeing?.sessionAwarenessScrollsPerMinuteThreshold,
            30,
            220,
            85
        );

        if (this.scrollPulseTimestamps.length < threshold) return;

        const cooldownMinutes = this._clampInt(
            this.settings?.wellbeing?.sessionAwarenessCooldownMinutes,
            2,
            90,
            12
        );
        const cooldownMs = cooldownMinutes * 60 * 1000;
        if ((now - this.lastSessionAwarenessPromptAt) < cooldownMs) return;

        this.lastSessionAwarenessPromptAt = now;
        const elapsedMinutes = Math.max(1, Math.round((now - this.sessionStart) / 60000));

        PF_Helpers.showToast(
            this._t(
                'wellbeing_session_awareness_toast_template',
                'High scroll pace detected: $1 scrolls in the last minute ($2 min session). Consider a short break.',
                [String(this.scrollPulseTimestamps.length), String(elapsedMinutes)]
            ),
            'warn',
            5200
        );

        this.scrollPulseTimestamps = this.scrollPulseTimestamps.slice(-Math.max(8, Math.floor(threshold * 0.35)));
    }

    _trimScrollPulseWindow(now = Date.now()) {
        const oneMinuteAgo = now - 60000;
        while (this.scrollPulseTimestamps.length && this.scrollPulseTimestamps[0] < oneMinuteAgo) {
            this.scrollPulseTimestamps.shift();
        }
    }

    _getReportIntervalMs() {
        const minutes = this._clampInt(this.settings?.wellbeing?.dailyFeedReportAutoMinutes, 5, 180, 30);
        return minutes * 60 * 1000;
    }

    _syncReelsLimiterLoop() {
        if (!this.settings?.wellbeing?.reelsLimiterEnabled) {
            this._cleanupReelsObserver();
            return;
        }

        // Periodically check for the Reels player container if not already tracking
        if (!this.reelsPlayerInstance || !document.contains(this.reelsPlayerInstance)) {
            const player = document.querySelector('[role="dialog"] [aria-label*="Reels" i], [role="main"] [aria-label*="Reels" i]');
            if (player) {
                this._initReelsObserver(player);
            }
        }
    }

    _initReelsObserver(player) {
        if (this.reelsObserver) return;
        this.reelsPlayerInstance = player;

        const options = {
            root: player,
            threshold: 0.75 // Reel must be 75% visible to count as "active"
        };

        this.reelsObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this._onReelCandidateActive(entry.target);
                }
            });
        }, options);

        // We use a MutationObserver to find new reels being injected into the player
        this.reelsMutationObserver = new MutationObserver(() => {
            const reels = player.querySelectorAll('[role="article"], [data-video-id]');
            reels.forEach(reel => {
                if (!this.reelsObservedNodes.has(reel)) {
                    this.reelsObservedNodes.add(reel);
                    this.reelsObserver.observe(reel);
                }
            });
        });

        this.reelsMutationObserver.observe(player, { childList: true, subtree: true });
        
        // Initial scan
        player.querySelectorAll('[role="article"], [data-video-id]').forEach(reel => {
            this.reelsObservedNodes.add(reel);
            this.reelsObserver.observe(reel);
        });
    }

    _onReelCandidateActive(reelNode) {
        const reelId = reelNode.dataset?.videoId || reelNode.textContent?.substring(0, 20);
        if (this.currentActiveReelId === reelId) return;

        this.currentActiveReelId = reelId;
        this.reelActiveSince = Date.now();

        // Check if we already hit the limit during this "focused watch"
        // (Wait 3 seconds before counting to avoid rapid skips)
        setTimeout(() => {
            if (this.currentActiveReelId === reelId && (Date.now() - this.reelActiveSince) >= 2800) {
                this._incrementReelsWatched();
            }
        }, 3000);
    }

    _incrementReelsWatched() {
        this.reelsWatchedCount++;
        this._updateReelsHUD();

        const limit = this.settings?.wellbeing?.reelsSessionLimit || 3;
        if (this.reelsWatchedCount >= limit) {
            this._showReelsLockOverlay();
        }
    }

    _updateReelsHUD() {
        if (!this.reelsPlayerInstance) return;

        let hud = document.getElementById('pf-reels-hud');
        if (!hud) {
            hud = document.createElement('div');
            hud.id = 'pf-reels-hud';
            hud.style.cssText = `
                position: absolute; top: 20px; left: 20px; z-index: 9999;
                background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(8px);
                border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 12px;
                padding: 6px 14px; color: #fff; font-family: sans-serif;
                font-size: 13px; font-weight: bold; pointer-events: none;
                transition: opacity 0.3s ease;
            `;
            this.reelsPlayerInstance.appendChild(hud);
        }

        const limit = this.settings?.wellbeing?.reelsSessionLimit || 3;
        hud.textContent = `Reel ${this.reelsWatchedCount} / ${limit}`;

        // Fade out after 2 seconds to avoid clutter
        hud.style.opacity = '1';
        clearTimeout(this.reelsHudTimer);
        this.reelsHudTimer = setTimeout(() => {
            if (hud) hud.style.opacity = '0.3';
        }, 3000);
    }

    _showReelsLockOverlay() {
        if (!this.reelsPlayerInstance || document.getElementById('pf-reels-lock')) return;

        const limit = this.settings?.wellbeing?.reelsSessionLimit || 3;
        const hardLock = this.settings?.wellbeing?.reelsHardLock;
        
        const lock = document.createElement('div');
        lock.id = 'pf-reels-lock';
        lock.style.cssText = `
            position: absolute; inset: 0; z-index: 10000;
            background: rgba(10, 10, 12, 0.95); backdrop-filter: blur(20px);
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            color: #fff; font-family: sans-serif; text-align: center; padding: 30px;
        `;

        const title = this._t('wellbeing_reels_lock_title', 'Time for a Breather');
        const body = this._t('wellbeing_reels_lock_body', `You've watched ${limit} Reels this session. Taking short breaks helps prevent mindless scrolling.`);
        const resumeLabel = this._t('wellbeing_reels_lock_resume', 'Resume Scrolling');
        const hardLockMsg = this._t('wellbeing_reels_lock_hard', 'Reels are locked for the rest of this session.');

        lock.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 20px;">🧘</div>
            <h2 style="font-size: 24px; margin-bottom: 12px;">${title}</h2>
            <p style="color: #ccc; max-width: 400px; line-height: 1.5; margin-bottom: 30px;">${body}</p>
            ${hardLock ? `<p style="color: #ff4444; font-weight: bold;">${hardLockMsg}</p>` : `
                <button id="pf-reels-resume-btn" disabled style="
                    background: #6C3FC5; color: #fff; border: none; padding: 12px 32px;
                    border-radius: 99px; font-weight: bold; cursor: not-allowed; opacity: 0.5;
                    transition: all 0.3s ease;
                ">${resumeLabel} (5s)</button>
            `}
        `;

        this.reelsPlayerInstance.appendChild(lock);

        if (!hardLock) {
            const btn = lock.querySelector('#pf-reels-resume-btn');
            let countdown = 5;
            const timer = setInterval(() => {
                countdown--;
                if (countdown > 0) {
                    btn.textContent = `${resumeLabel} (${countdown}s)`;
                } else {
                    clearInterval(timer);
                    btn.disabled = false;
                    btn.style.cursor = 'pointer';
                    btn.style.opacity = '1';
                    btn.textContent = resumeLabel;
                }
            }, 1000);

            btn.addEventListener('click', () => {
                this.reelsWatchedCount = 0;
                lock.remove();
                this._updateReelsHUD();
            });
        }
    }

    _cleanupReelsObserver() {
        if (this.reelsObserver) {
            this.reelsObserver.disconnect();
            this.reelsObserver = null;
        }
        if (this.reelsMutationObserver) {
            this.reelsMutationObserver.disconnect();
            this.reelsMutationObserver = null;
        }
        this.reelsPlayerInstance = null;
        this.reelsObservedNodes = new WeakSet();
    }

    _clampInt(value, min, max, fallback) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(min, Math.min(max, Math.round(parsed)));
    }

    _buildFeedReportSnapshot() {
        const hiddenTotal = Array.from(this.hiddenReasonCounts.values()).reduce((sum, count) => sum + count, 0);
        const sortedReasons = Array.from(this.hiddenReasonCounts.entries())
            .sort((a, b) => b[1] - a[1]);

        const topReason = sortedReasons.length
            ? `${sortedReasons[0][0]} (${sortedReasons[0][1]})`
            : this._t('wellbeing_report_no_filters', 'No filters triggered yet');
        const nonReelHidden = Math.max(0, hiddenTotal - this.reelsHiddenCount);
        const estimatedSecondsSaved = (nonReelHidden * 6) + (this.reelsHiddenCount * 20);
        const estimatedMinutesSaved = Math.max(0, Math.round((estimatedSecondsSaved / 60) * 10) / 10);

        return {
            hiddenTotal,
            reelsHidden: this.reelsHiddenCount,
            topReason,
            estimatedMinutesSaved
        };
    }

    _showFeedReportToast(trigger = 'manual') {
        if (!this.settings?.wellbeing?.dailyFeedReportEnabled) {
            PF_Helpers.showToast(this._t('wellbeing_report_disabled', 'Daily Feed Report is disabled. Enable it in Digital Wellbeing.'), 'info', 3200);
            return;
        }

        const snapshot = this._buildFeedReportSnapshot();

        if (trigger === 'auto' && snapshot.hiddenTotal === 0 && snapshot.reelsHidden === 0) {
            this.lastReportShownAt = Date.now();
            return;
        }

        this.lastReportShownAt = Date.now();

        const label = trigger === 'auto'
            ? this._t('wellbeing_report_label_auto', 'Daily Feed Report')
            : this._t('wellbeing_report_label_session', 'Session Feed Report');
        const message = this._t(
            'wellbeing_report_toast_template',
            `${label}: hidden ${snapshot.hiddenTotal} items, reels blocked ${snapshot.reelsHidden}, top reason ${snapshot.topReason}, est. ${snapshot.estimatedMinutesSaved} min saved.`,
            [label, String(snapshot.hiddenTotal), String(snapshot.reelsHidden), snapshot.topReason, String(snapshot.estimatedMinutesSaved)]
        );
        PF_Helpers.showToast(message, 'info', 5600);
    }

    _recordWeeklyHiddenEvent(reason) {
        if (!this.weeklyStatsCache || typeof this.weeklyStatsCache !== 'object') {
            this.weeklyStatsCache = { days: {} };
        }

        if (!this.weeklyStatsCache.days || typeof this.weeklyStatsCache.days !== 'object') {
            this.weeklyStatsCache.days = {};
        }

        const now = Date.now();
        const dayKey = this._toDayKey(now);
        if (!this.weeklyStatsCache.days[dayKey]) {
            this.weeklyStatsCache.days[dayKey] = {
                hiddenTotal: 0,
                reelsHidden: 0,
                savedSeconds: 0,
                reasons: {},
                lastUpdated: now
            };
        }

        const bucket = this.weeklyStatsCache.days[dayKey];
        bucket.hiddenTotal += 1;
        bucket.reasons[reason] = (bucket.reasons[reason] || 0) + 1;

        const isReel = reason.includes('Reels Session');
        if (isReel) bucket.reelsHidden += 1;
        bucket.savedSeconds += isReel ? 20 : 6;
        bucket.lastUpdated = now;

        this._scheduleWeeklyStatsFlush();
    }

    _scheduleWeeklyStatsFlush() {
        if (this.weeklyStatsFlushTimer) return;

        this.weeklyStatsFlushTimer = setTimeout(() => {
            this.weeklyStatsFlushTimer = null;
            this._flushWeeklyStatsCache();
        }, 2500);
    }

    async _flushWeeklyStatsCache() {
        if (!window.PF_Storage || typeof window.PF_Storage.setLocalData !== 'function') return;

        const cache = this._pruneWeeklyStats(this.weeklyStatsCache);
        try {
            await window.PF_Storage.setLocalData(this.reportHistoryStorageKey, cache);
        } catch (err) {
            // no-op
        }
    }

    async _loadWeeklyStatsCache() {
        if (!window.PF_Storage || typeof window.PF_Storage.getLocalData !== 'function') {
            this.weeklyStatsLoaded = true;
            return;
        }

        try {
            const saved = await window.PF_Storage.getLocalData(this.reportHistoryStorageKey);
            const normalized = this._normalizeWeeklyStats(saved);
            this.weeklyStatsCache = this._mergeWeeklyStats(normalized, this.weeklyStatsCache);
        } catch (err) {
            // no-op
        } finally {
            this.weeklyStatsLoaded = true;
        }
    }

    _normalizeWeeklyStats(input) {
        const rawDays = input && typeof input === 'object' && input.days && typeof input.days === 'object'
            ? input.days
            : {};

        const normalized = { days: {} };
        Object.entries(rawDays).forEach(([dayKey, bucket]) => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey))) return;
            if (!bucket || typeof bucket !== 'object') return;

            const reasons = {};
            Object.entries(bucket.reasons || {}).forEach(([reason, count]) => {
                const c = Number(count);
                if (!reason || !Number.isFinite(c) || c <= 0) return;
                reasons[String(reason)] = Math.max(1, Math.round(c));
            });

            normalized.days[dayKey] = {
                hiddenTotal: Math.max(0, Number.isFinite(Number(bucket.hiddenTotal)) ? Math.round(Number(bucket.hiddenTotal)) : 0),
                reelsHidden: Math.max(0, Number.isFinite(Number(bucket.reelsHidden)) ? Math.round(Number(bucket.reelsHidden)) : 0),
                savedSeconds: Math.max(0, Number.isFinite(Number(bucket.savedSeconds)) ? Math.round(Number(bucket.savedSeconds)) : 0),
                reasons,
                lastUpdated: Number.isFinite(Number(bucket.lastUpdated)) ? Number(bucket.lastUpdated) : Date.now()
            };
        });

        return this._pruneWeeklyStats(normalized);
    }

    _mergeWeeklyStats(primary, secondary) {
        const merged = { days: {} };

        const writeBucket = (dayKey, bucket) => {
            if (!merged.days[dayKey]) {
                merged.days[dayKey] = {
                    hiddenTotal: 0,
                    reelsHidden: 0,
                    savedSeconds: 0,
                    reasons: {},
                    lastUpdated: Date.now()
                };
            }

            const target = merged.days[dayKey];
            target.hiddenTotal += Math.max(0, Number(bucket.hiddenTotal || 0));
            target.reelsHidden += Math.max(0, Number(bucket.reelsHidden || 0));
            target.savedSeconds += Math.max(0, Number(bucket.savedSeconds || 0));
            target.lastUpdated = Math.max(target.lastUpdated, Number(bucket.lastUpdated || 0));

            Object.entries(bucket.reasons || {}).forEach(([reason, count]) => {
                const c = Math.max(0, Number(count || 0));
                if (!reason || c <= 0) return;
                target.reasons[reason] = (target.reasons[reason] || 0) + c;
            });
        };

        const sources = [primary, secondary];
        sources.forEach((source) => {
            if (!source || typeof source !== 'object' || !source.days) return;
            Object.entries(source.days).forEach(([dayKey, bucket]) => {
                if (!bucket || typeof bucket !== 'object') return;
                writeBucket(dayKey, bucket);
            });
        });

        return this._pruneWeeklyStats(merged);
    }

    _pruneWeeklyStats(stats) {
        const safe = { days: {} };
        if (!stats || typeof stats !== 'object' || !stats.days) return safe;

        const dayEntries = Object.entries(stats.days)
            .filter(([dayKey]) => /^\d{4}-\d{2}-\d{2}$/.test(String(dayKey)))
            .sort((a, b) => a[0].localeCompare(b[0]));

        const retained = dayEntries.slice(-35);
        retained.forEach(([dayKey, bucket]) => {
            safe.days[dayKey] = bucket;
        });

        return safe;
    }

    _toDayKey(timestamp) {
        const date = new Date(timestamp);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    _showWeeklyFeedReportToast(trigger = 'manual') {
        const aggregate = this._buildWeeklyReportSnapshot();
        if (!aggregate) {
            PF_Helpers.showToast(this._t('wellbeing_weekly_report_no_data', 'Weekly report needs more activity data first.'), 'info', 3600);
            return;
        }

        const label = this._t('wellbeing_weekly_report_label', 'Weekly Feed Report');
        const message = this._t(
            'wellbeing_weekly_report_toast_template',
            `${label}: hidden ${aggregate.hiddenTotal} items, reels blocked ${aggregate.reelsHidden}, top distraction ${aggregate.topReason}, est. ${aggregate.estimatedMinutesSaved} min saved over 7 days.`,
            [label, String(aggregate.hiddenTotal), String(aggregate.reelsHidden), aggregate.topReason, String(aggregate.estimatedMinutesSaved)]
        );

        PF_Helpers.showToast(message, trigger === 'auto' ? 'info' : 'success', 6200);
    }

    _buildWeeklyReportSnapshot() {
        const days = this.weeklyStatsCache?.days;
        if (!days || typeof days !== 'object') return null;

        const now = Date.now();
        const dayKeys = this._buildRecentDayKeys(7, now);
        const dayKeySet = new Set(dayKeys);
        const aggregateReasons = new Map();

        let hiddenTotal = 0;
        let reelsHidden = 0;
        let savedSeconds = 0;

        const dailySeries = dayKeys.map((dayKey) => {
            const bucket = days[dayKey] || {};
            return {
                dayKey,
                hiddenTotal: Math.max(0, Number(bucket.hiddenTotal || 0)),
                reelsHidden: Math.max(0, Number(bucket.reelsHidden || 0)),
                savedSeconds: Math.max(0, Number(bucket.savedSeconds || 0))
            };
        });

        Object.entries(days).forEach(([dayKey, bucket]) => {
            if (!bucket || typeof bucket !== 'object') return;
            if (!dayKeySet.has(dayKey)) return;

            hiddenTotal += Math.max(0, Number(bucket.hiddenTotal || 0));
            reelsHidden += Math.max(0, Number(bucket.reelsHidden || 0));
            savedSeconds += Math.max(0, Number(bucket.savedSeconds || 0));

            Object.entries(bucket.reasons || {}).forEach(([reason, count]) => {
                const c = Math.max(0, Number(count || 0));
                if (!reason || c <= 0) return;
                aggregateReasons.set(reason, (aggregateReasons.get(reason) || 0) + c);
            });
        });

        if (hiddenTotal <= 0 && reelsHidden <= 0) return null;

        const topReasonEntry = Array.from(aggregateReasons.entries()).sort((a, b) => b[1] - a[1])[0];
        const topReason = topReasonEntry
            ? `${topReasonEntry[0]} (${topReasonEntry[1]})`
            : this._t('wellbeing_report_no_filters', 'No filters triggered yet');

        const estimatedMinutesSaved = Math.max(0, Math.round((savedSeconds / 60) * 10) / 10);
        const topReasons = Array.from(aggregateReasons.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([reason, count]) => ({ reason, count }));

        return {
            hiddenTotal,
            reelsHidden,
            topReason,
            estimatedMinutesSaved,
            topReasons,
            dailySeries
        };
    }

    _buildRecentDayKeys(dayCount, now = Date.now()) {
        const count = Math.max(1, Math.min(31, Number.isFinite(Number(dayCount)) ? Math.round(Number(dayCount)) : 7));
        const keys = [];

        for (let i = count - 1; i >= 0; i -= 1) {
            const ts = now - (i * 24 * 60 * 60 * 1000);
            keys.push(this._toDayKey(ts));
        }

        return keys;
    }

    _openFeedReportPanel(tab = 'daily') {
        this.reportPanelTab = tab === 'weekly' ? 'weekly' : 'daily';
        this._dispatchReportActionTelemetry('open_panel', { tab: this.reportPanelTab });

        const panel = this._ensureFeedReportPanel();
        if (!panel) {
            if (this.reportPanelTab === 'weekly') this._showWeeklyFeedReportToast('manual');
            else this._showFeedReportToast('manual');
            return;
        }

        panel.style.display = 'block';
        this._renderFeedReportPanel();
    }

    _ensureFeedReportPanel() {
        if (this.reportPanelEl && this.reportPanelEl.isConnected) return this.reportPanelEl;

        this._ensureFeedReportPanelStyles();

        const panel = document.createElement('div');
        panel.id = 'pf-feed-report-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', this._t('wellbeing_report_panel_title', 'PureFusion Feed Reports'));

        panel.innerHTML = `
            <div class="pf-frp-header">
                <div class="pf-frp-title">${this._t('wellbeing_report_panel_title', 'PureFusion Feed Reports')}</div>
                <button type="button" data-pf-action="close" aria-label="${this._t('wellbeing_report_panel_close', 'Close')}">×</button>
            </div>
            <div class="pf-frp-tabs">
                <button type="button" data-pf-tab="daily">${this._t('wellbeing_report_panel_session_tab', 'Session')}</button>
                <button type="button" data-pf-tab="weekly">${this._t('wellbeing_report_panel_weekly_tab', 'Weekly')}</button>
            </div>
            <div id="pf-feed-report-panel-content" class="pf-frp-content"></div>
            <div class="pf-frp-footer">
                <button type="button" data-pf-action="refresh">${this._t('wellbeing_report_panel_refresh', 'Refresh')}</button>
                <button type="button" data-pf-action="reset-session">${this._t('wellbeing_report_panel_reset_session', 'Reset Session')}</button>
            </div>
        `;

        panel.addEventListener('click', this.boundReportPanelClickHandler);
        document.body.appendChild(panel);
        this.reportPanelEl = panel;
        return panel;
    }

    _ensureFeedReportPanelStyles() {
        if (document.getElementById('pf-feed-report-panel-style')) return;

        const style = document.createElement('style');
        style.id = 'pf-feed-report-panel-style';
        style.textContent = `
            #pf-feed-report-panel {
                position: fixed;
                right: 20px;
                bottom: 68px;
                width: min(390px, calc(100vw - 24px));
                max-height: min(72vh, 620px);
                overflow: hidden;
                z-index: 10000;
                border-radius: 14px;
                border: 1px solid rgba(91, 208, 255, 0.42);
                background: rgba(17, 24, 35, 0.96);
                color: #d6e6ff;
                box-shadow: 0 12px 28px rgba(0, 0, 0, 0.42);
                backdrop-filter: blur(10px);
                font: 700 12px/1.35 "Segoe UI Variable Text", "Segoe UI", sans-serif;
            }

            #pf-feed-report-panel .pf-frp-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 12px;
                border-bottom: 1px solid rgba(112, 140, 180, 0.28);
            }

            #pf-feed-report-panel .pf-frp-title {
                font-size: 13px;
                letter-spacing: 0.02em;
                color: #f1f7ff;
            }

            #pf-feed-report-panel .pf-frp-header button {
                appearance: none;
                border: 1px solid rgba(173, 195, 222, 0.5);
                background: rgba(21, 32, 48, 0.92);
                color: #dcecff;
                border-radius: 999px;
                width: 24px;
                height: 24px;
                cursor: pointer;
                font: 700 14px/1 "Segoe UI", sans-serif;
            }

            #pf-feed-report-panel .pf-frp-tabs {
                display: flex;
                gap: 8px;
                padding: 8px 12px 0;
            }

            #pf-feed-report-panel .pf-frp-tabs button,
            #pf-feed-report-panel .pf-frp-footer button {
                appearance: none;
                border: 1px solid rgba(114, 146, 184, 0.52);
                border-radius: 999px;
                background: rgba(25, 36, 54, 0.9);
                color: #d8e9ff;
                cursor: pointer;
                padding: 3px 10px;
                font: 700 11px/1.2 "Segoe UI", sans-serif;
            }

            #pf-feed-report-panel .pf-frp-tabs button.is-active {
                border-color: rgba(120, 235, 255, 0.82);
                background: rgba(34, 74, 104, 0.96);
                color: #e8f8ff;
            }

            #pf-feed-report-panel .pf-frp-content {
                padding: 10px 12px;
                max-height: 52vh;
                overflow: auto;
                display: grid;
                gap: 8px;
            }

            #pf-feed-report-panel .pf-frp-row {
                display: flex;
                justify-content: space-between;
                gap: 10px;
                border: 1px solid rgba(90, 121, 161, 0.35);
                border-radius: 10px;
                padding: 6px 8px;
                background: rgba(24, 33, 50, 0.74);
            }

            #pf-feed-report-panel .pf-frp-key {
                color: #b4c8e8;
                font-weight: 700;
            }

            #pf-feed-report-panel .pf-frp-val {
                color: #f1f7ff;
                text-align: right;
            }

            #pf-feed-report-panel .pf-frp-note {
                color: #c8d8f0;
                font-size: 11px;
                font-weight: 600;
            }

            #pf-feed-report-panel .pf-frp-section-title {
                margin-top: 2px;
                color: #eef6ff;
                font-size: 11px;
                letter-spacing: 0.03em;
                text-transform: uppercase;
            }

            #pf-feed-report-panel .pf-frp-trend {
                display: grid;
                grid-template-columns: repeat(7, minmax(0, 1fr));
                gap: 6px;
                align-items: end;
                border: 1px solid rgba(90, 121, 161, 0.35);
                border-radius: 10px;
                padding: 8px;
                background: rgba(24, 33, 50, 0.74);
            }

            #pf-feed-report-panel .pf-frp-trend-col {
                display: grid;
                gap: 3px;
                justify-items: center;
                min-width: 0;
            }

            #pf-feed-report-panel .pf-frp-trend-track {
                width: 100%;
                height: 46px;
                display: flex;
                align-items: flex-end;
                justify-content: center;
            }

            #pf-feed-report-panel .pf-frp-trend-bar {
                width: 12px;
                border-radius: 6px;
                background: linear-gradient(180deg, rgba(101, 227, 255, 0.96) 0%, rgba(77, 139, 255, 0.98) 100%);
                box-shadow: 0 1px 8px rgba(83, 173, 255, 0.42);
                min-height: 2px;
            }

            #pf-feed-report-panel .pf-frp-trend-day {
                color: #a9c0e5;
                font: 700 10px/1 "Segoe UI", sans-serif;
            }

            #pf-feed-report-panel .pf-frp-trend-num {
                color: #e8f3ff;
                font: 700 10px/1 "Segoe UI", sans-serif;
            }

            #pf-feed-report-panel .pf-frp-top-list {
                margin: 0;
                padding: 0;
                list-style: none;
                display: grid;
                gap: 6px;
            }

            #pf-feed-report-panel .pf-frp-top-list li {
                display: flex;
                justify-content: space-between;
                gap: 8px;
                border: 1px solid rgba(90, 121, 161, 0.35);
                border-radius: 10px;
                padding: 6px 8px;
                background: rgba(24, 33, 50, 0.74);
            }

            #pf-feed-report-panel .pf-frp-top-label {
                color: #c4d7f5;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            #pf-feed-report-panel .pf-frp-top-count {
                color: #f1f7ff;
            }

            #pf-feed-report-panel .pf-frp-top-reason-btn {
                appearance: none;
                border: 1px solid rgba(114, 146, 184, 0.52);
                border-radius: 999px;
                background: rgba(25, 36, 54, 0.9);
                color: #d8e9ff;
                cursor: pointer;
                padding: 2px 8px;
                font: 700 10px/1.15 "Segoe UI", sans-serif;
                flex-shrink: 0;
            }

            #pf-feed-report-panel .pf-frp-top-reason-btn.is-active {
                border-color: rgba(120, 235, 255, 0.82);
                background: rgba(34, 74, 104, 0.96);
                color: #e8f8ff;
            }

            #pf-feed-report-panel .pf-frp-reason-explain {
                border: 1px solid rgba(83, 121, 171, 0.38);
                border-radius: 10px;
                padding: 8px;
                background: rgba(24, 33, 50, 0.74);
                color: #d2e1f8;
                font: 600 11px/1.32 "Segoe UI", sans-serif;
            }

            #pf-feed-report-panel .pf-frp-reason-explain .pf-frp-top-reason-btn {
                margin-top: 8px;
            }

            #pf-feed-report-panel .pf-frp-footer {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
                padding: 8px 12px 12px;
                border-top: 1px solid rgba(112, 140, 180, 0.22);
            }
        `;

        document.head.appendChild(style);
    }

    _onReportPanelClick(event) {
        const actionBtn = event?.target?.closest?.('[data-pf-action]');
        const tabBtn = event?.target?.closest?.('[data-pf-tab]');

        if (tabBtn) {
            const tab = String(tabBtn.getAttribute('data-pf-tab') || 'daily').toLowerCase();
            this.reportPanelTab = tab === 'weekly' ? 'weekly' : 'daily';
            if (this.reportPanelTab !== 'weekly') this.reportPanelReasonExplain = '';
            this._dispatchReportActionTelemetry('switch_tab', { tab: this.reportPanelTab });
            this._renderFeedReportPanel();
            return;
        }

        if (!actionBtn) return;
        const action = String(actionBtn.getAttribute('data-pf-action') || '').toLowerCase();

        if (action === 'close') {
            if (this.reportPanelEl) this.reportPanelEl.style.display = 'none';
            this._dispatchReportActionTelemetry('close_panel', { tab: this.reportPanelTab });
            return;
        }

        if (action === 'refresh') {
            this._dispatchReportActionTelemetry('refresh_panel', { tab: this.reportPanelTab });
            this._renderFeedReportPanel();
            return;
        }

        if (action === 'explain-reason') {
            const rawReason = String(actionBtn.getAttribute('data-pf-reason') || '');
            this.reportPanelReasonExplain = (this.reportPanelReasonExplain === rawReason) ? '' : rawReason;
            this._dispatchReportActionTelemetry('explain_reason', {
                tab: this.reportPanelTab,
                reason: rawReason,
                expanded: this.reportPanelReasonExplain ? 'true' : 'false'
            });
            this._renderFeedReportPanel();
            return;
        }

        if (action === 'open-related-settings') {
            const tabId = String(actionBtn.getAttribute('data-pf-tab') || '').trim();
            const focusSelector = String(actionBtn.getAttribute('data-pf-focus') || '').trim();
            if (tabId) {
                window.dispatchEvent(new CustomEvent('pf:open_advanced_settings', {
                    detail: { tabId, focusSelector }
                }));
                this._dispatchReportActionTelemetry('open_related_settings', {
                    tab: this.reportPanelTab,
                    settingsTab: tabId,
                    focusSelector
                });
            }
            return;
        }

        if (action === 'reset-session') {
            this.hiddenReasonCounts = new Map();
            this.reelsHiddenCount = 0;
            this.sessionStart = Date.now();
            this.scrollPulseTimestamps = [];
            this.lastReportShownAt = 0;
            this.reportPanelReasonExplain = '';
            this._dispatchReportActionTelemetry('reset_session_counters', { tab: this.reportPanelTab });
            this._renderFeedReportPanel();
            PF_Helpers.showToast(this._t('wellbeing_report_panel_reset_done', 'Session counters reset.'), 'info', 2600);
        }
    }

    _dispatchReportActionTelemetry(action, extra = {}) {
        const safeAction = String(action || '').trim();
        if (!safeAction) return;

        window.dispatchEvent(new CustomEvent('pf:wellbeing_report_action', {
            detail: {
                action: safeAction,
                ts: Date.now(),
                ...extra
            }
        }));
    }

    _renderFeedReportPanel() {
        const panel = this._ensureFeedReportPanel();
        if (!panel) return;

        const content = panel.querySelector('#pf-feed-report-panel-content');
        if (!content) return;

        const tab = this.reportPanelTab === 'weekly' ? 'weekly' : 'daily';
        panel.querySelectorAll('[data-pf-tab]').forEach((btn) => {
            const isActive = btn.getAttribute('data-pf-tab') === tab;
            btn.classList.toggle('is-active', isActive);
        });

        const html = tab === 'weekly'
            ? this._buildWeeklyReportPanelHtml()
            : this._buildDailyReportPanelHtml();

        content.innerHTML = html;
    }

    _buildDailyReportPanelHtml() {
        const snapshot = this._buildFeedReportSnapshot();
        const elapsedMinutes = Math.max(1, Math.round((Date.now() - this.sessionStart) / 60000));

        return `
            ${this._panelRow('wellbeing_report_panel_hidden', 'Hidden items', snapshot.hiddenTotal)}
            ${this._panelRow('wellbeing_report_panel_reels', 'Reels blocked', snapshot.reelsHidden)}
            ${this._panelRow('wellbeing_report_panel_top_reason', 'Top distraction', snapshot.topReason)}
            ${this._panelRow('wellbeing_report_panel_minutes_saved', 'Minutes saved (est.)', snapshot.estimatedMinutesSaved)}
            ${this._panelRow('wellbeing_report_panel_elapsed', 'Session elapsed', `${elapsedMinutes}m`)}
            <div class="pf-frp-note">${this._escapeHtml(this._t('wellbeing_report_panel_note', 'Tip: Daily values reset with session reset; weekly rollup is calculated from saved daily buckets.'))}</div>
        `;
    }

    _buildWeeklyReportPanelHtml() {
        const snapshot = this._buildWeeklyReportSnapshot();
        if (!snapshot) {
            return `<div class="pf-frp-note">${this._escapeHtml(this._t('wellbeing_weekly_report_no_data', 'Weekly report needs more activity data first.'))}</div>`;
        }

        const trendHtml = this._buildWeeklyTrendHtml(snapshot.dailySeries);
        const topReasonsHtml = this._buildWeeklyTopReasonsHtml(snapshot.topReasons);

        return `
            <div class="pf-frp-note">${this._escapeHtml(this._t('wellbeing_report_panel_weekly_window', 'Rolling 7-day window'))}</div>
            ${this._panelRow('wellbeing_report_panel_hidden', 'Hidden items', snapshot.hiddenTotal)}
            ${this._panelRow('wellbeing_report_panel_reels', 'Reels blocked', snapshot.reelsHidden)}
            ${this._panelRow('wellbeing_report_panel_top_reason', 'Top distraction', snapshot.topReason)}
            ${this._panelRow('wellbeing_report_panel_minutes_saved', 'Minutes saved (est.)', snapshot.estimatedMinutesSaved)}
            <div class="pf-frp-section-title">${this._escapeHtml(this._t('wellbeing_report_panel_weekly_trend_title', '7-day trend'))}</div>
            ${trendHtml}
            <div class="pf-frp-section-title">${this._escapeHtml(this._t('wellbeing_report_panel_weekly_top_reasons_title', 'Top distraction reasons'))}</div>
            ${topReasonsHtml}
        `;
    }

    _buildWeeklyTrendHtml(series) {
        const rows = Array.isArray(series) ? series : [];
        if (!rows.length) {
            return `<div class="pf-frp-note">${this._escapeHtml(this._t('wellbeing_weekly_report_no_data', 'Weekly report needs more activity data first.'))}</div>`;
        }

        const maxValue = Math.max(1, ...rows.map((item) => Math.max(0, Number(item?.hiddenTotal || 0))));
        const columns = rows.map((item) => {
            const hiddenTotal = Math.max(0, Number(item?.hiddenTotal || 0));
            const heightPct = Math.max(hiddenTotal > 0 ? 12 : 4, Math.round((hiddenTotal / maxValue) * 100));
            const dayLabel = this._escapeHtml(this._formatDayShortLabel(item?.dayKey));
            const countLabel = this._escapeHtml(String(hiddenTotal));

            return `
                <div class="pf-frp-trend-col">
                    <div class="pf-frp-trend-track" title="${dayLabel}: ${countLabel}">
                        <div class="pf-frp-trend-bar" style="height:${heightPct}%;"></div>
                    </div>
                    <div class="pf-frp-trend-day">${dayLabel}</div>
                    <div class="pf-frp-trend-num">${countLabel}</div>
                </div>
            `;
        }).join('');

        return `<div class="pf-frp-trend">${columns}</div>`;
    }

    _buildWeeklyTopReasonsHtml(topReasons) {
        const reasons = Array.isArray(topReasons) ? topReasons : [];
        if (!reasons.length) {
            return `<div class="pf-frp-note">${this._escapeHtml(this._t('wellbeing_report_panel_weekly_no_reasons', 'No distraction reason data yet.'))}</div>`;
        }

        const listItems = reasons.map((item) => {
            const rawReason = String(item?.reason || this._t('wellbeing_report_no_filters', 'No filters triggered yet'));
            const reason = this._escapeHtml(rawReason);
            const reasonAttr = this._escapeAttr(rawReason);
            const count = this._escapeHtml(String(Math.max(0, Number(item?.count || 0))));
            const isActive = this.reportPanelReasonExplain === rawReason;
            const explainBtnLabel = this._escapeHtml(this._t('wellbeing_report_panel_weekly_reason_explain', 'Explain'));
            const explainBtnClass = isActive ? 'pf-frp-top-reason-btn is-active' : 'pf-frp-top-reason-btn';
            return `<li><span class="pf-frp-top-label" title="${reason}">${reason}</span><span class="pf-frp-top-count">${count}</span><button type="button" class="${explainBtnClass}" data-pf-action="explain-reason" data-pf-reason="${reasonAttr}">${explainBtnLabel}</button></li>`;
        }).join('');

        const explainBlock = this.reportPanelReasonExplain
            ? `<div class="pf-frp-reason-explain">${this._escapeHtml(this._describeReasonForPanel(this.reportPanelReasonExplain))}${this._buildReasonSettingsActionHtml(this.reportPanelReasonExplain)}</div>`
            : '';

        return `<ul class="pf-frp-top-list">${listItems}</ul>${explainBlock}`;
    }

    _describeReasonForPanel(reason) {
        const normalized = String(reason || '').toLowerCase();

        if (normalized.includes('ad') || normalized.includes('sponsored') || normalized.includes('spam')) {
            return this._t('wellbeing_report_reason_explain_ads', 'Sponsored or ad-like content was filtered to reduce promotional clutter.');
        }
        if (normalized.includes('story type')) {
            return this._t('wellbeing_report_reason_explain_story', 'Story activity patterns (likes/comments/friend joins/check-ins) were filtered as low-signal feed noise.');
        }
        if (normalized.includes('post type')) {
            return this._t('wellbeing_report_reason_explain_post_type', 'A post-format filter removed content types you chose to suppress (video/photo/link/text-only).');
        }
        if (normalized.includes('ragebait') || normalized.includes('clickbait')) {
            return this._t('wellbeing_report_reason_explain_bait', 'Behavioral safety filters flagged manipulative or high-outrage patterns designed to keep you scrolling.');
        }
        if (normalized.includes('topbar') || normalized.includes('sidebar') || normalized.includes('nav')) {
            return this._t('wellbeing_report_reason_explain_nav', 'Navigation and module clutter controls removed distracting non-feed UI elements.');
        }
        if (normalized.includes('keyword')) {
            return this._t('wellbeing_report_reason_explain_keyword', 'Keyword rules matched this item and filtered it based on your custom block list.');
        }

        return this._t('wellbeing_report_reason_explain_generic', 'This category was filtered by your active PureFusion rules to keep your feed cleaner and more focused.');
    }

    _resolveReasonSettingsRoute(reason) {
        const normalized = String(reason || '').toLowerCase();

        if (normalized.includes('ad') || normalized.includes('sponsored') || normalized.includes('spam')) {
            return { tabId: 'tab-filters', focusSelector: '#opt_filters_removeAds' };
        }
        if (normalized.includes('story type')) {
            return { tabId: 'tab-filters', focusSelector: '#opt_story_hideLikedThis' };
        }
        if (normalized.includes('post type')) {
            return { tabId: 'tab-filters', focusSelector: '#opt_filters_hideVideoPosts' };
        }
        if (normalized.includes('ragebait') || normalized.includes('clickbait')) {
            return { tabId: 'tab-wellbeing', focusSelector: '#opt_wb_ragebait' };
        }
        if (normalized.includes('topbar') || normalized.includes('sidebar') || normalized.includes('nav')) {
            return { tabId: 'tab-filters', focusSelector: '#opt_topbar_enabled' };
        }
        if (normalized.includes('keyword')) {
            return { tabId: 'tab-keywords', focusSelector: '#opt_keywords_blocklist' };
        }

        return { tabId: 'tab-filters', focusSelector: '' };
    }

    _buildReasonSettingsActionHtml(reason) {
        const route = this._resolveReasonSettingsRoute(reason);
        if (!route || !route.tabId) return '';

        const btnLabel = this._escapeHtml(this._t('wellbeing_report_reason_open_settings', 'Open related settings'));
        const tabAttr = this._escapeAttr(route.tabId);
        const focusAttr = this._escapeAttr(route.focusSelector || '');

        return ` <button type="button" class="pf-frp-top-reason-btn" data-pf-action="open-related-settings" data-pf-tab="${tabAttr}" data-pf-focus="${focusAttr}">${btnLabel}</button>`;
    }

    _formatDayShortLabel(dayKey) {
        const parsed = new Date(`${String(dayKey || '')}T00:00:00`);
        if (!Number.isFinite(parsed.getTime())) return '--';

        const day = String(parsed.getDate()).padStart(2, '0');
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        return `${month}/${day}`;
    }

    _panelRow(labelKey, fallbackLabel, value) {
        return `
            <div class="pf-frp-row">
                <div class="pf-frp-key">${this._escapeHtml(this._t(labelKey, fallbackLabel))}</div>
                <div class="pf-frp-val">${this._escapeHtml(String(value))}</div>
            </div>
        `;
    }

    _escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    _escapeAttr(value) {
        return this._escapeHtml(value).replace(/`/g, '&#96;');
    }

    /**
     * Called by the main node loop to count rendering volume
     * @returns {boolean} Returns TRUE if the Observer should STOP processing new nodes
     */
    applyScrollStopper(nodes) {
        if (!this.settings.wellbeing.infiniteScrollStopper || this.isPaused) return false;

        // Count how many literal feed articles have passed through and rendered safely
        nodes.forEach(n => {
            if (n.matches && n.matches(PF_SELECTOR_MAP.postContainer)) {
                this.scrollCount++;
            } else if (n.querySelector) {
                const inner = n.querySelectorAll(PF_SELECTOR_MAP.postContainer);
                this.scrollCount += inner.length;
            }
        });

        if (this.scrollCount >= this.settings.wellbeing.scrollLimitPosts) {
            this._triggerBreak();
            return true; // Tells the pipeline to drop the batch
        }

        return false;
    }

    _triggerBreak() {
        this.isPaused = true;
        
        // Find the bottom of the feed and inject a massive break wall
        const feed = document.querySelector(PF_SELECTOR_MAP.mainFeedRegion);
        if (!feed) return;

        const breakWall = document.createElement('div');
        breakWall.id = 'pf-scroll-stopper';
        const breakTitle = this._t('wellbeing_break_title', 'Take a Breath');
        const breakMessage = this._t(
            'wellbeing_break_body_template',
            `You've just scrolled past <strong>${this.scrollCount}</strong> posts. PureFusion has temporarily paused the feed to help you avoid doom-scrolling. Is it time to do something else?`,
            [`<strong>${this.scrollCount}</strong>`]
        );
        const resumeLabel = this._t('wellbeing_break_resume_btn', 'Continue Scrolling Anyway');
        breakWall.style.cssText = `
            margin: 40px auto; padding: 40px 20px; text-align: center;
            background: linear-gradient(135deg, rgba(20,20,21,1) 0%, rgba(30,30,32,1) 100%);
            border: 2px solid #ff4444; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            color: white; max-width: 600px; font-family: -apple-system, system-ui, sans-serif;
        `;
        breakWall.innerHTML = `
            <div style="font-size: 32px; margin-bottom: 10px;">🛑 ${breakTitle}</div>
            <p style="color: #B0B3B8; font-size: 16px; margin-bottom: 20px;">
                ${breakMessage}
            </p>
            <button id="pf-btn-resume" style="
                background: #6C3FC5; color: white; border: none; padding: 12px 24px;
                font-size: 14px; font-weight: bold; border-radius: 8px; cursor: pointer;
                transition: background 0.2s;
            ">${resumeLabel}</button>
        `;

        feed.appendChild(breakWall);
        
        // Hide Facebook's native loading spinner aggressively so it doesn't try pushing content down anyway
        const styleBlock = document.createElement('style');
        styleBlock.id = 'pf-stopper-css';
        styleBlock.textContent = `[role="progressbar"] { display: none !important; }`;
        document.head.appendChild(styleBlock);

        // Resume functionality
        breakWall.querySelector('#pf-btn-resume').addEventListener('click', () => {
            breakWall.remove();
            document.getElementById('pf-stopper-css')?.remove();
            
            // Reset count and unpause
            this.scrollCount = 0;
            this.isPaused = false;
            PF_Logger.info("PF_Wellbeing: User bypassed scroll stopper.");
        });

        PF_Logger.info(`PF_Wellbeing: Scroll stopper hit at ${this.scrollCount} posts`);
    }

    _injectSessionTimer() {
        const existing = document.getElementById('pf-session-timer');
        if (existing) {
            this._syncSessionTimerReportButton(existing);
            return;
        }

        const timerEl = document.createElement('div');
        timerEl.id = 'pf-session-timer';
        timerEl.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 9999;
            background: rgba(20, 20, 21, 0.85); backdrop-filter: blur(8px);
            border: 1px solid #3E4042; border-radius: 20px; padding: 8px 16px;
            color: #E4E6EB; font-family: monospace; font-size: 13px; font-weight: bold;
            display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            pointer-events: auto;
        `;
        
        const dot = document.createElement('div');
        dot.style.cssText = `width: 8px; height: 8px; border-radius: 50%; background: #00D4FF; box-shadow: 0 0 8px #00D4FF;`;
        
        const timeText = document.createElement('span');
        const sessionLabel = this._t('wellbeing_session_timer_prefix', 'Session');
        timeText.textContent = `${sessionLabel}: 00:00`;

        timerEl.appendChild(dot);
        timerEl.appendChild(timeText);
        this._syncSessionTimerReportButton(timerEl);
        document.body.appendChild(timerEl);

        this.timerIntervalId = setInterval(() => {
            if (document.hidden) return;

            const elapsed = Math.floor((Date.now() - this.sessionStart) / 1000);
            const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const s = (elapsed % 60).toString().padStart(2, '0');
            timeText.textContent = `${sessionLabel}: ${m}:${s}`;
            
            // Turn color to warning orange after 15 mins
            if (elapsed > 900) {
                dot.style.background = '#ffaa00';
                dot.style.boxShadow = '0 0 8px #ffaa00';
            }
            // Turn color to danger red after 30 mins
            if (elapsed > 1800) {
                dot.style.background = '#ff4444';
                dot.style.boxShadow = '0 0 8px #ff4444';
            }
        }, 1000);
    }

    _removeSessionTimer() {
        document.getElementById('pf-session-timer')?.remove();
        if (this.timerIntervalId) {
            clearInterval(this.timerIntervalId);
            this.timerIntervalId = null;
        }
    }

    _syncSessionTimerReportButton(timerEl) {
        if (!timerEl) return;

        let reportBtn = timerEl.querySelector('#pf-session-report-btn');
        let weeklyBtn = timerEl.querySelector('#pf-session-weekly-report-btn');
        if (this.settings?.wellbeing?.dailyFeedReportEnabled) {
            if (!reportBtn) {
                reportBtn = document.createElement('button');
                reportBtn.id = 'pf-session-report-btn';
                reportBtn.type = 'button';
                reportBtn.textContent = this._t('wellbeing_report_button', 'Report');
                reportBtn.style.cssText = `
                    border: 1px solid rgba(0, 212, 255, 0.5);
                    background: rgba(0, 212, 255, 0.12);
                    color: #9fefff;
                    border-radius: 999px;
                    padding: 2px 8px;
                    font: 700 11px/1.2 "Segoe UI", sans-serif;
                    cursor: pointer;
                `;
                reportBtn.addEventListener('click', () => {
                    this._openFeedReportPanel('daily');
                });
                timerEl.appendChild(reportBtn);
            }

            if (!weeklyBtn) {
                weeklyBtn = document.createElement('button');
                weeklyBtn.id = 'pf-session-weekly-report-btn';
                weeklyBtn.type = 'button';
                weeklyBtn.textContent = this._t('wellbeing_weekly_report_button', 'Week');
                weeklyBtn.style.cssText = `
                    border: 1px solid rgba(162, 255, 196, 0.5);
                    background: rgba(58, 166, 93, 0.14);
                    color: #b9ffcf;
                    border-radius: 999px;
                    padding: 2px 8px;
                    font: 700 11px/1.2 "Segoe UI", sans-serif;
                    cursor: pointer;
                `;
                weeklyBtn.addEventListener('click', () => {
                    this._openFeedReportPanel('weekly');
                });
                timerEl.appendChild(weeklyBtn);
            }

            return;
        }

        if (reportBtn) reportBtn.remove();
        if (weeklyBtn) weeklyBtn.remove();
    }
}

window.PF_Wellbeing = PF_Wellbeing;
