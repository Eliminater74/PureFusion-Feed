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
        
        // Prevent multiple injections
        if (!document.getElementById('pf-inpage-container')) {
            this.init();
        }
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

    _injectCSS() {
        const style = document.createElement('style');
        style.textContent = `
            #pf-inpage-container {
                position: fixed; z-index: 2147483647; /* Absolute max z-index */
                bottom: 20px; left: 20px;
                font-family: -apple-system, system-ui, sans-serif;
            }
            .pf-fab {
                width: 50px; height: 50px; border-radius: 25px;
                background: linear-gradient(135deg, #6C3FC5, #00D4FF);
                box-shadow: 0 4px 15px rgba(108,63,197,0.6);
                display: flex; align-items: center; justify-content: center;
                color: white; font-weight: 900; font-size: 18px;
                cursor: pointer; transition: transform 0.2s;
                user-select: none;
            }
            .pf-fab:hover { transform: scale(1.05); }
            
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
                color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;
            }
        `;
        document.head.appendChild(style);
    }

    _buildFAB() {
        this.fab = document.createElement('div');
        this.fab.className = 'pf-fab';
        this.fab.textContent = 'PF';
        this.fab.title = "Open PureFusion Dashboard";
        
        // Simple drag logic
        let isDragging = false;
        let startY, startX, initialY, initialX;
        
        this.fab.addEventListener('mousedown', (e) => {
            isDragging = false;
            startX = e.clientX; startY = e.clientY;
            initialX = this.fab.offsetLeft; initialY = this.fab.offsetTop;

            const onMouseMove = (moveEvent) => {
                isDragging = true;
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                const newX = initialX + dx;
                const newY = initialY + dy;
                // Boundaries
                if (newX > 0 && newX < window.innerWidth - 50) this.fab.style.left = newX + 'px';
                if (newY > 0 && newY < window.innerHeight - 50) this.fab.style.top = newY + 'px';
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        // Click logic (only if not dragged)
        this.fab.addEventListener('click', (e) => {
            if (!isDragging) this.toggleModal();
        });

        this.container.appendChild(this.fab);
    }

    _buildDashboardModal() {
        this.modalOverlay = document.createElement('div');
        this.modalOverlay.className = 'pf-modal-overlay';
        
        this.modalOverlay.innerHTML = `
            <div class="pf-modal">
                <div class="pf-modal-header">
                    <div class="pf-modal-title">PureFusion Panel</div>
                    <div class="pf-close" id="pf-modal-close">&times;</div>
                </div>
                
                <div class="pf-modal-row">
                    <span>Block Ads & Sponsored</span>
                    <input type="checkbox" id="pfm_ads" class="pf-modal-toggle" ${this.settings.filters.removeAds ? 'checked' : ''}>
                </div>
                <div class="pf-modal-row">
                    <span>Hide Suggestions & Reels</span>
                    <input type="checkbox" id="pfm_sugg" class="pf-modal-toggle" ${this.settings.filters.removeSuggested ? 'checked' : ''}>
                </div>
                <div class="pf-modal-row">
                    <span>AI Rage/Clickbait Filter</span>
                    <input type="checkbox" id="pfm_ai" class="pf-modal-toggle" ${this.settings.wellbeing.ragebaitDetector ? 'checked' : ''}>
                </div>
                <div class="pf-modal-row">
                    <span>Grayscale Mode</span>
                    <input type="checkbox" id="pfm_gray" class="pf-modal-toggle" ${this.settings.wellbeing.grayscaleMode ? 'checked' : ''}>
                </div>
                
                <button class="pf-btn-full" id="pfm_opt">Advanced Settings</button>
            </div>
        `;
        
        this.container.appendChild(this.modalOverlay);
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
                window.postMessage({ type: 'PF_LOCAL_SETTINGS_UDPATE' }, '*');
            });
        });

        document.getElementById('pfm_opt').addEventListener('click', () => {
            if (typeof chrome !== 'undefined' && chrome.runtime) {
                chrome.runtime.sendMessage({ action: "openOptionsPage" });
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
