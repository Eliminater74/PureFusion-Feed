/**
 * PureFusion Feed - Marketplace Local Filter
 *
 * Injects a distance-based filter overlay on Facebook Marketplace pages.
 * Parses distance text from listing cards, hides listings beyond a configurable
 * max distance, and re-sorts visible listings by proximity (local-first).
 *
 * All filtering is client-side only — the server-side search radius cannot be
 * modified by this extension. Only listings already returned by Facebook are
 * affected; the server will not return closer results because of this filter.
 */

class PF_MarketplaceFilter {
    constructor(settings) {
        this.settings = settings;
        this.observer = null;
        this.overlay = null;
        this._debounceTimer = null;
        this._parseCache = new WeakMap();

        if (this._isMarketplacePage()) {
            this._injectStyles();
            if (this._isEnabled()) {
                this._ensureOverlay();
                this._startObserver();
                this._applyFilter();
            }
        }
    }

    updateSettings(settings) {
        this.settings = settings;
        if (!this._isMarketplacePage()) return;

        if (this._isEnabled()) {
            this._injectStyles();
            this._ensureOverlay();
            this._startObserver();
            this._applyFilter();
        } else {
            this._removeOverlay();
            this._clearFilter();
            this._stopObserver();
        }
    }

    sweepDocument() {
        if (!this._isMarketplacePage() || !this._isEnabled()) return;
        this._ensureOverlay();
        this._startObserver();
        this._applyFilter();
    }

    applyToNodes() {
        // Called by the main observer pipeline on DOM mutations.
        // We rely on our own MutationObserver for granular updates,
        // so just trigger a debounced re-filter here.
        if (!this._isMarketplacePage() || !this._isEnabled()) return;
        this._debouncedApplyFilter();
    }

    destroy() {
        this._stopObserver();
        this._removeOverlay();
        this._clearFilter();
        const styleEl = document.getElementById('pf-marketplace-styles');
        if (styleEl) styleEl.remove();
    }

    // ── Page detection ───────────────────────────────────────────────────────

    _isMarketplacePage() {
        return /^\/marketplace/i.test(window.location.pathname);
    }

    _isEnabled() {
        return !!(this.settings?.enabled !== false && this.settings?.marketplace?.enabled);
    }

    // ── Overlay ──────────────────────────────────────────────────────────────

    _ensureOverlay() {
        if (this.overlay && document.contains(this.overlay)) return;
        this._buildOverlay();
    }

    _buildOverlay() {
        const stale = document.getElementById('pf-marketplace-overlay');
        if (stale) stale.remove();

        const mpSettings = this.settings?.marketplace || {};
        const maxDist = Math.min(Math.max(Number(mpSettings.maxDistanceMiles) || 25, 5), 100);
        const hideUnknown = !!mpSettings.hideUnknownDistance;

        const overlay = document.createElement('div');
        overlay.id = 'pf-marketplace-overlay';
        overlay.innerHTML = `
            <div class="pf-mp-header">
                <span class="pf-mp-icon">📍</span>
                <span class="pf-mp-title">PF Local Filter</span>
                <span id="pf-mp-count" class="pf-mp-count"></span>
            </div>
            <div class="pf-mp-body">
                <div class="pf-mp-row">
                    <span class="pf-mp-label">Max distance</span>
                    <input type="range" id="pf-mp-slider" class="pf-mp-slider"
                        min="5" max="100" step="5" value="${maxDist}">
                    <span id="pf-mp-dist-label" class="pf-mp-dist-label">${maxDist >= 100 ? 'No limit' : maxDist + ' mi'}</span>
                </div>
                <div class="pf-mp-row pf-mp-row-checks">
                    <label class="pf-mp-check-label">
                        <input type="checkbox" id="pf-mp-sort" checked>
                        Local-first sort
                    </label>
                    <label class="pf-mp-check-label">
                        <input type="checkbox" id="pf-mp-hide-unknown" ${hideUnknown ? 'checked' : ''}>
                        Hide unknown distance
                    </label>
                </div>
                <p class="pf-mp-note">Client-side only — filters what Facebook already returned. Cannot change server search radius.</p>
            </div>
        `;
        this.overlay = overlay;

        // Wire up controls
        const slider = overlay.querySelector('#pf-mp-slider');
        const distLabel = overlay.querySelector('#pf-mp-dist-label');
        const sortToggle = overlay.querySelector('#pf-mp-sort');
        const hideUnknownToggle = overlay.querySelector('#pf-mp-hide-unknown');

        slider.addEventListener('input', () => {
            const val = parseInt(slider.value, 10);
            distLabel.textContent = val >= 100 ? 'No limit' : `${val} mi`;
        });

        slider.addEventListener('change', async () => {
            const val = parseInt(slider.value, 10);
            if (!this.settings.marketplace) this.settings.marketplace = {};
            this.settings.marketplace.maxDistanceMiles = val;
            this._parseCache = new WeakMap();
            await PF_Storage.updateSettings(this.settings).catch(() => {});
            this._applyFilter();
        });

        sortToggle.addEventListener('change', () => this._applyFilter());

        hideUnknownToggle.addEventListener('change', async () => {
            if (!this.settings.marketplace) this.settings.marketplace = {};
            this.settings.marketplace.hideUnknownDistance = hideUnknownToggle.checked;
            await PF_Storage.updateSettings(this.settings).catch(() => {});
            this._applyFilter();
        });

        // Inject as first child of [role="main"] so it stays above the listing grid
        const anchor = document.querySelector('[role="main"]') || document.body;
        anchor.insertBefore(overlay, anchor.firstChild);
    }

