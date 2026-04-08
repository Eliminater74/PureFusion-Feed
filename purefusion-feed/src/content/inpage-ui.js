/**
 * PureFusion Feed - In-Page UI Dashboard
 * 
 * Injects a floating PureFusion button and an in-page glassmorphism dashboard
 * directly into the Facebook DOM. Allows instant control without using the extension top-bar.
 */

class PF_InPageUI {
    constructor(settings) {
        this.settings = settings;
        this.isOpen = false;
        this.fabDockIntervalId = null;
        this.boundVisibilityHandler = null;
        
        // Prevent multiple injections
        if (!document.getElementById('pf-inpage-container')) {
            this.init();
        }
    }

    _isContextValid() {
        return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
    }

    init() {
        this._injectCSS();
        
        // Container wrapper isolating our UI from Facebook's massive z-indexes
        this.container = document.createElement('div');
        this.container.id = 'pf-inpage-container';
        
        this._buildFAB();
        this._buildDashboardModal();
        
        document.body.appendChild(this.container);
        this._bindEvents();
    }

    updateSettings(settings) {
        this.settings = settings;
    }

    _injectCSS() {
        const style = document.createElement('style');
        style.textContent = `
            #pf-inpage-container {
                /* Deprecated container, we now anchor directly to FB Document */
                display: none;
            }
            .pf-fab {
                width: 40px; height: 40px; border-radius: 999px;
                background: var(--secondary-button-background, #4e4f50);
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; transition: background-color 0.15s ease;
                user-select: none; flex-shrink: 0;
                padding: 0;
                margin-right: 8px;
                border: 0;
            }
            .pf-fab img {
                width: 18px; height: 18px; object-fit: contain;
                opacity: 0.92;
            }
            .pf-fab.pf-fab-fallback {
                color: #f0f2f5;
                font: 700 12px/1 "Segoe UI Variable Text", "Segoe UI", sans-serif;
                letter-spacing: 0.2px;
            }
            .pf-fab:hover {
                background: var(--hover-overlay, #5b5c5e);
            }
            .pf-fab:active {
                background: #66676a;
            }
            
            .pf-modal-overlay {
                display: none; position: fixed;
                top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0,0,0,0.4); backdrop-filter: blur(4px);
                align-items: center; justify-content: center;
            }
            .pf-modal-overlay.open { display: flex; }
            
            .pf-modal {
                background: rgba(20,20,22,0.95); border: 1px solid #3E4042;
                border-radius: 16px; padding: 24px; width: 340px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.8); color: #E4E6EB;
                transform: scale(0.95); opacity: 0; transition: all 0.2s;
            }
            .pf-modal-overlay.open .pf-modal { transform: scale(1); opacity: 1; }
            
            .pf-modal-header {
                display: flex; justify-content: space-between; align-items: center;
                border-bottom: 1px solid #3E4042; padding-bottom: 12px; margin-bottom: 16px;
            }
            .pf-modal-title { font-size: 18px; font-weight: bold; background: -webkit-linear-gradient(#6C3FC5, #00D4FF); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            .pf-close { cursor: pointer; font-size: 20px; color: #B0B3B8; }
            .pf-close:hover { color: white; }

            .pf-modal-row {
                display: flex; justify-content: space-between; align-items: center;
                padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05);
            }
            .pf-modal-row span { font-size: 14px; font-weight: 500; }
            
            /* Native Checkbox styling override for internal use */
            .pf-modal-toggle {
                appearance: none; width: 40px; height: 20px; background: #4a4d52;
                border-radius: 20px; position: relative; cursor: pointer; outline: none; transition: 0.3s;
            }
            .pf-modal-toggle::after {
                content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
                background: #fff; border-radius: 50%; transition: 0.3s;
            }
            .pf-modal-toggle:checked { background: #00D4FF; }
            .pf-modal-toggle:checked::after { transform: translateX(20px); }
            
            .pf-btn-full {
                width: 100%; padding: 12px; margin-top: 20px; background: #6C3FC5;
                color: white; border: none; border-radius: 8px; 
                font-weight: bold; cursor: pointer; box-sizing: border-box;
                display: block; text-decoration: none; text-align: center;
                font-family: sans-serif; font-size: 14px; transition: 0.2s;
            }
            .pf-btn-full:hover { opacity: 0.9; transform: translateY(-1px); }
            
            .pf-btn-support {
                background: rgba(255, 63, 108, 0.15); 
                color: #ff3f6c; 
                border: 1px solid rgba(255, 63, 108, 0.4);
                margin-top: 12px;
            }
            .pf-btn-support:hover {
                background: rgba(255, 63, 108, 0.25);
                border-color: #ff3f6c;
            }
        `;
        document.head.appendChild(style);
    }

