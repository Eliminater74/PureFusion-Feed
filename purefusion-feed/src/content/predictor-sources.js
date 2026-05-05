/**
 * PureFusion Feed - Predictor Sources
 *
 * Extends PF_Predictor (defined in predictor-engine.js) with methods responsible
 * for persisting and querying the author blocklist and allowlist.  These lists
 * survive page reloads via local storage and are consulted during the scoring
 * and refresh phases of the prediction pipeline.
 *
 * Must be loaded AFTER predictor-engine.js.
 */

if (!window.PF_Predictor) throw new Error('PF: predictor-engine.js must be loaded before predictor-sources.js');

// Extends PF_Predictor — defined in predictor-engine.js
Object.assign(window.PF_Predictor.prototype, {

    _saveBlocklist() {
        PF_Storage.setLocalData('pf_blocklist', Array.from(this.blocklist)).catch(() => {});
    },

    _saveAllowlist() {
        PF_Storage.setLocalData('pf_allowlist', Array.from(this.allowlist)).catch(() => {});
    },

    /** Returns true if the post's author is in the persistent allowlist. */
    _isAllowlisted(node) {
        if (!node || this.allowlist.size === 0) return false;
        const author = this._extractAuthor(node);
        return !!(author && author !== 'Unknown' && this.allowlist.has(author));
    },

});
