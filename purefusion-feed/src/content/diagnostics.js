/**
 * PureFusion Feed - Diagnostics Overlay
 *
 * Optional developer/user debugging panel showing what rules are actively
 * hiding content in the current session.
 */

class PF_Diagnostics {
    constructor(settings) {
        this.settings = settings;
        this.overlay = null;
        this.hiddenTotal = 0;
        this.reasonCounts = new Map();
        this.liveResweepTotal = 0;
        this.liveResweepFollowups = 0;
        this.lastResweepAt = 0;
        this.settingsUpdateCount = 0;
        this.lastSettingsUpdateAt = 0;
        this.observerBatchCount = 0;
        this.observerNodesTotal = 0;
        this.observerDispatchedTotal = 0;
        this.observerDroppedTotal = 0;
        this.observerMutationTotal = 0;
        this.observerDurationTotal = 0;
        this.observerDurationPeak = 0;
        this.lastObserverBatch = null;
        this.pipelineBatchCount = 0;
        this.pipelineNodesReceivedTotal = 0;
        this.pipelineNodesDispatchedTotal = 0;
        this.pipelineNodesTrimmedTotal = 0;
        this.lastPipelineBatch = null;
        this.pipelineBudgetDeferrals = 0;
        this.pipelineBudgetDeferredProcessorsTotal = 0;
        this.lastPipelineBudgetDeferral = null;
        this.observerBatchTimestamps = [];
        this.observerSpikeHistory = [];
        this.observerSpikeHistoryLimit = 10;
        this.observerTrendHistory = [];
        this.observerTrendHistoryLimit = 36;
        this.reportActionTotal = 0;
        this.reportActionCounts = new Map();
        this.lastReportActionAt = 0;
        this.lastReportActionLabel = '';
        this.overlayPosition = null;
        this.overlayPositionStorageKey = 'pf_diag_overlay_position_v1';
        this.dragState = null;
        this.boundHiddenHandler = this._onElementHidden.bind(this);
        this.boundResweepHandler = this._onResweepPass.bind(this);
        this.boundSettingsUpdateHandler = this._onSettingsUpdate.bind(this);
        this.boundObserverBatchHandler = this._onObserverBatch.bind(this);
        this.boundPipelineBatchHandler = this._onPipelineBatch.bind(this);
        this.boundPipelineBudgetHandler = this._onPipelineBudget.bind(this);
        this.boundReportActionHandler = this._onWellbeingReportAction.bind(this);
        this.boundDragStartHandler = this._onDragStart.bind(this);
        this.boundDragMoveHandler = this._onDragMove.bind(this);
        this.boundDragEndHandler = this._onDragEnd.bind(this);
        this.boundWindowResizeHandler = this._onWindowResize.bind(this);

        window.addEventListener('pf:element_hidden', this.boundHiddenHandler);
        window.addEventListener('pf:resweep_pass', this.boundResweepHandler);
        window.addEventListener('pf:settings_update', this.boundSettingsUpdateHandler);
        window.addEventListener('pf:observer_batch', this.boundObserverBatchHandler);
        window.addEventListener('pf:pipeline_batch', this.boundPipelineBatchHandler);
        window.addEventListener('pf:pipeline_budget', this.boundPipelineBudgetHandler);
        window.addEventListener('pf:wellbeing_report_action', this.boundReportActionHandler);
        window.addEventListener('resize', this.boundWindowResizeHandler);
        void this._loadSavedOverlayPosition();
        this._syncOverlayState();
    }

    updateSettings(settings) {
        this.settings = settings;
        this._syncOverlayState();
    }

    applyDocumentLevelTweaks() {
        this._syncOverlayState();
        this._render();
    }

    applyToNodes() {
        this._render();
    }

    _onElementHidden(event) {
        if (!this._isEnabled()) return;

        const reason = String(event?.detail?.reason || 'Unknown reason');
        this.hiddenTotal += 1;
        this.reasonCounts.set(reason, (this.reasonCounts.get(reason) || 0) + 1);

        if (this.settings?.diagnostics?.verboseConsole) {
            PF_Logger.log(`[Diagnostics] Hidden: ${reason}`);
        }

        this._render();
    }

    _onResweepPass(event) {
        if (!this._isEnabled()) return;

        const phase = String(event?.detail?.phase || 'unknown-pass');
        this.liveResweepTotal += 1;
        if (phase.includes('followup')) {
            this.liveResweepFollowups += 1;
        }
        this.lastResweepAt = Date.now();

        if (this.settings?.diagnostics?.verboseConsole) {
            PF_Logger.log(`[Diagnostics] Resweep pass: ${phase}`);
        }

        this._render();
    }

    _onSettingsUpdate(event) {
        if (!this._isEnabled()) return;

        const source = String(event?.detail?.source || 'unknown-source');
        this.settingsUpdateCount += 1;
        this.lastSettingsUpdateAt = Date.now();

        if (this.settings?.diagnostics?.verboseConsole) {
            PF_Logger.log(`[Diagnostics] Settings sync: ${source}`);
        }

        this._render();
    }

    _onObserverBatch(event) {
        if (!this._isEnabled()) return;

        const nodes = Math.max(0, Number(event?.detail?.nodes || 0));
        const dispatchedNodes = Math.max(0, Number(event?.detail?.dispatchedNodes || nodes));
        const droppedNodes = Math.max(0, Number(event?.detail?.droppedNodes || 0));
        const mutationRecords = Math.max(0, Number(event?.detail?.mutationRecords || 0));
        const durationMs = Math.max(0, Number(event?.detail?.durationMs || 0));
        const thresholds = this._getObserverThresholds();

        this.observerBatchCount += 1;
        this.observerNodesTotal += nodes;
        this.observerDispatchedTotal += dispatchedNodes;
        this.observerDroppedTotal += droppedNodes;
        this.observerMutationTotal += mutationRecords;
        this.observerDurationTotal += durationMs;
        this.observerDurationPeak = Math.max(this.observerDurationPeak, durationMs);
        this.lastObserverBatch = {
            nodes,
            dispatchedNodes,
            droppedNodes,
            mutationRecords,
            durationMs,
            ts: Date.now()
        };

        this.observerBatchTimestamps.push(this.lastObserverBatch.ts);
        this._pruneObserverBatchTimestamps(this.lastObserverBatch.ts);

        const severity = this._classifyObserverSeverity(durationMs, nodes, mutationRecords, thresholds);
        if (severity !== 'ok') {
            this.observerSpikeHistory.unshift({
                nodes,
                mutationRecords,
                durationMs,
                ts: this.lastObserverBatch.ts,
                severity
            });

            if (this.observerSpikeHistory.length > this.observerSpikeHistoryLimit) {
                this.observerSpikeHistory.length = this.observerSpikeHistoryLimit;
            }
        }

        this.observerTrendHistory.push({
            nodes,
            mutationRecords,
            durationMs,
            ts: this.lastObserverBatch.ts,
            severity,
            score: this._calculateObserverTrendScore(durationMs, nodes, mutationRecords, thresholds)
        });

        if (this.observerTrendHistory.length > this.observerTrendHistoryLimit) {
            this.observerTrendHistory.splice(0, this.observerTrendHistory.length - this.observerTrendHistoryLimit);
        }

        if (this.settings?.diagnostics?.verboseConsole) {
            PF_Logger.log(`[Diagnostics] Observer batch: ${nodes} in, ${dispatchedNodes} out, ${droppedNodes} trimmed, ${mutationRecords} records, ${durationMs.toFixed(2)}ms (${severity})`);
        }

        this._render();
    }