    _buildFAB() {
        this.fab = document.createElement('div');
        this.fab.className = 'pf-fab';
        
        const logo = document.createElement('img');
        logo.src = chrome.runtime.getURL('icons/icon32.png');
        logo.alt = 'PF';
        logo.addEventListener('error', () => {
            this.fab.classList.add('pf-fab-fallback');
            this.fab.textContent = 'PF';
        }, { once: true });
        this.fab.appendChild(logo);
        
        const fabLabel = chrome.i18n.getMessage("inpage_fab_title");
        const version = chrome.runtime?.getManifest?.().version;
        this.fab.title = version ? `${fabLabel} (v${version})` : fabLabel;
        
        this.fab.addEventListener('click', () => this.toggleModal());

        this._startFabDockingLoop();
    }

    _dockFabIntoHeader() {
        if (document.hidden) return;
        if (document.contains(this.fab)) return;

        const banner = document.querySelector('[role="banner"]');
        if (!banner || !banner.lastElementChild) return;

        // Try to attach to the inner UL or flex container grouping the icons
        let rightGroup = banner.lastElementChild;
        if (rightGroup.querySelector('ul')) rightGroup = rightGroup.querySelector('ul');
        else if (rightGroup.firstElementChild) rightGroup = rightGroup.firstElementChild;

        rightGroup.prepend(this.fab);
    }

    _startFabDockingLoop() {
        if (this.fabDockIntervalId) return;

        this.fabDockIntervalId = setInterval(() => {
            this._dockFabIntoHeader();
        }, 2000);

        this.boundVisibilityHandler = () => {
            if (!document.hidden) {
                this._dockFabIntoHeader();
            }
        };

        document.addEventListener('visibilitychange', this.boundVisibilityHandler);
        window.addEventListener('beforeunload', () => this._stopFabDockingLoop(), { once: true });

        this._dockFabIntoHeader();
    }

    _stopFabDockingLoop() {
        if (this.fabDockIntervalId) {
            clearInterval(this.fabDockIntervalId);
            this.fabDockIntervalId = null;
        }
        if (this.boundVisibilityHandler) {
            document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
            this.boundVisibilityHandler = null;
        }
    }

    _buildDashboardModal() {
        this.modalOverlay = document.createElement('div');
        this.modalOverlay.className = 'pf-modal-overlay';
        
        this.modalOverlay.innerHTML = `
            <div class="pf-modal">
                <div class="pf-modal-header">
                    <div class="pf-modal-title">${chrome.i18n.getMessage("inpage_modal_title")}</div>
                    <div class="pf-close" id="pf-modal-close">&times;</div>
                </div>
                
                <div class="pf-modal-row">
                    <span>${chrome.i18n.getMessage("inpage_modal_ads")}</span>
                    <input type="checkbox" id="pfm_ads" class="pf-modal-toggle" ${this.settings.filters.removeAds ? 'checked' : ''}>
                </div>
                <div class="pf-modal-row">
                    <span>${chrome.i18n.getMessage("inpage_modal_sugg")}</span>
                    <input type="checkbox" id="pfm_sugg" class="pf-modal-toggle" ${this.settings.filters.removeSuggested ? 'checked' : ''}>
                </div>
                <div class="pf-modal-row">
                    <span>${chrome.i18n.getMessage("inpage_modal_stories")}</span>
                    <input type="checkbox" id="pfm_stor" class="pf-modal-toggle" ${this.settings.filters.hideStories ? 'checked' : ''}>
                </div>
                <div class="pf-modal-row">
                    <span>${chrome.i18n.getMessage("inpage_modal_ai")}</span>
                    <input type="checkbox" id="pfm_ai" class="pf-modal-toggle" ${this.settings.wellbeing.ragebaitDetector ? 'checked' : ''}>
                </div>
                <div class="pf-modal-row">
                    <span>${chrome.i18n.getMessage("inpage_modal_gray")}</span>
                    <input type="checkbox" id="pfm_gray" class="pf-modal-toggle" ${this.settings.wellbeing.grayscaleMode ? 'checked' : ''}>
                </div>
                
                <button class="pf-btn-full" id="pfm_opt">${chrome.i18n.getMessage("common_open_dashboard")}</button>
                <a href="${this.settings.supportUrl}" target="_blank" rel="noopener noreferrer" class="pf-btn-full pf-btn-support">💖 ${chrome.i18n.getMessage("common_support_developer")}</a>
            </div>
        `;
        
        document.body.appendChild(this.modalOverlay);
    }