    _removeOverlay() {
        if (this.overlay) { this.overlay.remove(); this.overlay = null; }
        const stale = document.getElementById('pf-marketplace-overlay');
        if (stale) stale.remove();
    }

    // ── Listing detection and distance parsing ───────────────────────────────

    _getListings() {
        // Marketplace listing cards are <a> elements linking to /marketplace/item/...
        // Deduplicate by href to avoid applying sort/filter to the same card twice
        // (some cards appear in featured + grid positions simultaneously).
        const seen = new Set();
        return Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]'))
            .filter((el) => {
                const href = el.getAttribute('href') || '';
                if (seen.has(href)) return false;
                seen.add(href);
                return true;
            });
    }

    _parseDistanceMiles(listing) {
        if (this._parseCache.has(listing)) return this._parseCache.get(listing);

        const text = listing.textContent || '';

        // "Local pickup" → 0 mi (always nearest, always show)
        if (/\blocal\s+pickup\b/i.test(text)) {
            this._parseCache.set(listing, 0);
            return 0;
        }

        // Miles: "47 miles away", "47 mi away", "47 mi", "47.5 miles"
        const miMatch = text.match(/(\d+(?:\.\d+)?)\s*mi(?:les?)?\b/i);
        if (miMatch) {
            const dist = parseFloat(miMatch[1]);
            this._parseCache.set(listing, dist);
            return dist;
        }

        // Kilometers: "12 km away", "12 km", "12 kilometers" → convert to miles
        const kmMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:km\b|kilometers?)\b/i);
        if (kmMatch) {
            const dist = parseFloat(kmMatch[1]) * 0.621371;
            this._parseCache.set(listing, dist);
            return dist;
        }

        this._parseCache.set(listing, null);
        return null; // unknown distance
    }

    // ── Filter and sort ──────────────────────────────────────────────────────

    _applyFilter() {
        if (!this.overlay) return;

        const mpSettings = this.settings?.marketplace || {};
        const maxDist = Number(
            this.overlay.querySelector('#pf-mp-slider')?.value
            ?? mpSettings.maxDistanceMiles
            ?? 25
        );
        const noLimit = maxDist >= 100;
        const hideUnknown = !!(this.overlay.querySelector('#pf-mp-hide-unknown')?.checked
            ?? mpSettings.hideUnknownDistance);
        const sortEnabled = this.overlay.querySelector('#pf-mp-sort')?.checked !== false;

        const listings = this._getListings();
        let shown = 0;
        let hidden = 0;
        const visible = [];

        listings.forEach((listing) => {
            const dist = this._parseDistanceMiles(listing);

            const shouldHide =
                (dist === null && hideUnknown) ||
                (!noLimit && dist !== null && dist > maxDist);

            // Apply to parent cell (grid item wrapper) when available so the
            // `order` / `display` change affects the flex/grid layout correctly.
            const cell = listing.parentElement || listing;

            if (shouldHide) {
                cell.style.setProperty('display', 'none', 'important');
                cell.style.removeProperty('order');
                hidden++;
            } else {
                cell.style.removeProperty('display');
                shown++;
                if (sortEnabled) visible.push({ cell, dist: dist ?? 9999 });
            }
        });

        // Local-first sort via CSS flexbox/grid order property.
        // Applied to the grid cell wrapper so it works regardless of whether
        // the <a> itself or its parent is the flex/grid item.
        if (sortEnabled) {
            visible.sort((a, b) => a.dist - b.dist);
            visible.forEach((entry, i) => {
                entry.cell.style.order = i;
            });
        }

        // Update count badge
        const countEl = this.overlay.querySelector('#pf-mp-count');
        if (countEl) {
            const total = shown + hidden;
            if (hidden > 0) {
                countEl.textContent = `${shown} / ${total} shown`;
                countEl.style.cssText = 'background:rgba(239,68,68,0.15);border-color:rgba(239,68,68,0.35);color:#ff8a8a';
            } else {
                countEl.textContent = total > 0 ? `${total} listings` : '';
                countEl.style.cssText = '';
            }
        }
    }

    _clearFilter() {
        // Re-show all listings and remove order overrides
        document.querySelectorAll('a[href*="/marketplace/item/"]').forEach((el) => {
            const cell = el.parentElement || el;
            cell.style.removeProperty('display');
            cell.style.removeProperty('order');
        });
    }

    _debouncedApplyFilter() {
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this._parseCache = new WeakMap();
            this._applyFilter();
        }, 450);
    }

    // ── Observer ─────────────────────────────────────────────────────────────

    _startObserver() {
        if (this.observer || typeof MutationObserver === 'undefined') return;

        const target = document.querySelector('[role="main"]') || document.body;
        this.observer = new MutationObserver(() => {
            if (!this._isEnabled()) return;
            this._debouncedApplyFilter();
        });
        this.observer.observe(target, { childList: true, subtree: true });
    }

    _stopObserver() {
        if (this.observer) { this.observer.disconnect(); this.observer = null; }
    }

    // ── Styles ───────────────────────────────────────────────────────────────

    _injectStyles() {
        if (document.getElementById('pf-marketplace-styles')) return;

        const style = document.createElement('style');
        style.id = 'pf-marketplace-styles';
        style.textContent = `
            #pf-marketplace-overlay {
                position: fixed;
                top: 72px;
                right: 20px;
                z-index: 9998;
                background: linear-gradient(135deg, rgba(18, 22, 33, 0.97) 0%, rgba(24, 28, 42, 0.97) 100%);
                border: 1px solid rgba(122, 132, 156, 0.28);
                border-radius: 12px;
                padding: 10px 14px 12px;
                min-width: 224px;
                max-width: 272px;
                box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(108, 63, 197, 0.12);
                font-family: "Segoe UI Variable Text", "Segoe UI", Verdana, sans-serif;
                color: #eef2fb;
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
            }

            .pf-mp-header {
                display: flex;
                align-items: center;
                gap: 6px;
                margin-bottom: 10px;
            }
            .pf-mp-icon { font-size: 14px; flex-shrink: 0; }
            .pf-mp-title {
                font-size: 12px;
                font-weight: 700;
                letter-spacing: 0.2px;
                flex: 1;
            }
            .pf-mp-count {
                font-size: 10px;
                font-weight: 700;
                padding: 2px 7px;
                border-radius: 999px;
                background: rgba(18, 200, 220, 0.12);
                border: 1px solid rgba(18, 200, 220, 0.32);
                color: #a9f1ff;
                white-space: nowrap;
                min-width: 32px;
                text-align: center;
                transition: background 0.2s, border-color 0.2s, color 0.2s;
            }

            .pf-mp-body { display: flex; flex-direction: column; gap: 8px; }

            .pf-mp-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .pf-mp-row-checks { flex-wrap: wrap; gap: 5px 10px; }

            .pf-mp-label {
                font-size: 11px;
                color: #a9b3c8;
                white-space: nowrap;
                flex-shrink: 0;
            }

            .pf-mp-slider {
                flex: 1;
                -webkit-appearance: none;
                appearance: none;
                height: 4px;
                border-radius: 2px;
                background: linear-gradient(90deg, rgba(108, 63, 197, 0.6), rgba(79, 118, 207, 0.5));
                outline: none;
                cursor: pointer;
            }
            .pf-mp-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: linear-gradient(135deg, #6C3FC5, #4f76cf);
                cursor: pointer;
                box-shadow: 0 0 6px rgba(108, 63, 197, 0.55);
                transition: transform 0.15s;
            }
            .pf-mp-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }
            .pf-mp-slider::-moz-range-thumb {
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: linear-gradient(135deg, #6C3FC5, #4f76cf);
                cursor: pointer;
                border: none;
            }

            .pf-mp-dist-label {
                font-size: 11px;
                font-weight: 700;
                color: #12c8dc;
                min-width: 44px;
                text-align: right;
            }

            .pf-mp-check-label {
                display: flex;
                align-items: center;
                gap: 5px;
                font-size: 11px;
                color: #a9b3c8;
                cursor: pointer;
                user-select: none;
                white-space: nowrap;
            }
            .pf-mp-check-label input[type="checkbox"] { cursor: pointer; accent-color: #6C3FC5; }

            .pf-mp-note {
                font-size: 10px;
                color: #5a6478;
                margin: 0;
                line-height: 1.4;
                border-top: 1px solid rgba(122, 132, 156, 0.15);
                padding-top: 7px;
            }
        `;
        document.head.appendChild(style);
    }
}

window.PF_MarketplaceFilter = PF_MarketplaceFilter;
