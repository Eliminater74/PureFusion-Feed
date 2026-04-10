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
        this.boundHiddenHandler = this._onElementHidden.bind(this);
        this.boundResweepHandler = this._onResweepPass.bind(this);
        this.boundSettingsUpdateHandler = this._onSettingsUpdate.bind(this);

        window.addEventListener('pf:element_hidden', this.boundHiddenHandler);
        window.addEventListener('pf:resweep_pass', this.boundResweepHandler);
        window.addEventListener('pf:settings_update', this.boundSettingsUpdateHandler);
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
            <div class="pf-diag-subtitle">Top hide reasons</div>
            <ol id="pfDiagReasons" class="pf-diag-list"></ol>
        `;

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
        if (!totalEl || !listEl || !syncEl || !resweepEl || !followupsEl || !lastSyncEl || !lastResweepEl) return;

        totalEl.textContent = String(this.hiddenTotal);
        syncEl.textContent = String(this.settingsUpdateCount);
        resweepEl.textContent = String(this.liveResweepTotal);
        followupsEl.textContent = String(this.liveResweepFollowups);
        lastSyncEl.textContent = this._formatTime(this.lastSettingsUpdateAt);
        lastResweepEl.textContent = this._formatTime(this.lastResweepAt);

        const maxReasons = Math.max(1, Math.min(12, Number(this.settings?.diagnostics?.maxReasons || 6)));
        const top = Array.from(this.reasonCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxReasons);

        listEl.innerHTML = top.length
            ? top.map(([reason, count]) => `<li><span>${this._escapeHtml(reason)}</span><strong>${count}</strong></li>`).join('')
            : '<li><span>No hide actions yet.</span><strong>0</strong></li>';
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
        `;

        document.head.appendChild(style);
    }
}

window.PF_Diagnostics = PF_Diagnostics;