    _bindEvents() {
        // Modal Handlers
        document.getElementById('pf-modal-close').addEventListener('click', () => this.toggleModal());
        
        this.modalOverlay.addEventListener('mousedown', (e) => {
            // Close if clicking the background transparent overlay
            if (e.target === this.modalOverlay) this.toggleModal();
        });

        // Quick Toggles mapped out to settings via message event
        const toggles = [
            { id: 'pfm_ads', obj: 'filters', prop: 'removeAds' },
            { id: 'pfm_sugg', obj: 'filters', prop: 'removeSuggested' },
            { id: 'pfm_stor', obj: 'filters', prop: 'hideStories' },
            { id: 'pfm_ai', obj: 'wellbeing', prop: 'ragebaitDetector' },
            { id: 'pfm_gray', obj: 'wellbeing', prop: 'grayscaleMode' }
        ];

        toggles.forEach(t => {
            const el = document.getElementById(t.id);
            if (!el) return;
            el.addEventListener('change', async (e) => {
                this.settings[t.obj][t.prop] = e.target.checked;
                // Special case for AI which has two components
                if (t.id === 'pfm_ai') this.settings.wellbeing.clickbaitBlocker = e.target.checked;
                // Special case for suggestions
                if (t.id === 'pfm_sugg') this.settings.filters.hideReels = e.target.checked;

                // Fire sync
                await window.PF_Storage.updateSettings(this.settings);
                
                // Trigger a full sweep simulation immediately
                // We dispatch our own settings updated message so the overarching app catches it 
                // and runs the re-sweep natively.
                window.postMessage({ type: 'PF_LOCAL_SETTINGS_UPDATE' }, '*');
            });
        });

        document.getElementById('pfm_opt').addEventListener('click', () => {
            // Close the quick UI modal
            this.toggleModal();

            // Check if we already created the advanced modal
            if (!document.getElementById('pf-advanced-iframe-modal')) {
                const bg = document.createElement('div');
                bg.id = 'pf-advanced-iframe-modal';
                bg.style.cssText = `
                    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                    background: rgba(0,0,0,0.8); z-index: 2147483647;
                    display: flex; align-items: center; justify-content: center;
                    backdrop-filter: blur(10px);
                `;
                
                // Safety Check: Avoid "Extension context invalidated" on reloads
                if (!this._isContextValid()) {
                    PF_Helpers.showToast('PureFusion was updated. Refresh Facebook to open settings.', 'warn');
                    return;
                }

                // We pull the actual options.html packaged in our extension and embed it seamlessly
                const optionsUrl = chrome.runtime.getURL('src/options/options.html');
                
                bg.innerHTML = `
                    <div style="width: 90%; max-width: 1000px; height: 85vh; background: #1c1e21; border-radius: 12px; overflow: hidden; border: 1px solid #3E4042; display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
                        <div style="display:flex; justify-content: space-between; padding: 12px 20px; background: #242526; border-bottom: 1px solid #3E4042; align-items: center;">
                            <h2 style="margin: 0; color: #00D4FF; font-family: sans-serif; font-size: 18px;">PureFusion Global Settings</h2>
                            <span id="pf-close-advanced" style="cursor: pointer; color: #B0B3B8; font-size: 28px; line-height: 20px;">&times;</span>
                        </div>
                        <iframe src="${optionsUrl}" style="width:100%; flex-grow:1; border:none; background: #18191A;"></iframe>
                    </div>
                `;
                document.body.appendChild(bg);
                
                // Allow closing the massive modal
                document.getElementById('pf-close-advanced').addEventListener('click', () => bg.remove());
            }
        });
    }

    toggleModal() {
        this.isOpen = !this.isOpen;
        if (this.isOpen) {
            this.modalOverlay.classList.add('open');
        } else {
            this.modalOverlay.classList.remove('open');
        }
    }
}

window.PF_InPageUI = PF_InPageUI;
