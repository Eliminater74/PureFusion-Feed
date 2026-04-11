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
        this.lastSessionAwarenessPromptAt = 0;
        this.hiddenReasonCounts = new Map();
        this.reelsHiddenCount = 0;
        this.scrollPulseTimestamps = [];
        this.sessionAwarenessListenerAttached = false;
        this.boundHiddenHandler = this._onElementHidden.bind(this);
        this.boundReportShortcutHandler = this._onReportShortcut.bind(this);
        this.boundWeeklyReportShortcutHandler = this._onWeeklyReportShortcut.bind(this);
        this.boundReportRequestHandler = this._onReportRequest.bind(this);
        this.boundWeeklyReportRequestHandler = this._onWeeklyReportRequest.bind(this);
        this.boundSessionAwarenessScrollHandler = this._onSessionAwarenessScroll.bind(this);

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
    }

    _onReportShortcut(event) {
        if (!event || event.defaultPrevented) return;
        if (!event.altKey || !event.shiftKey) return;
        if (String(event.key || '').toLowerCase() !== 'r') return;

        if (this._isEditableContext()) return;

        event.preventDefault();
        this._showFeedReportToast('manual');
    }

    _onWeeklyReportShortcut(event) {
        if (!event || event.defaultPrevented) return;
        if (!event.altKey || !event.shiftKey) return;
        if (String(event.key || '').toLowerCase() !== 'w') return;

        if (this._isEditableContext()) return;

        event.preventDefault();
        this._showWeeklyFeedReportToast('manual');
    }

    _onReportRequest() {
        this._showFeedReportToast('manual');
    }

    _onWeeklyReportRequest() {
        this._showWeeklyFeedReportToast('manual');
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
        const cutoff = now - (7 * 24 * 60 * 60 * 1000);
        const aggregateReasons = new Map();

        let hiddenTotal = 0;
        let reelsHidden = 0;
        let savedSeconds = 0;

        Object.entries(days).forEach(([dayKey, bucket]) => {
            if (!bucket || typeof bucket !== 'object') return;

            const dayStart = new Date(`${dayKey}T00:00:00`).getTime();
            if (!Number.isFinite(dayStart) || dayStart < cutoff) return;

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

        return {
            hiddenTotal,
            reelsHidden,
            topReason,
            estimatedMinutesSaved
        };
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
                    this._showFeedReportToast('manual');
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
                    this._showWeeklyFeedReportToast('manual');
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
