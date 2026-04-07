/**
 * PureFusion Feed - Mutation Observer
 * 
 * Watches the DOM for dynamic node insertions. Whenever Facebook injects
 * new posts as the user scrolls, this observer intercepts them and proxies
 * them to our designated handlers (cleaner, predictor, feed-manager).
 */

class PF_Observer {
    constructor() {
        this.observer = null;
        this.isObserving = false;
        
        // Use the debounced helper to prevent locking up the main thread
        // grouping multiple node insertions into a single batch 150ms window.
        this.processBatch = PF_Helpers.debounce(this._processBatch.bind(this), 150);
        this.queuedNodes = new Set();
    }

    start() {
        if (this.isObserving) return;

        // Try to attach directly to the main feed wrapper to limit scope,
        // but fallback to body if navigation hasn't finished.
        const target = document.querySelector(PF_SELECTOR_MAP.mainFeedRegion) || document.body;

        this.observer = new MutationObserver((mutations) => {
            let shouldProcess = false;

            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        // Only process element nodes that might contain content
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.queuedNodes.add(node);
                            shouldProcess = true;
                        }
                    });
                }
            }

            if (shouldProcess) {
                this.processBatch();
            }
        });

        this.observer.observe(target, {
            childList: true,
            subtree: true
        });

        this.isObserving = true;
        PF_Logger.info("PF_Observer DOM listener attached.");
    }

    stop() {
        if (this.observer) {
            this.observer.disconnect();
            this.isObserving = false;
            PF_Logger.info("PF_Observer paused.");
        }
    }

    _processBatch() {
        if (this.queuedNodes.size === 0) return;

        const nodesToProcess = Array.from(this.queuedNodes);
        this.queuedNodes.clear();

        // Pass to the master orchestrator or trigger custom events.
        // For architectural decoupling, we dispatch a custom event.
        const event = new CustomEvent('pf:nodes_added', { detail: { nodes: nodesToProcess } });
        document.dispatchEvent(event);
    }
}

window.PF_Observer = PF_Observer;
