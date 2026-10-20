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
        this._feedNode = null;
        this._feedReplacementPending = false;
    }

    start() {
        if (this.isObserving) return;

        // Watch the document root, not the current [role="feed"] node.
        // Clicking the Facebook logo (far left) is an in-page route change:
        // React throws away the feed node and mounts a new one. An observer
        // attached to the old node never sees that new feed, so every filter
        // looks like it turned off after returning home.
        const target = document.documentElement || document.body;
        this._feedNode = this._currentFeedNode();

        this.observer = new MutationObserver((mutations) => {
            let shouldProcess = false;
            this.pendingMutationRecords += mutations.length;

            if (this._feedIdentityChanged()) {
                this._feedReplacementPending = true;
                shouldProcess = true;
                const feed = this._feedNode;
                if (feed && this.queuedNodes.size < this.maxQueuedNodes) {
                    this.queuedNodes.add(feed);
                }
            }

            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        // Only process element nodes that might contain content
                        if (node.nodeType === Node.ELEMENT_NODE && this._isProcessableObserverNode(node)) {
                            if (this._isFeedShellNode(node)) {
                                this._feedReplacementPending = true;
                            }
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
        PF_Logger.info('PF_Observer DOM listener attached to document root.');
    }

    stop() {
        if (this.observer) {
            this.observer.disconnect();
            this.isObserving = false;
            this._feedNode = null;
            this._feedReplacementPending = false;
            PF_Logger.info('PF_Observer paused.');
        }
    }

    _currentFeedNode() {
        return document.querySelector('[role="feed"]')
            || document.querySelector('[role="main"]')
            || null;
    }

    _feedIdentityChanged() {
        const next = this._currentFeedNode();
        if (next === this._feedNode) return false;
        this._feedNode = next;
        return !!next;
    }

    _isFeedShellNode(node) {
        if (!node || !node.matches) return false;
        if (node.matches('[role="feed"], [role="main"]')) return true;
        if (!node.querySelector || node.childElementCount < 4) return false;
        return !!node.querySelector('[role="feed"], [role="main"]');
    }

    _processBatch() {
        const feedReplaced = this._feedReplacementPending;
        this._feedReplacementPending = false;

        if (this.queuedNodes.size === 0 && !feedReplaced) return;

        const queued = Array.from(this.queuedNodes);
        const nodeCount = queued.length;
        const mutationRecords = this.pendingMutationRecords;
        this.queuedNodes.clear();
        this.pendingMutationRecords = 0;

        let nodesToProcess = this._prioritizeNodesForDispatch(queued);
        if (feedReplaced) {
            const feed = this._currentFeedNode();
            if (feed && !nodesToProcess.includes(feed)) {
                nodesToProcess = [feed].concat(nodesToProcess).slice(0, this.maxDispatchNodes);
            }
        }
        if (!nodesToProcess.length && !feedReplaced) return;
        const dispatchedCount = nodesToProcess.length;
        const droppedCount = Math.max(0, nodeCount - dispatchedCount);

        // Pass to the master orchestrator or trigger custom events.
        // For architectural decoupling, we dispatch a custom event.
        const startedAt = (typeof performance !== 'undefined' && performance.now)
            ? performance.now()
            : Date.now();

        if (nodesToProcess.length) {
            const event = new CustomEvent('pf:nodes_added', {
                detail: { nodes: nodesToProcess, feedReplaced }
            });
            document.dispatchEvent(event);
        }

        if (feedReplaced) {
            document.dispatchEvent(new CustomEvent('pf:feed_replaced', {
                detail: { ts: Date.now() }
            }));
        }

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

        if (node.matches && node.matches('[data-pf-hidden="true"], [data-pf-insight="true"], .pf-insight-chip, .pf-hidden-chip, [data-pf-processed="true"]')) return false;
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
            // Further verify it's not a sidebar 'suggested' which we handle via different rules
            if (node.closest('[role="complementary"]') && !node.matches('[data-pagelet*="AdUnit"]')) {
                return false;
            }
            return true;
        }

        // Only do nested query if the node is reasonably large or specifically marked
        // This avoids deep scans on tiny UI elements
        if (node.childElementCount < 2) return false;
        
        return !!node.querySelector(highSignalSelector);
    }
}

window.PF_Observer = PF_Observer;
