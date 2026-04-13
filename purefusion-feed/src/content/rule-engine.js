/**
 * PureFusion Feed - Power-User Rule Engine
 * 
 * Handles custom 'hide' rules defined by the user. 
 * Allows targeting specific DOM selectors or text patterns.
 */

class PF_RuleEngine {
    constructor(settings) {
        this.settings = settings;
    }

    updateSettings(settings) {
        this.settings = settings;
    }

    /**
     * Applies all active custom rules to a root node.
     * @param {HTMLElement} rootNode 
     */
    applyRules(rootNode) {
        if (!this.settings?.rules?.customRules?.length) return;
        if (!rootNode || !rootNode.querySelectorAll) return;

        const activeRules = this.settings.rules.customRules.filter(r => r.enabled);
        if (!activeRules.length) return;

        activeRules.forEach(rule => {
            try {
                if (rule.type === 'selector' && rule.selector) {
                    this._applySelectorRule(rootNode, rule);
                } else if (rule.type === 'text' && rule.selector) {
                    this._applyTextRule(rootNode, rule);
                }
            } catch (err) {
                // Silently fail on invalid selectors to prevent crashing the extension
                if (window.PF_Logger) window.PF_Logger.warn(`Rule Engine: Error applying rule "${rule.label || rule.id}":`, err);
            }
        });
    }

    _applySelectorRule(rootNode, rule) {
        const targets = rootNode.querySelectorAll(rule.selector);
        targets.forEach(target => {
            if (target.dataset.pfRuleHidden) return;
            
            // Mark as hidden by rule engine
            target.dataset.pfRuleHidden = 'true';
            target.dataset.pfRuleId = rule.id;
            
            // Apply hiding style
            target.style.display = 'none';
            target.style.setProperty('display', 'none', 'important');
            
            if (window.PF_Logger && this.settings.diagnostics?.enabled) {
                window.PF_Logger.log(`Rule Engine: Hidden element via selector "${rule.selector}" (Rule: ${rule.label || rule.id})`);
            }
        });
    }

    _applyTextRule(rootNode, rule) {
        // Text rules usually need a wrapper to hide (e.g. "Hide any div[role='article'] containing 'word'")
        // If no wrapper is specified in the rule, we use standard post containers as a default safety.
        const wrapperSelector = rule.wrapper || PF_SELECTOR_MAP.postContainer || '[role="article"]';
        const candidates = rootNode.querySelectorAll(wrapperSelector);
        const searchPhrase = rule.selector.toLowerCase();

        candidates.forEach(candidate => {
            if (candidate.dataset.pfRuleHidden) return;
            if (candidate.textContent.toLowerCase().includes(searchPhrase)) {
                candidate.dataset.pfRuleHidden = 'true';
                candidate.dataset.pfRuleId = rule.id;
                candidate.style.display = 'none';
                candidate.style.setProperty('display', 'none', 'important');

                if (window.PF_Logger && this.settings.diagnostics?.enabled) {
                    window.PF_Logger.log(`Rule Engine: Hidden element containing text "${rule.selector}" (Rule: ${rule.label || rule.id})`);
                }
            }
        });
    }
}

// Global export for content-script injection
window.PF_RuleEngine = PF_RuleEngine;
