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
    }

    updateSettings(settings) {
        this.settings = settings;
        this.initDocumentLevel();
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
        breakWall.style.cssText = `
            margin: 40px auto; padding: 40px 20px; text-align: center;
            background: linear-gradient(135deg, rgba(20,20,21,1) 0%, rgba(30,30,32,1) 100%);
            border: 2px solid #ff4444; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            color: white; max-width: 600px; font-family: -apple-system, system-ui, sans-serif;
        `;
        breakWall.innerHTML = `
            <div style="font-size: 32px; margin-bottom: 10px;">🛑 Take a Breath</div>
            <p style="color: #B0B3B8; font-size: 16px; margin-bottom: 20px;">
                You've just scrolled past <strong>${this.scrollCount}</strong> posts. 
                PureFusion has temporarily paused the feed to help you avoid doom-scrolling. 
                Is it time to do something else?
            </p>
            <button id="pf-btn-resume" style="
                background: #6C3FC5; color: white; border: none; padding: 12px 24px;
                font-size: 14px; font-weight: bold; border-radius: 8px; cursor: pointer;
                transition: background 0.2s;
            ">Continue Scrolling Anyway</button>
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
        if (document.getElementById('pf-session-timer')) return;

        const timerEl = document.createElement('div');
        timerEl.id = 'pf-session-timer';
        timerEl.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 9999;
            background: rgba(20, 20, 21, 0.85); backdrop-filter: blur(8px);
            border: 1px solid #3E4042; border-radius: 20px; padding: 8px 16px;
            color: #E4E6EB; font-family: monospace; font-size: 13px; font-weight: bold;
            display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            pointer-events: none;
        `;
        
        const dot = document.createElement('div');
        dot.style.cssText = `width: 8px; height: 8px; border-radius: 50%; background: #00D4FF; box-shadow: 0 0 8px #00D4FF;`;
        
        const timeText = document.createElement('span');
        timeText.textContent = "00:00";

        timerEl.appendChild(dot);
        timerEl.appendChild(timeText);
        document.body.appendChild(timerEl);

        this.timerIntervalId = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.sessionStart) / 1000);
            const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const s = (elapsed % 60).toString().padStart(2, '0');
            timeText.textContent = `Session: ${m}:${s}`;
            
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
}

window.PF_Wellbeing = PF_Wellbeing;
