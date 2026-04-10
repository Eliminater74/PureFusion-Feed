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
        this.observerMutationTotal = 0;
        this.observerDurationTotal = 0;
        this.observerDurationPeak = 0;
        this.lastObserverBatch = null;
        this.observerSpikeHistory = [];
        this.observerSpikeHistoryLimit = 10;
        this.boundHiddenHandler = this._onElementHidden.bind(this);
        this.boundResweepHandler = this._onResweepPass.bind(this);
        this.boundSettingsUpdateHandler = this._onSettingsUpdate.bind(this);
        this.boundObserverBatchHandler = this._onObserverBatch.bind(this);

        window.addEventListener('pf:element_hidden', this.boundHiddenHandler);
        window.addEventListener('pf:resweep_pass', this.boundResweepHandler);
        window.addEventListener('pf:settings_update', this.boundSettingsUpdateHandler);
        window.addEventListener('pf:observer_batch', this.boundObserverBatchHandler);
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
        const mutationRecords = Math.max(0, Number(event?.detail?.mutationRecords || 0));
        const durationMs = Math.max(0, Number(event?.detail?.durationMs || 0));
        const thresholds = this._getObserverThresholds();

        this.observerBatchCount += 1;
        this.observerNodesTotal += nodes;
        this.observerMutationTotal += mutationRecords;
        this.observerDurationTotal += durationMs;
        this.observerDurationPeak = Math.max(this.observerDurationPeak, durationMs);
        this.lastObserverBatch = {
            nodes,
            mutationRecords,
            durationMs,
            ts: Date.now()
        };

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

        if (this.settings?.diagnostics?.verboseConsole) {
            PF_Logger.log(`[Diagnostics] Observer batch: ${nodes} nodes, ${mutationRecords} records, ${durationMs.toFixed(2)}ms (${severity})`);
        }

        this._render();
    }

    _isEnabled() {
        return !!this.settings?.diagnostics?.enabled;
    }

    _syncOverlayState() {
        if (!this._isEnabled() || !this.settings?.diagnostics?.showOverlay) {
            this._removeOverlay();
            return;
        }

        this._ensureOverlay();
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
                <div>Nodes seen: <strong id="pfDiagObserverNodes">0</strong></div>
                <div>Records seen: <strong id="pfDiagObserverRecords">0</strong></div>
                <div>Avg/Peak batch: <strong id="pfDiagObserverAvgMs">0.00ms</strong> / <strong id="pfDiagObserverPeakMs">0.00ms</strong></div>
                <div>Last batch: <span id="pfDiagObserverLastBatch">-</span></div>
            </div>
            <div id="pfDiagObserverThresholds" class="pf-diag-thresholds">Warn if batch >= 25ms, 220 nodes, or 120 records.</div>
            <div class="pf-diag-subtitle">Recent observer spikes</div>
            <ul id="pfDiagObserverSpikes" class="pf-diag-spike-list"></ul>
            <div class="pf-diag-subtitle">Top hide reasons</div>
            <ol id="pfDiagReasons" class="pf-diag-list"></ol>
            <div class="pf-diag-actions">
                <button id="pfDiagExportBtn" type="button">Export snapshot</button>
            </div>
        `;

        const exportBtn = this.overlay.querySelector('#pfDiagExportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this._exportSnapshot();
            });
        }

        document.body.appendChild(this.overlay);
    }

    _removeOverlay() {
        if (!this.overlay) return;
        if (this.overlay.remove) this.overlay.remove();
        this.overlay = null;
    }

    _render() {
        if (!this.overlay || !document.contains(this.overlay)) return;

        const totalEl = this.overlay.querySelector('#pfDiagTotal');
        const listEl = this.overlay.querySelector('#pfDiagReasons');
        const syncEl = this.overlay.querySelector('#pfDiagSettingsSyncs');
        const resweepEl = this.overlay.querySelector('#pfDiagResweeps');
        const followupsEl = this.overlay.querySelector('#pfDiagResweepFollowups');
        const lastSyncEl = this.overlay.querySelector('#pfDiagLastSync');
        const lastResweepEl = this.overlay.querySelector('#pfDiagLastResweep');
        const observerBatchesEl = this.overlay.querySelector('#pfDiagObserverBatches');
        const observerNodesEl = this.overlay.querySelector('#pfDiagObserverNodes');
        const observerRecordsEl = this.overlay.querySelector('#pfDiagObserverRecords');
        const observerAvgMsEl = this.overlay.querySelector('#pfDiagObserverAvgMs');
        const observerPeakMsEl = this.overlay.querySelector('#pfDiagObserverPeakMs');
        const observerLastBatchEl = this.overlay.querySelector('#pfDiagObserverLastBatch');
        const observerSpikesEl = this.overlay.querySelector('#pfDiagObserverSpikes');
        const observerThresholdsEl = this.overlay.querySelector('#pfDiagObserverThresholds');
        if (!totalEl || !listEl || !syncEl || !resweepEl || !followupsEl || !lastSyncEl || !lastResweepEl || !observerBatchesEl || !observerNodesEl || !observerRecordsEl || !observerAvgMsEl || !observerPeakMsEl || !observerLastBatchEl || !observerSpikesEl || !observerThresholdsEl) return;

        const thresholds = this._getObserverThresholds();

        totalEl.textContent = String(this.hiddenTotal);
        syncEl.textContent = String(this.settingsUpdateCount);
        resweepEl.textContent = String(this.liveResweepTotal);
        followupsEl.textContent = String(this.liveResweepFollowups);
        lastSyncEl.textContent = this._formatTime(this.lastSettingsUpdateAt);
        lastResweepEl.textContent = this._formatTime(this.lastResweepAt);
        observerBatchesEl.textContent = String(this.observerBatchCount);
        observerNodesEl.textContent = String(this.observerNodesTotal);
        observerRecordsEl.textContent = String(this.observerMutationTotal);

        const avgMs = this.observerBatchCount > 0
            ? this.observerDurationTotal / this.observerBatchCount
            : 0;
        observerAvgMsEl.textContent = `${avgMs.toFixed(2)}ms`;
        observerPeakMsEl.textContent = `${this.observerDurationPeak.toFixed(2)}ms`;
        observerAvgMsEl.className = this._severityClassName(this._classifyObserverSeverity(avgMs, 0, 0, thresholds));
        observerPeakMsEl.className = this._severityClassName(this._classifyObserverSeverity(this.observerDurationPeak, 0, 0, thresholds));

        observerThresholdsEl.textContent = `Warn if batch >= ${thresholds.warnDurationMs}ms, ${thresholds.warnNodes} nodes, or ${thresholds.warnRecords} records.`;

        if (!this.lastObserverBatch) {
            observerLastBatchEl.textContent = '-';
            observerLastBatchEl.className = '';
        } else {
            observerLastBatchEl.textContent = `${this.lastObserverBatch.nodes} nodes, ${this.lastObserverBatch.mutationRecords} records, ${this.lastObserverBatch.durationMs.toFixed(2)}ms @ ${this._formatTime(this.lastObserverBatch.ts)}`;
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

        const maxReasons = Math.max(1, Math.min(12, Number(this.settings?.diagnostics?.maxReasons || 6)));
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
                verboseConsole: !!this.settings?.diagnostics?.verboseConsole,
                maxReasons: Number(this.settings?.diagnostics?.maxReasons || 6)
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
                nodesSeen: this.observerNodesTotal,
                recordsSeen: this.observerMutationTotal,
                avgBatchDurationMs: Number(avgObserverDurationMs.toFixed(3)),
                peakBatchDurationMs: Number(this.observerDurationPeak.toFixed(3)),
                lastBatch: this.lastObserverBatch
                    ? {
                        nodes: this.lastObserverBatch.nodes,
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
                }))
            },
            topReasons: reasonCounts
        };
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

    _clampInt(value, min, max, fallback) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.max(min, Math.min(max, Math.round(parsed)));
    }

    _exportSnapshot() {
        try {
            const payload = this._buildSnapshot();
            const pretty = JSON.stringify(payload, null, 2);
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

            #pf-diagnostics-overlay .pf-diag-title {
                font-weight: 800;
                color: #9fe7ff;
                margin-bottom: 4px;
            }

            #pf-diagnostics-overlay .pf-diag-total {
                margin-bottom: 8px;
                color: #d7e4fb;
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

            #pf-diagnostics-overlay .pf-diag-subtitle {
                font-size: 11px;
                font-weight: 700;
                color: #aab8d4;
                margin-bottom: 6px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
            }

            #pf-diagnostics-overlay .pf-diag-thresholds {
                margin-bottom: 8px;
                color: #95a8ca;
                font-size: 11px;
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

            #pf-diagnostics-overlay .pf-diag-actions button:hover {
                border-color: #79d9ff;
                color: #ffffff;
            }
        `;

        document.head.appendChild(style);
    }
}

window.PF_Diagnostics = PF_Diagnostics;