    _onPipelineBatch(event) {
        if (!this._isEnabled()) return;

        const receivedNodes = Math.max(0, Number(event?.detail?.receivedNodes || 0));
        const dispatchedNodes = Math.max(0, Number(event?.detail?.dispatchedNodes || 0));
        const trimmedNodes = Math.max(0, Number(event?.detail?.trimmedNodes || 0));

        this.pipelineBatchCount += 1;
        this.pipelineNodesReceivedTotal += receivedNodes;
        this.pipelineNodesDispatchedTotal += dispatchedNodes;
        this.pipelineNodesTrimmedTotal += trimmedNodes;
        this.lastPipelineBatch = {
            receivedNodes,
            dispatchedNodes,
            trimmedNodes,
            ts: Date.now()
        };

        if (this.settings?.diagnostics?.verboseConsole) {
            PF_Logger.log(`[Diagnostics] Pipeline batch: ${receivedNodes} in, ${dispatchedNodes} out, ${trimmedNodes} trimmed`);
        }

        this._render();
    }

    _onPipelineBudget(event) {
        if (!this._isEnabled()) return;

        const nodes = Math.max(0, Number(event?.detail?.nodes || 0));
        const budgetMs = Math.max(0, Number(event?.detail?.budgetMs || 0));
        const elapsedMs = Math.max(0, Number(event?.detail?.elapsedMs || 0));
        const remainingProcessors = Math.max(0, Number(event?.detail?.remainingProcessors || 0));
        const deferredFrom = String(event?.detail?.deferredFrom || 'unknown');

        this.pipelineBudgetDeferrals += 1;
        this.pipelineBudgetDeferredProcessorsTotal += remainingProcessors;
        this.lastPipelineBudgetDeferral = {
            nodes,
            budgetMs,
            elapsedMs,
            remainingProcessors,
            deferredFrom,
            ts: Date.now()
        };

        if (this.settings?.diagnostics?.verboseConsole) {
            PF_Logger.log(`[Diagnostics] Pipeline budget deferral: ${nodes} nodes, ${elapsedMs.toFixed(2)}ms/${budgetMs}ms, +${remainingProcessors} processors after ${deferredFrom}`);
        }

        this._render();
    }

    _onWellbeingReportAction(event) {
        if (!this._isEnabled()) return;

        const action = String(event?.detail?.action || 'unknown_action').trim() || 'unknown_action';
        const tab = String(event?.detail?.tab || '').trim().toLowerCase();
        const settingsTab = String(event?.detail?.settingsTab || '').trim().toLowerCase();

        let routeLabel = action;
        if (tab) routeLabel += ` [${tab}]`;
        if (settingsTab) routeLabel += ` -> ${settingsTab}`;

        this.reportActionTotal += 1;
        this.reportActionCounts.set(routeLabel, (this.reportActionCounts.get(routeLabel) || 0) + 1);
        this.lastReportActionAt = Date.now();
        this.lastReportActionLabel = routeLabel;

        if (this.settings?.diagnostics?.verboseConsole) {
            PF_Logger.log(`[Diagnostics] Wellbeing action: ${routeLabel}`);
        }

        this._render();
    }

    _isEnabled() {
        return !!this.settings?.diagnostics?.enabled;
    }

    _isCompactOverlayEnabled() {
        return !!this.settings?.diagnostics?.compactOverlay;
    }

    _syncOverlayState() {
        if (!this._isEnabled() || !this.settings?.diagnostics?.showOverlay) {
            this._removeOverlay();
            return;
        }

        this._ensureOverlay();
        this._applyOverlayModeClass();
        this._applyOverlayPosition();
    }

