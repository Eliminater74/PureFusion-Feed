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
        this.maxQueuedNodes = 450;
        this.maxDispatchNodes = 260;
        
        // Use the debounced helper to prevent locking up the main thread
        // grouping multiple node insertions into a single batch 150ms window.
        this.processBatch = PF_Helpers.debounce(this._processBatch.bind(this), 150);
        this.queuedNodes = new Set();
        this.pendingMutationRecords = 0;
    }

    start() {
        if (this.isObserving) return;

        // Try to attach directly to the main feed wrapper to limit scope,
        // but fallback to body if navigation hasn't finished.
        const target = document.querySelector(PF_SELECTOR_MAP.mainFeedRegion) || document.body;

        this.observer = new MutationObserver((mutations) => {
            let shouldProcess = false;
            this.pendingMutationRecords += mutations.length;

            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        // Only process element nodes that might contain content
                        if (node.nodeType === Node.ELEMENT_NODE && this._isProcessableObserverNode(node)) {
                            if (this.queuedNodes.size >= this.maxQueuedNodes) return;
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

        const queued = Array.from(this.queuedNodes);
        const nodeCount = queued.length;
        const mutationRecords = this.pendingMutationRecords;
        this.queuedNodes.clear();
        this.pendingMutationRecords = 0;

        const nodesToProcess = this._prioritizeNodesForDispatch(queued);
        if (!nodesToProcess.length) return;
        const dispatchedCount = nodesToProcess.length;
        const droppedCount = Math.max(0, nodeCount - dispatchedCount);

        // Pass to the master orchestrator or trigger custom events.
        // For architectural decoupling, we dispatch a custom event.
        const startedAt = (typeof performance !== 'undefined' && performance.now)
            ? performance.now()
            : Date.now();

        const event = new CustomEvent('pf:nodes_added', { detail: { nodes: nodesToProcess } });
        document.dispatchEvent(event);

        const endedAt = (typeof performance !== 'undefined' && performance.now)
            ? performance.now()
            : Date.now();
        const durationMs = Math.max(0, endedAt - startedAt);

        try {
            window.dispatchEvent(new CustomEvent('pf:observer_batch', {
                detail: {
                    nodes: nodeCount,
                    dispatchedNodes: dispatchedCount,
                    droppedNodes: droppedCount,
                    mutationRecords,
                    durationMs,
                    ts: Date.now()
                }
            }));
        } catch (err) {
            // no-op when diagnostics event dispatch is unavailable
        }
    }

    _isProcessableObserverNode(node) {
        if (!node || !node.tagName) return false;

        const tag = node.tagName.toUpperCase();
        if (['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'PATH', 'USE', 'DEFS', 'TITLE'].includes(tag)) {
            return false;
        }

        if (node.matches && node.matches('[data-pf-hidden="true"]')) return false;
        return true;
    }

    _prioritizeNodesForDispatch(nodes) {
        if (!Array.isArray(nodes) || nodes.length === 0) return [];

        const max = this.maxDispatchNodes;
        if (nodes.length <= max) return nodes;

        const highSignal = [];
        const normal = [];

        nodes.forEach((node) => {
            if (this._isHighSignalNode(node)) highSignal.push(node);
            else normal.push(node);
        });

        const selected = highSignal.slice(0, max);
        if (selected.length < max) {
            selected.push(...normal.slice(0, max - selected.length));
        }

        return selected;
    }

    _isHighSignalNode(node) {
        if (!node || !node.matches) return false;

        // Combined selector for common structural roots
        const highSignalSelector = '[data-pagelet*="FeedUnit"], [data-pagelet*="AdUnit"], [role="article"], [role="dialog"], [role="navigation"], [role="complementary"]';
        
        if (node.matches(highSignalSelector)) {
            return true;
        }

        // Only do nested query if the node is reasonably large or specifically marked
        // This avoids deep scans on tiny UI elements
        if (node.childElementCount < 2) return false;
        
        return !!node.querySelector(highSignalSelector);
    }
}

window.PF_Observer = PF_Observer;