    _ensureOverlay() {
        if (this.overlay && document.contains(this.overlay)) return;
        this._injectStyles();

        this.overlay = document.createElement('aside');
        this.overlay.id = 'pf-diagnostics-overlay';
        this.overlay.innerHTML = `
            <div class="pf-diag-title">PureFusion Diagnostics</div>
            <div class="pf-diag-total">Hidden this session: <strong id="pfDiagTotal">0</strong></div>
            <div class="pf-diag-meta">
                <div>Settings syncs: <strong id="pfDiagSettingsSyncs">0</strong></div>
                <div>Live resweeps: <strong id="pfDiagResweeps">0</strong> (<span id="pfDiagResweepFollowups">0</span> follow-up)</div>
                <div>Last sync: <span id="pfDiagLastSync">-</span></div>
                <div>Last resweep: <span id="pfDiagLastResweep">-</span></div>
            </div>
            <div class="pf-diag-subtitle">Observer workload</div>
            <div class="pf-diag-meta">
                <div>Batches: <strong id="pfDiagObserverBatches">0</strong></div>
                <div>Rate (1m): <strong id="pfDiagObserverRate">0/min</strong></div>
                <div>Nodes seen: <strong id="pfDiagObserverNodes">0</strong></div>
                <div>Nodes dispatched: <strong id="pfDiagObserverDispatched">0</strong></div>
                <div>Nodes trimmed: <strong id="pfDiagObserverDropped">0</strong></div>
                <div>Records seen: <strong id="pfDiagObserverRecords">0</strong></div>
                <div>Avg/Peak batch: <strong id="pfDiagObserverAvgMs">0.00ms</strong> / <strong id="pfDiagObserverPeakMs">0.00ms</strong></div>
                <div>Last batch: <span id="pfDiagObserverLastBatch">-</span></div>
            </div>
            <div id="pfDiagObserverThresholds" class="pf-diag-thresholds">Warn if batch >= 25ms, 220 nodes, or 120 records.</div>
            <div class="pf-diag-subtitle">Pipeline fan-out</div>
            <div class="pf-diag-meta">
                <div>Batches: <strong id="pfDiagPipelineBatches">0</strong></div>
                <div>Nodes received: <strong id="pfDiagPipelineReceived">0</strong></div>
                <div>Nodes dispatched: <strong id="pfDiagPipelineDispatched">0</strong></div>
                <div>Nodes trimmed: <strong id="pfDiagPipelineTrimmed">0</strong></div>
                <div>Trim ratio: <strong id="pfDiagPipelineTrimRatio">0.0%</strong></div>
                <div>Last batch: <span id="pfDiagPipelineLastBatch">-</span></div>
                <div>Budget deferrals: <strong id="pfDiagPipelineBudgetDeferrals">0</strong></div>
                <div>Deferred processors: <strong id="pfDiagPipelineBudgetDeferredProcessors">0</strong></div>
                <div>Last deferral: <span id="pfDiagPipelineBudgetLast">-</span></div>
            </div>
            <div class="pf-diag-subtitle">Performance guidance</div>
            <div class="pf-diag-meta">
                <div>Status: <strong id="pfDiagPerfGuidanceStatus">Stable</strong></div>
                <div id="pfDiagPerfGuidanceText">Pipeline load is currently stable.</div>
                <button id="pfDiagPerfGuidanceBtn" type="button" class="pf-diag-inline-btn">Open Ultra Fast Mode settings</button>
            </div>
            <div class="pf-diag-subtitle">Wellbeing report actions</div>
            <div class="pf-diag-meta">
                <div>Total actions: <strong id="pfDiagReportActionsTotal">0</strong></div>
                <div>Last action: <span id="pfDiagReportActionsLast">-</span></div>
            </div>
            <ol id="pfDiagReportActionsTop" class="pf-diag-list"></ol>
            <div class="pf-diag-subtitle">Observer trend</div>
            <div class="pf-diag-trend">
                <svg id="pfDiagObserverTrend" viewBox="0 0 228 56" preserveAspectRatio="none" aria-hidden="true"></svg>
                <div id="pfDiagObserverTrendMeta" class="pf-diag-trend-meta">Waiting for observer batches...</div>
            </div>
            <div class="pf-diag-subtitle">Recent observer spikes</div>
            <ul id="pfDiagObserverSpikes" class="pf-diag-spike-list"></ul>
            <div class="pf-diag-subtitle">Top hide reasons</div>
            <ol id="pfDiagReasons" class="pf-diag-list"></ol>
            <div class="pf-diag-actions">
                <button id="pfDiagResetPositionBtn" type="button">Reset overlay position</button>
                <button id="pfDiagClearObserverBtn" type="button">Clear observer history</button>
                <button id="pfDiagResetBtn" type="button">Reset all counters</button>
                <button id="pfDiagCopyBtn" type="button">Copy snapshot JSON</button>
                <button id="pfDiagExportBtn" type="button">Export snapshot</button>
            </div>
        `;

        const exportBtn = this.overlay.querySelector('#pfDiagExportBtn');
        const resetBtn = this.overlay.querySelector('#pfDiagResetBtn');
        const clearObserverBtn = this.overlay.querySelector('#pfDiagClearObserverBtn');
        const copyBtn = this.overlay.querySelector('#pfDiagCopyBtn');
        const resetPositionBtn = this.overlay.querySelector('#pfDiagResetPositionBtn');
        const perfGuidanceBtn = this.overlay.querySelector('#pfDiagPerfGuidanceBtn');
        const titleEl = this.overlay.querySelector('.pf-diag-title');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this._exportSnapshot();
            });
        }

        if (clearObserverBtn) {
            clearObserverBtn.addEventListener('click', () => {
                this._clearObserverHistory();
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this._resetAllDiagnosticsData();
            });
        }

        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                void this._copySnapshotToClipboard();
            });
        }

        if (resetPositionBtn) {
            resetPositionBtn.addEventListener('click', () => {
                void this._resetOverlayPosition();
            });
        }

        if (perfGuidanceBtn) {
            perfGuidanceBtn.addEventListener('click', () => {
                window.dispatchEvent(new CustomEvent('pf:open_advanced_settings', {
                    detail: {
                        tabId: 'tab-filters',
                        focusSelector: '#opt_experience_mode'
                    }
                }));

                if (window.PF_Helpers && typeof window.PF_Helpers.showToast === 'function') {
                    window.PF_Helpers.showToast('Opened mode settings. Try Ultra Fast Mode for heavy sessions.', 'info');
                }
            });
        }

        if (titleEl) {
            titleEl.addEventListener('pointerdown', this.boundDragStartHandler);
        }

        document.body.appendChild(this.overlay);
        this._applyOverlayPosition();
    }

    _removeOverlay() {
        if (!this.overlay) return;
        this._cleanupDragListeners();
        if (this.overlay.remove) this.overlay.remove();
        this.overlay = null;
    }

    _applyOverlayModeClass() {
        if (!this.overlay) return;

        if (this._isCompactOverlayEnabled()) {
            this.overlay.classList.add('pf-diag-compact');
        } else {
            this.overlay.classList.remove('pf-diag-compact');
        }
    }

    _render() {
        if (!this.overlay || !document.contains(this.overlay)) return;

        this._applyOverlayModeClass();
        this._applyOverlayPosition();

        const totalEl = this.overlay.querySelector('#pfDiagTotal');
        const listEl = this.overlay.querySelector('#pfDiagReasons');
        const syncEl = this.overlay.querySelector('#pfDiagSettingsSyncs');
        const resweepEl = this.overlay.querySelector('#pfDiagResweeps');
        const followupsEl = this.overlay.querySelector('#pfDiagResweepFollowups');
        const lastSyncEl = this.overlay.querySelector('#pfDiagLastSync');
        const lastResweepEl = this.overlay.querySelector('#pfDiagLastResweep');
        const observerBatchesEl = this.overlay.querySelector('#pfDiagObserverBatches');
        const observerRateEl = this.overlay.querySelector('#pfDiagObserverRate');
        const observerNodesEl = this.overlay.querySelector('#pfDiagObserverNodes');
        const observerDispatchedEl = this.overlay.querySelector('#pfDiagObserverDispatched');
        const observerDroppedEl = this.overlay.querySelector('#pfDiagObserverDropped');
        const observerRecordsEl = this.overlay.querySelector('#pfDiagObserverRecords');
        const observerAvgMsEl = this.overlay.querySelector('#pfDiagObserverAvgMs');
        const observerPeakMsEl = this.overlay.querySelector('#pfDiagObserverPeakMs');
        const observerLastBatchEl = this.overlay.querySelector('#pfDiagObserverLastBatch');
        const observerSpikesEl = this.overlay.querySelector('#pfDiagObserverSpikes');
        const observerThresholdsEl = this.overlay.querySelector('#pfDiagObserverThresholds');
        const pipelineBatchesEl = this.overlay.querySelector('#pfDiagPipelineBatches');
        const pipelineReceivedEl = this.overlay.querySelector('#pfDiagPipelineReceived');
        const pipelineDispatchedEl = this.overlay.querySelector('#pfDiagPipelineDispatched');
        const pipelineTrimmedEl = this.overlay.querySelector('#pfDiagPipelineTrimmed');
        const pipelineTrimRatioEl = this.overlay.querySelector('#pfDiagPipelineTrimRatio');
        const pipelineLastBatchEl = this.overlay.querySelector('#pfDiagPipelineLastBatch');
        const pipelineBudgetDeferralsEl = this.overlay.querySelector('#pfDiagPipelineBudgetDeferrals');
        const pipelineBudgetDeferredProcessorsEl = this.overlay.querySelector('#pfDiagPipelineBudgetDeferredProcessors');
        const pipelineBudgetLastEl = this.overlay.querySelector('#pfDiagPipelineBudgetLast');
        const perfGuidanceStatusEl = this.overlay.querySelector('#pfDiagPerfGuidanceStatus');
        const perfGuidanceTextEl = this.overlay.querySelector('#pfDiagPerfGuidanceText');
        const perfGuidanceBtnEl = this.overlay.querySelector('#pfDiagPerfGuidanceBtn');
        const reportActionsTotalEl = this.overlay.querySelector('#pfDiagReportActionsTotal');
        const reportActionsLastEl = this.overlay.querySelector('#pfDiagReportActionsLast');
        const reportActionsTopEl = this.overlay.querySelector('#pfDiagReportActionsTop');
        const observerTrendEl = this.overlay.querySelector('#pfDiagObserverTrend');
        const observerTrendMetaEl = this.overlay.querySelector('#pfDiagObserverTrendMeta');
        if (!totalEl || !listEl || !syncEl || !resweepEl || !followupsEl || !lastSyncEl || !lastResweepEl || !observerBatchesEl || !observerRateEl || !observerNodesEl || !observerDispatchedEl || !observerDroppedEl || !observerRecordsEl || !observerAvgMsEl || !observerPeakMsEl || !observerLastBatchEl || !observerSpikesEl || !observerThresholdsEl || !pipelineBatchesEl || !pipelineReceivedEl || !pipelineDispatchedEl || !pipelineTrimmedEl || !pipelineTrimRatioEl || !pipelineLastBatchEl || !pipelineBudgetDeferralsEl || !pipelineBudgetDeferredProcessorsEl || !pipelineBudgetLastEl || !perfGuidanceStatusEl || !perfGuidanceTextEl || !perfGuidanceBtnEl || !reportActionsTotalEl || !reportActionsLastEl || !reportActionsTopEl || !observerTrendEl || !observerTrendMetaEl) return;

        const thresholds = this._getObserverThresholds();

        totalEl.textContent = String(this.hiddenTotal);
        syncEl.textContent = String(this.settingsUpdateCount);
        resweepEl.textContent = String(this.liveResweepTotal);
        followupsEl.textContent = String(this.liveResweepFollowups);
        lastSyncEl.textContent = this._formatTime(this.lastSettingsUpdateAt);
        lastResweepEl.textContent = this._formatTime(this.lastResweepAt);
        observerBatchesEl.textContent = String(this.observerBatchCount);
        const ratePerMinute = this._getObserverBatchRatePerMinute();
        observerRateEl.textContent = `${ratePerMinute}/min`;
        observerRateEl.className = this._severityClassName(this._classifyObserverRateSeverity(ratePerMinute));
        observerNodesEl.textContent = String(this.observerNodesTotal);
        observerDispatchedEl.textContent = String(this.observerDispatchedTotal);
        observerDroppedEl.textContent = String(this.observerDroppedTotal);
        observerRecordsEl.textContent = String(this.observerMutationTotal);

        const observerDroppedRatio = this.observerNodesTotal > 0
            ? (this.observerDroppedTotal / this.observerNodesTotal) * 100
            : 0;
        observerDroppedEl.className = this._severityClassName(
            observerDroppedRatio >= 40 ? 'severe' : (observerDroppedRatio >= 15 ? 'warn' : 'ok')
        );

        const avgMs = this.observerBatchCount > 0
            ? this.observerDurationTotal / this.observerBatchCount
            : 0;
        observerAvgMsEl.textContent = `${avgMs.toFixed(2)}ms`;
        observerPeakMsEl.textContent = `${this.observerDurationPeak.toFixed(2)}ms`;
        observerAvgMsEl.className = this._severityClassName(this._classifyObserverSeverity(avgMs, 0, 0, thresholds));
        observerPeakMsEl.className = this._severityClassName(this._classifyObserverSeverity(this.observerDurationPeak, 0, 0, thresholds));

        observerThresholdsEl.textContent = `Warn if batch >= ${thresholds.warnDurationMs}ms, ${thresholds.warnNodes} nodes, or ${thresholds.warnRecords} records.`;

        pipelineBatchesEl.textContent = String(this.pipelineBatchCount);
        pipelineReceivedEl.textContent = String(this.pipelineNodesReceivedTotal);
        pipelineDispatchedEl.textContent = String(this.pipelineNodesDispatchedTotal);
        pipelineTrimmedEl.textContent = String(this.pipelineNodesTrimmedTotal);

        const pipelineTrimRatio = this.pipelineNodesReceivedTotal > 0
            ? (this.pipelineNodesTrimmedTotal / this.pipelineNodesReceivedTotal) * 100
            : 0;
        pipelineTrimRatioEl.textContent = `${pipelineTrimRatio.toFixed(1)}%`;
        pipelineTrimRatioEl.className = this._severityClassName(
            pipelineTrimRatio >= 45 ? 'severe' : (pipelineTrimRatio >= 20 ? 'warn' : 'ok')
        );

        if (!this.lastPipelineBatch) {
            pipelineLastBatchEl.textContent = '-';
            pipelineLastBatchEl.className = '';
        } else {
            pipelineLastBatchEl.textContent = `${this.lastPipelineBatch.receivedNodes} in, ${this.lastPipelineBatch.dispatchedNodes} out, ${this.lastPipelineBatch.trimmedNodes} trimmed @ ${this._formatTime(this.lastPipelineBatch.ts)}`;
            const lastTrimRatio = this.lastPipelineBatch.receivedNodes > 0
                ? (this.lastPipelineBatch.trimmedNodes / this.lastPipelineBatch.receivedNodes) * 100
                : 0;
            pipelineLastBatchEl.className = this._severityClassName(
                lastTrimRatio >= 45 ? 'severe' : (lastTrimRatio >= 20 ? 'warn' : 'ok')
            );
        }

        pipelineBudgetDeferralsEl.textContent = String(this.pipelineBudgetDeferrals);
        pipelineBudgetDeferredProcessorsEl.textContent = String(this.pipelineBudgetDeferredProcessorsTotal);

        if (!this.lastPipelineBudgetDeferral) {
            pipelineBudgetLastEl.textContent = '-';
            pipelineBudgetLastEl.className = '';
        } else {
            const entry = this.lastPipelineBudgetDeferral;
            pipelineBudgetLastEl.textContent = `${entry.nodes} nodes, ${entry.elapsedMs.toFixed(2)}ms/${entry.budgetMs}ms, +${entry.remainingProcessors} after ${entry.deferredFrom} @ ${this._formatTime(entry.ts)}`;
            pipelineBudgetLastEl.className = this._severityClassName(entry.remainingProcessors >= 4 ? 'warn' : 'ok');
        }

        const perfGuidance = this._computePerformanceGuidance();
        perfGuidanceStatusEl.textContent = perfGuidance.label;
        perfGuidanceStatusEl.className = this._severityClassName(perfGuidance.severity);
        perfGuidanceTextEl.textContent = perfGuidance.message;
        perfGuidanceTextEl.className = this._severityClassName(perfGuidance.severity);
        perfGuidanceBtnEl.style.display = perfGuidance.showUltraFastButton ? 'inline-flex' : 'none';

        reportActionsTotalEl.textContent = String(this.reportActionTotal);
        reportActionsLastEl.textContent = this.lastReportActionAt
            ? `${this.lastReportActionLabel} @ ${this._formatTime(this.lastReportActionAt)}`
            : '-';

        const topActions = Array.from(this.reportActionCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, this._isCompactOverlayEnabled() ? 3 : 5);

        reportActionsTopEl.innerHTML = topActions.length
            ? topActions.map(([label, count]) => `<li><span>${this._escapeHtml(label)}</span><strong>${count}</strong></li>`).join('')
            : '<li><span>No wellbeing report actions yet.</span><strong>0</strong></li>';

        this._renderObserverTrend(observerTrendEl, observerTrendMetaEl);

        if (!this.lastObserverBatch) {
            observerLastBatchEl.textContent = '-';
            observerLastBatchEl.className = '';
        } else {
            observerLastBatchEl.textContent = `${this.lastObserverBatch.nodes} nodes in, ${this.lastObserverBatch.dispatchedNodes} out, ${this.lastObserverBatch.droppedNodes} trimmed, ${this.lastObserverBatch.mutationRecords} records, ${this.lastObserverBatch.durationMs.toFixed(2)}ms @ ${this._formatTime(this.lastObserverBatch.ts)}`;
            observerLastBatchEl.className = this._severityClassName(this._classifyObserverSeverity(
                this.lastObserverBatch.durationMs,
                this.lastObserverBatch.nodes,
                this.lastObserverBatch.mutationRecords,
                thresholds
            ));
        }

        observerSpikesEl.innerHTML = this.observerSpikeHistory.length
            ? this.observerSpikeHistory.map((entry) => {
                const className = this._severityClassName(entry.severity);
                const info = `${entry.durationMs.toFixed(2)}ms | ${entry.nodes} nodes | ${entry.mutationRecords} records`;
                return `<li><span>${this._formatTime(entry.ts)}</span><strong class="${className}">${info}</strong></li>`;
            }).join('')
            : '<li><span>No spikes yet.</span><strong>Stable</strong></li>';

        const configuredMaxReasons = Math.max(1, Math.min(12, Number(this.settings?.diagnostics?.maxReasons || 6)));
        const maxReasons = this._isCompactOverlayEnabled()
            ? Math.min(4, configuredMaxReasons)
            : configuredMaxReasons;
        const top = Array.from(this.reasonCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxReasons);

        listEl.innerHTML = top.length
            ? top.map(([reason, count]) => `<li><span>${this._escapeHtml(reason)}</span><strong>${count}</strong></li>`).join('')
            : '<li><span>No hide actions yet.</span><strong>0</strong></li>';
    }

    _buildSnapshot() {
        const reasonCounts = Array.from(this.reasonCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([reason, count]) => ({ reason, count }));

        const avgObserverDurationMs = this.observerBatchCount > 0
            ? this.observerDurationTotal / this.observerBatchCount
            : 0;

        return {
            generatedAt: new Date().toISOString(),
            page: window.location.href,
            diagnostics: {
                enabled: this._isEnabled(),
                showOverlay: !!this.settings?.diagnostics?.showOverlay,
                compactOverlay: this._isCompactOverlayEnabled(),
                verboseConsole: !!this.settings?.diagnostics?.verboseConsole,
                maxReasons: Number(this.settings?.diagnostics?.maxReasons || 6),
                overlayPosition: this.overlayPosition
                    ? {
                        left: this.overlayPosition.left,
                        top: this.overlayPosition.top
                    }
                    : null
            },
            counters: {
                hiddenTotal: this.hiddenTotal,
                settingsUpdateCount: this.settingsUpdateCount,
                liveResweepTotal: this.liveResweepTotal,
                liveResweepFollowups: this.liveResweepFollowups
            },
            timings: {
                lastSettingsUpdateAt: this.lastSettingsUpdateAt ? new Date(this.lastSettingsUpdateAt).toISOString() : null,
                lastResweepAt: this.lastResweepAt ? new Date(this.lastResweepAt).toISOString() : null
            },
            observer: {
                thresholds: this._getObserverThresholds(),
                batchCount: this.observerBatchCount,
                batchRatePerMinute: this._getObserverBatchRatePerMinute(),
                nodesSeen: this.observerNodesTotal,
                nodesDispatched: this.observerDispatchedTotal,
                nodesTrimmed: this.observerDroppedTotal,
                recordsSeen: this.observerMutationTotal,
                avgBatchDurationMs: Number(avgObserverDurationMs.toFixed(3)),
                peakBatchDurationMs: Number(this.observerDurationPeak.toFixed(3)),
                lastBatch: this.lastObserverBatch
                    ? {
                        nodes: this.lastObserverBatch.nodes,
                        dispatchedNodes: this.lastObserverBatch.dispatchedNodes,
                        droppedNodes: this.lastObserverBatch.droppedNodes,
                        mutationRecords: this.lastObserverBatch.mutationRecords,
                        durationMs: Number(this.lastObserverBatch.durationMs.toFixed(3)),
                        ts: new Date(this.lastObserverBatch.ts).toISOString()
                    }
                    : null,
                spikeHistory: this.observerSpikeHistory.map((entry) => ({
                    nodes: entry.nodes,
                    mutationRecords: entry.mutationRecords,
                    durationMs: Number(entry.durationMs.toFixed(3)),
                    severity: entry.severity,
                    ts: new Date(entry.ts).toISOString()
                })),
                trendHistory: this.observerTrendHistory.map((entry) => ({
                    nodes: entry.nodes,
                    mutationRecords: entry.mutationRecords,
                    durationMs: Number(entry.durationMs.toFixed(3)),
                    severity: entry.severity,
                    score: Number(entry.score.toFixed(3)),
                    ts: new Date(entry.ts).toISOString()
                }))
            },
            pipeline: {
                batchCount: this.pipelineBatchCount,
                nodesReceived: this.pipelineNodesReceivedTotal,
                nodesDispatched: this.pipelineNodesDispatchedTotal,
                nodesTrimmed: this.pipelineNodesTrimmedTotal,
                budgetDeferrals: this.pipelineBudgetDeferrals,
                deferredProcessorsTotal: this.pipelineBudgetDeferredProcessorsTotal,
                guidance: this._computePerformanceGuidance(),
                trimRatio: this.pipelineNodesReceivedTotal > 0
                    ? Number(((this.pipelineNodesTrimmedTotal / this.pipelineNodesReceivedTotal) * 100).toFixed(3))
                    : 0,
                lastBatch: this.lastPipelineBatch
                    ? {
                        receivedNodes: this.lastPipelineBatch.receivedNodes,
                        dispatchedNodes: this.lastPipelineBatch.dispatchedNodes,
                        trimmedNodes: this.lastPipelineBatch.trimmedNodes,
                        ts: new Date(this.lastPipelineBatch.ts).toISOString()
                    }
                    : null,
                lastBudgetDeferral: this.lastPipelineBudgetDeferral
                    ? {
                        nodes: this.lastPipelineBudgetDeferral.nodes,
                        budgetMs: Number(this.lastPipelineBudgetDeferral.budgetMs.toFixed(3)),
                        elapsedMs: Number(this.lastPipelineBudgetDeferral.elapsedMs.toFixed(3)),
                        remainingProcessors: this.lastPipelineBudgetDeferral.remainingProcessors,
                        deferredFrom: this.lastPipelineBudgetDeferral.deferredFrom,
                        ts: new Date(this.lastPipelineBudgetDeferral.ts).toISOString()
                    }
                    : null
            },
            wellbeingReportActions: {
                total: this.reportActionTotal,
                lastActionAt: this.lastReportActionAt ? new Date(this.lastReportActionAt).toISOString() : null,
                lastActionLabel: this.lastReportActionLabel || null,
                topActions: Array.from(this.reportActionCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
                    .map(([label, count]) => ({ label, count }))
            },
            topReasons: reasonCounts
        };
    }

    _renderObserverTrend(svgEl, metaEl) {
        if (!svgEl || !metaEl) return;

        const samples = this.observerTrendHistory;
        const width = 228;
        const height = 56;

        if (!samples.length) {
            svgEl.innerHTML = `<line x1="0" y1="${height - 1}" x2="${width}" y2="${height - 1}" stroke="rgba(140, 160, 192, 0.35)" stroke-width="1" />`;
            metaEl.textContent = 'Waiting for observer batches...';
            metaEl.className = 'pf-diag-trend-meta';
            return;
        }

        const maxScore = Math.max(2.25, ...samples.map((sample) => Number(sample.score) || 0));
        const sampleCount = samples.length;
        const points = samples.map((sample, index) => {
            const x = sampleCount === 1 ? 0 : (index * (width / (sampleCount - 1)));
            const clampedScore = Math.max(0, Math.min(maxScore, Number(sample.score) || 0));
            const y = height - ((clampedScore / maxScore) * height);
            return {
                x,
                y
            };
        });

        const linePoints = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
        const areaPoints = `0,${height} ${linePoints} ${width},${height}`;
        const warnY = (height - ((1 / maxScore) * height)).toFixed(2);
        const severeY = (height - ((2 / maxScore) * height)).toFixed(2);

        const lastSample = samples[samples.length - 1];
        const lastPoint = points[points.length - 1];
        const trendColor = this._severityColor(lastSample.severity);

        svgEl.innerHTML = `
            <line x1="0" y1="${warnY}" x2="${width}" y2="${warnY}" stroke="rgba(255, 209, 102, 0.45)" stroke-width="1" stroke-dasharray="3 3" />
            <line x1="0" y1="${severeY}" x2="${width}" y2="${severeY}" stroke="rgba(255, 122, 144, 0.5)" stroke-width="1" stroke-dasharray="3 3" />
            <polygon points="${areaPoints}" fill="rgba(116, 240, 255, 0.18)" />
            <polyline points="${linePoints}" fill="none" stroke="${trendColor}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="${lastPoint.x.toFixed(2)}" cy="${lastPoint.y.toFixed(2)}" r="2.6" fill="${trendColor}" />
        `;

        metaEl.textContent = `Window ${sampleCount} | Last ${lastSample.durationMs.toFixed(2)}ms, ${lastSample.nodes} nodes, ${lastSample.mutationRecords} records`;
        metaEl.className = `pf-diag-trend-meta ${this._severityClassName(lastSample.severity)}`;
    }

    _calculateObserverTrendScore(durationMs, nodes, mutationRecords, thresholds) {
        const durationScore = this._scaleSeverityValue(durationMs, thresholds.warnDurationMs, thresholds.severeDurationMs);
        const nodesScore = this._scaleSeverityValue(nodes, thresholds.warnNodes, thresholds.severeNodes);
        const recordsScore = this._scaleSeverityValue(mutationRecords, thresholds.warnRecords, thresholds.severeRecords);
        return Math.max(durationScore, nodesScore, recordsScore);
    }

    _scaleSeverityValue(value, warnThreshold, severeThreshold) {
        const safeWarn = Math.max(1, Number(warnThreshold) || 1);
        const safeSevere = Math.max(safeWarn + 1, Number(severeThreshold) || (safeWarn + 1));
        const numeric = Math.max(0, Number(value) || 0);

        if (numeric <= safeWarn) {
            return numeric / safeWarn;
        }

        if (numeric <= safeSevere) {
            const range = safeSevere - safeWarn;
            return 1 + ((numeric - safeWarn) / range);
        }

        return 2 + Math.min(1, (numeric - safeSevere) / safeSevere);
    }

    _pruneObserverBatchTimestamps(referenceTs = Date.now()) {
        const cutoff = Number(referenceTs || Date.now()) - 60000;
        this.observerBatchTimestamps = this.observerBatchTimestamps.filter((ts) => Number(ts) >= cutoff);
    }

    _getObserverBatchRatePerMinute(referenceTs = Date.now()) {
        this._pruneObserverBatchTimestamps(referenceTs);
        return this.observerBatchTimestamps.length;
    }

    _classifyObserverRateSeverity(ratePerMinute) {
        const rate = Math.max(0, Number(ratePerMinute) || 0);
        if (rate >= 220) return 'severe';
        if (rate >= 120) return 'warn';
        return 'ok';
    }

    _getObserverThresholds() {
        const diagnostics = this.settings?.diagnostics || {};

        const warnDurationMs = this._clampInt(diagnostics.observerWarnDurationMs, 8, 200, 25);
        let severeDurationMs = this._clampInt(diagnostics.observerSevereDurationMs, 10, 300, 45);
        if (severeDurationMs <= warnDurationMs) severeDurationMs = Math.min(300, warnDurationMs + 5);

        const warnNodes = this._clampInt(diagnostics.observerWarnNodes, 40, 3000, 220);
        let severeNodes = this._clampInt(diagnostics.observerSevereNodes, 60, 5000, 420);
        if (severeNodes <= warnNodes) severeNodes = Math.min(5000, warnNodes + 40);

        const warnRecords = this._clampInt(diagnostics.observerWarnRecords, 20, 2000, 120);
        let severeRecords = this._clampInt(diagnostics.observerSevereRecords, 30, 3000, 240);
        if (severeRecords <= warnRecords) severeRecords = Math.min(3000, warnRecords + 20);

        return {
            warnDurationMs,
            severeDurationMs,
            warnNodes,
            severeNodes,
            warnRecords,
            severeRecords
        };
    }

    _classifyObserverSeverity(durationMs, nodes, mutationRecords, thresholds = null) {
        const t = thresholds || this._getObserverThresholds();

        if (durationMs >= t.severeDurationMs || nodes >= t.severeNodes || mutationRecords >= t.severeRecords) {
            return 'severe';
        }

        if (durationMs >= t.warnDurationMs || nodes >= t.warnNodes || mutationRecords >= t.warnRecords) {
            return 'warn';
        }

        return 'ok';
    }

    _severityClassName(severity) {
        if (severity === 'severe') return 'pf-diag-value-severe';
        if (severity === 'warn') return 'pf-diag-value-warn';
        return 'pf-diag-value-ok';
    }

    _severityColor(severity) {
        if (severity === 'severe') return '#ff7a90';
        if (severity === 'warn') return '#ffd166';
        return '#74f0ff';
    }

    _computePerformanceGuidance() {
        const trimRatio = this.pipelineNodesReceivedTotal > 0
            ? (this.pipelineNodesTrimmedTotal / this.pipelineNodesReceivedTotal) * 100
            : 0;

        if (this.pipelineBudgetDeferrals >= 12 || this.pipelineBudgetDeferredProcessorsTotal >= 40 || trimRatio >= 45) {
            return {
                severity: 'severe',
                label: 'High pressure',
                message: 'Heavy pipeline pressure detected. Ultra Fast Mode is recommended for this session.',
                showUltraFastButton: true
            };
        }

        if (this.pipelineBudgetDeferrals >= 4 || this.pipelineBudgetDeferredProcessorsTotal >= 12 || trimRatio >= 25) {
            return {
                severity: 'warn',
                label: 'Moderate pressure',
                message: 'Pipeline load is elevated. Consider Ultra Fast Mode if scrolling feels laggy.',
                showUltraFastButton: true
            };
        }

        return {
            severity: 'ok',
            label: 'Stable',
            message: 'Pipeline load is currently stable.',
            showUltraFastButton: false
        };
    }

    _clampInt(value, min, max, fallback) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(min, Math.min(max, Math.round(parsed)));
    }

    _normalizeOverlayPosition(value) {
        const left = Number(value?.left);
        const top = Number(value?.top);
        if (!Number.isFinite(left) || !Number.isFinite(top)) return null;

        return {
            left: Math.round(left),
            top: Math.round(top)
        };
    }

    _clampOverlayPosition(position) {
        const normalized = this._normalizeOverlayPosition(position);
        if (!normalized) return null;

        const margin = 8;
        const viewportWidth = Math.max(320, window.innerWidth || 0);
        const viewportHeight = Math.max(240, window.innerHeight || 0);
        const overlayRect = this.overlay ? this.overlay.getBoundingClientRect() : null;
        const overlayWidth = Math.max(220, Math.round(overlayRect?.width || 320));
        const overlayHeight = Math.max(140, Math.round(overlayRect?.height || 220));

        const maxLeft = Math.max(margin, viewportWidth - overlayWidth - margin);
        const maxTop = Math.max(margin, viewportHeight - overlayHeight - margin);

        return {
            left: Math.max(margin, Math.min(maxLeft, normalized.left)),
            top: Math.max(margin, Math.min(maxTop, normalized.top))
        };
    }

    _applyOverlayPosition() {
        if (!this.overlay) return;

        if (!this.overlayPosition) {
            this.overlay.style.left = '';
            this.overlay.style.top = '';
            this.overlay.style.right = '14px';
            this.overlay.style.bottom = '14px';
            return;
        }

        const clamped = this._clampOverlayPosition(this.overlayPosition);
        if (!clamped) {
            this.overlayPosition = null;
            this.overlay.style.left = '';
            this.overlay.style.top = '';
            this.overlay.style.right = '14px';
            this.overlay.style.bottom = '14px';
            return;
        }

        this.overlayPosition = clamped;
        this.overlay.style.left = `${clamped.left}px`;
        this.overlay.style.top = `${clamped.top}px`;
        this.overlay.style.right = 'auto';
        this.overlay.style.bottom = 'auto';
    }

    async _loadSavedOverlayPosition() {
        try {
            let saved = null;

            if (window.PF_Storage && typeof window.PF_Storage.getLocalData === 'function') {
                saved = await window.PF_Storage.getLocalData(this.overlayPositionStorageKey);
            } else if (window.localStorage) {
                const raw = window.localStorage.getItem(this.overlayPositionStorageKey);
                saved = raw ? JSON.parse(raw) : null;
            }

            const normalized = this._normalizeOverlayPosition(saved);
            this.overlayPosition = normalized;
            this._applyOverlayPosition();
        } catch (err) {
            this.overlayPosition = null;
        }
    }

    async _persistOverlayPosition() {
        if (!this.overlayPosition) return;

        const payload = {
            left: this.overlayPosition.left,
            top: this.overlayPosition.top,
            updatedAt: Date.now()
        };

        try {
            if (window.PF_Storage && typeof window.PF_Storage.setLocalData === 'function') {
                await window.PF_Storage.setLocalData(this.overlayPositionStorageKey, payload);
                return;
            }

            if (window.localStorage) {
                window.localStorage.setItem(this.overlayPositionStorageKey, JSON.stringify(payload));
            }
        } catch (err) {
            // no-op if storage write fails
        }
    }

    async _clearSavedOverlayPosition() {
        try {
            if (window.PF_Storage && typeof window.PF_Storage.setLocalData === 'function') {
                await window.PF_Storage.setLocalData(this.overlayPositionStorageKey, null);
                return;
            }

            if (window.localStorage) {
                window.localStorage.removeItem(this.overlayPositionStorageKey);
            }
        } catch (err) {
            // no-op if storage clear fails
        }
    }

    async _resetOverlayPosition() {
        this.overlayPosition = null;
        this._applyOverlayPosition();
        await this._clearSavedOverlayPosition();

        if (window.PF_Helpers && typeof window.PF_Helpers.showToast === 'function') {
            window.PF_Helpers.showToast('Overlay position reset.', 'success');
        }
    }

    _cleanupDragListeners() {
        window.removeEventListener('pointermove', this.boundDragMoveHandler);
        window.removeEventListener('pointerup', this.boundDragEndHandler);
        window.removeEventListener('pointercancel', this.boundDragEndHandler);
        if (this.overlay) {
            this.overlay.classList.remove('pf-diag-dragging');
        }
        this.dragState = null;
    }

    _onDragStart(event) {
        if (!this.overlay) return;
        if (event && typeof event.button === 'number' && event.button !== 0) return;

        const rect = this.overlay.getBoundingClientRect();
        this.dragState = {
            pointerId: event?.pointerId,
            startX: event?.clientX || 0,
            startY: event?.clientY || 0,
            startLeft: rect.left,
            startTop: rect.top,
            moved: false
        };

        this.overlay.classList.add('pf-diag-dragging');

        if (event?.target?.setPointerCapture && typeof event.pointerId === 'number') {
            try {
                event.target.setPointerCapture(event.pointerId);
            } catch (err) {
                // ignore pointer capture failures
            }
        }

        window.addEventListener('pointermove', this.boundDragMoveHandler);
        window.addEventListener('pointerup', this.boundDragEndHandler);
        window.addEventListener('pointercancel', this.boundDragEndHandler);

        if (event?.preventDefault) {
            event.preventDefault();
        }
    }

    _onDragMove(event) {
        if (!this.overlay || !this.dragState) return;

        const deltaX = (event?.clientX || 0) - this.dragState.startX;
        const deltaY = (event?.clientY || 0) - this.dragState.startY;
        if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
            this.dragState.moved = true;
        }

        const next = this._clampOverlayPosition({
            left: this.dragState.startLeft + deltaX,
            top: this.dragState.startTop + deltaY
        });

        if (!next) return;
        this.overlayPosition = next;
        this._applyOverlayPosition();
    }

    _onDragEnd() {
        if (!this.dragState) return;

        const moved = !!this.dragState.moved;
        this._cleanupDragListeners();

        if (moved) {
            void this._persistOverlayPosition();
        }
    }

    _onWindowResize() {
        if (!this.overlayPosition) return;

        const clamped = this._clampOverlayPosition(this.overlayPosition);
        if (!clamped) return;

        this.overlayPosition = clamped;
        this._applyOverlayPosition();
        void this._persistOverlayPosition();
    }

    _clearObserverHistory() {
        this.observerBatchTimestamps = [];
        this.observerSpikeHistory = [];
        this.observerTrendHistory = [];
        this.lastObserverBatch = null;
        this.lastPipelineBatch = null;
        this.pipelineBudgetDeferrals = 0;
        this.pipelineBudgetDeferredProcessorsTotal = 0;
        this.lastPipelineBudgetDeferral = null;

        this._render();

        if (window.PF_Helpers && typeof window.PF_Helpers.showToast === 'function') {
            window.PF_Helpers.showToast('Observer history cleared.', 'success');
        }
    }

    _resetAllDiagnosticsData() {
        this.hiddenTotal = 0;
        this.reasonCounts.clear();
        this.liveResweepTotal = 0;
        this.liveResweepFollowups = 0;
        this.lastResweepAt = 0;
        this.settingsUpdateCount = 0;
        this.lastSettingsUpdateAt = 0;

        this.observerBatchCount = 0;
        this.observerNodesTotal = 0;
        this.observerDispatchedTotal = 0;
        this.observerDroppedTotal = 0;
        this.observerMutationTotal = 0;
        this.observerDurationTotal = 0;
        this.observerDurationPeak = 0;
        this.lastObserverBatch = null;
        this.pipelineBatchCount = 0;
        this.pipelineNodesReceivedTotal = 0;
        this.pipelineNodesDispatchedTotal = 0;
        this.pipelineNodesTrimmedTotal = 0;
        this.lastPipelineBatch = null;
        this.pipelineBudgetDeferrals = 0;
        this.pipelineBudgetDeferredProcessorsTotal = 0;
        this.lastPipelineBudgetDeferral = null;
        this.reportActionTotal = 0;
        this.reportActionCounts.clear();
        this.lastReportActionAt = 0;
        this.lastReportActionLabel = '';
        this.observerBatchTimestamps = [];
        this.observerSpikeHistory = [];
        this.observerTrendHistory = [];

        this._render();

        if (window.PF_Helpers && typeof window.PF_Helpers.showToast === 'function') {
            window.PF_Helpers.showToast('Diagnostics counters reset.', 'success');
        }
    }

    _exportSnapshot() {
        try {
            const pretty = this._buildSnapshotJson();
            const blob = new Blob([pretty], { type: 'application/json' });
            const blobUrl = URL.createObjectURL(blob);

            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const anchor = document.createElement('a');
            anchor.href = blobUrl;
            anchor.download = `purefusion-diagnostics-${stamp}.json`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();

            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

            if (window.PF_Helpers && typeof window.PF_Helpers.showToast === 'function') {
                window.PF_Helpers.showToast('Diagnostics snapshot exported.', 'success');
            }
        } catch (err) {
            PF_Logger.warn('Diagnostics export failed:', err);
            if (window.PF_Helpers && typeof window.PF_Helpers.showToast === 'function') {
                window.PF_Helpers.showToast('Diagnostics export failed.', 'error');
            }
        }
    }

    _buildSnapshotJson() {
        return JSON.stringify(this._buildSnapshot(), null, 2);
    }

    async _copySnapshotToClipboard() {
        try {
            const pretty = this._buildSnapshotJson();
            let copied = false;

            if (navigator?.clipboard?.writeText) {
                try {
                    await navigator.clipboard.writeText(pretty);
                    copied = true;
                } catch (err) {
                    copied = false;
                }
            }

            if (!copied) {
                copied = this._copyTextViaTextarea(pretty);
            }

            if (copied) {
                if (window.PF_Helpers && typeof window.PF_Helpers.showToast === 'function') {
                    window.PF_Helpers.showToast('Diagnostics snapshot copied.', 'success');
                }
            } else if (window.PF_Helpers && typeof window.PF_Helpers.showToast === 'function') {
                window.PF_Helpers.showToast('Copy failed. Use Export snapshot instead.', 'error');
            }
        } catch (err) {
            PF_Logger.warn('Diagnostics clipboard copy failed:', err);
            if (window.PF_Helpers && typeof window.PF_Helpers.showToast === 'function') {
                window.PF_Helpers.showToast('Copy failed. Use Export snapshot instead.', 'error');
            }
        }
    }

    _copyTextViaTextarea(text) {
        try {
            const area = document.createElement('textarea');
            area.value = String(text || '');
            area.setAttribute('readonly', 'readonly');
            area.style.position = 'fixed';
            area.style.left = '-9999px';
            area.style.top = '0';
            document.body.appendChild(area);
            area.focus();
            area.select();

            let copied = false;
            if (document.execCommand) {
                copied = document.execCommand('copy');
            }

            area.remove();
            return copied;
        } catch (err) {
            return false;
        }
    }

    _formatTime(timestamp) {
        if (!timestamp) return '-';

        try {
            return new Date(timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (err) {
            return '-';
        }
    }

    _escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    _injectStyles() {
        if (document.getElementById('pf-diagnostics-styles')) return;

        const style = document.createElement('style');
        style.id = 'pf-diagnostics-styles';
        style.textContent = `
            #pf-diagnostics-overlay {
                position: fixed;
                right: 14px;
                bottom: 14px;
                width: min(360px, calc(100vw - 24px));
                max-height: 42vh;
                overflow: auto;
                z-index: 2147483646;
                background: rgba(14, 17, 22, 0.92);
                border: 1px solid rgba(110, 122, 145, 0.45);
                border-radius: 12px;
                padding: 10px 12px;
                color: #dfe7f6;
                font: 600 12px/1.35 "Segoe UI Variable Text", "Segoe UI", sans-serif;
                box-shadow: 0 10px 32px rgba(0, 0, 0, 0.45);
            }

            #pf-diagnostics-overlay.pf-diag-compact {
                width: min(310px, calc(100vw - 20px));
                max-height: 36vh;
                padding: 8px 9px;
                font-size: 11px;
                line-height: 1.25;
            }

            #pf-diagnostics-overlay .pf-diag-title {
                font-weight: 800;
                color: #9fe7ff;
                margin-bottom: 4px;
                cursor: grab;
                user-select: none;
                touch-action: none;
            }

            #pf-diagnostics-overlay.pf-diag-dragging .pf-diag-title {
                cursor: grabbing;
            }

            #pf-diagnostics-overlay .pf-diag-total {
                margin-bottom: 8px;
                color: #d7e4fb;
            }

            #pf-diagnostics-overlay.pf-diag-compact .pf-diag-total {
                margin-bottom: 6px;
            }

            #pf-diagnostics-overlay .pf-diag-meta {
                display: grid;
                gap: 4px;
                margin-bottom: 8px;
                color: #c5d4ee;
                font-weight: 500;
            }

            #pf-diagnostics-overlay .pf-diag-meta strong {
                color: #89f4ff;
                font-weight: 800;
            }

            #pf-diagnostics-overlay .pf-diag-inline-btn {
                justify-self: start;
                appearance: none;
                border: 1px solid #4a5a78;
                border-radius: 999px;
                background: #1d2635;
                color: #dbe8ff;
                font: 700 10px/1.2 "Segoe UI", sans-serif;
                padding: 4px 8px;
                cursor: pointer;
            }

            #pf-diagnostics-overlay .pf-diag-inline-btn:hover {
                border-color: #7ce8ff;
                color: #ffffff;
            }

            #pf-diagnostics-overlay .pf-diag-subtitle {
                font-size: 11px;
                font-weight: 700;
                color: #aab8d4;
                margin-bottom: 6px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
            }

            #pf-diagnostics-overlay.pf-diag-compact .pf-diag-subtitle {
                margin-bottom: 4px;
                font-size: 10px;
            }

            #pf-diagnostics-overlay .pf-diag-thresholds {
                margin-bottom: 8px;
                color: #95a8ca;
                font-size: 11px;
            }

            #pf-diagnostics-overlay .pf-diag-trend {
                margin: 0 0 10px;
                border: 1px solid rgba(113, 135, 170, 0.32);
                border-radius: 8px;
                background: rgba(15, 20, 30, 0.7);
                padding: 6px 8px;
            }

            #pf-diagnostics-overlay.pf-diag-compact .pf-diag-trend {
                margin-bottom: 8px;
                padding: 5px 6px;
            }

            #pf-diagnostics-overlay .pf-diag-trend svg {
                display: block;
                width: 100%;
                height: 56px;
            }

            #pf-diagnostics-overlay.pf-diag-compact .pf-diag-trend svg {
                height: 42px;
            }

            #pf-diagnostics-overlay .pf-diag-trend-meta {
                margin-top: 6px;
                font-size: 11px;
                color: #b8c9e8;
                font-weight: 600;
            }

            #pf-diagnostics-overlay.pf-diag-compact .pf-diag-trend-meta {
                margin-top: 4px;
                font-size: 10px;
            }

            #pf-diagnostics-overlay .pf-diag-list {
                margin: 0;
                padding-left: 16px;
                display: grid;
                gap: 4px;
            }

            #pf-diagnostics-overlay .pf-diag-list li {
                display: flex;
                justify-content: space-between;
                gap: 10px;
                align-items: flex-start;
            }

            #pf-diagnostics-overlay .pf-diag-list span {
                color: #d5def0;
                max-width: 270px;
                word-break: break-word;
            }

            #pf-diagnostics-overlay .pf-diag-list strong {
                color: #74f0ff;
                font-weight: 800;
            }

            #pf-diagnostics-overlay .pf-diag-spike-list {
                margin: 0 0 10px;
                padding-left: 16px;
                display: grid;
                gap: 4px;
            }

            #pf-diagnostics-overlay .pf-diag-spike-list li {
                display: flex;
                justify-content: space-between;
                gap: 10px;
                align-items: flex-start;
            }

            #pf-diagnostics-overlay .pf-diag-spike-list span {
                color: #c7d6f1;
                font-weight: 600;
            }

            #pf-diagnostics-overlay .pf-diag-spike-list strong {
                color: #e3ebfb;
                font-weight: 700;
            }

            #pf-diagnostics-overlay .pf-diag-value-ok {
                color: #7ce8ff !important;
            }

            #pf-diagnostics-overlay .pf-diag-value-warn {
                color: #ffd166 !important;
            }

            #pf-diagnostics-overlay .pf-diag-value-severe {
                color: #ff7a90 !important;
            }

            #pf-diagnostics-overlay .pf-diag-actions {
                margin-top: 10px;
                display: flex;
                justify-content: flex-end;
                gap: 6px;
                flex-wrap: wrap;
            }

            #pf-diagnostics-overlay.pf-diag-compact .pf-diag-actions {
                margin-top: 8px;
                gap: 4px;
            }

            #pf-diagnostics-overlay .pf-diag-actions button {
                appearance: none;
                border: 1px solid #4a5a78;
                border-radius: 8px;
                background: #1d2635;
                color: #dbe8ff;
                font: 700 11px/1.2 "Segoe UI", sans-serif;
                padding: 6px 10px;
                cursor: pointer;
            }

            #pf-diagnostics-overlay.pf-diag-compact .pf-diag-actions button {
                font-size: 10px;
                padding: 5px 7px;
            }

            #pf-diagnostics-overlay .pf-diag-actions button:hover {
                border-color: #79d9ff;
                color: #ffffff;
            }
        `;

        document.head.appendChild(style);
    }
}

window.PF_Diagnostics = PF_Diagnostics;
