/**
 * PureFusion Feed - Cleaner Ads
 *
 * Extends PF_Cleaner (defined in cleaner-core.js) with methods responsible for
 * detecting and removing Facebook ad units and sponsored posts.  Covers both
 * hard-signal ad detection (exclusive FB ad infrastructure markers) and
 * soft-signal sponsored-label heuristics, as well as right-rail ad removal.
 *
 * Must be loaded AFTER cleaner-core.js.
 */

if (!window.PF_Cleaner) throw new Error('PF: cleaner-core.js must be loaded before cleaner-ads.js');

// Extends PF_Cleaner — defined in cleaner-core.js
Object.assign(window.PF_Cleaner.prototype, {

    /**
     * Hard ad-infrastructure signal scan (controlled by filters.removeAds).
     * Only matches FB ad-exclusive href markers and testid attributes.
     * These never appear on organic posts — zero false-positive risk.
     */
    _removeAdsByHardSignals(rootNode) {
        // Step 1: Direct AdUnit_ pagelet targeting.
        // Facebook uses [data-pagelet^="AdUnit_"] exclusively for feed ad units.
        // Hiding the pagelet wrapper (not just the inner article) prevents blank-space
        // artifacts and catches all ad formats — native, carousel, and video — with
        // zero false-positive risk. No inner scan needed for these containers.
        rootNode.querySelectorAll('[data-pagelet^="AdUnit_"]').forEach((adUnit) => {
            if (adUnit.dataset.pfHidden) return;
            this._hidePostNode(adUnit, 'Ad (Hard Signal)');
        });

        // Step 2: Article-level scan for ads not enclosed in an AdUnit_ pagelet.
        // Some FB variants serve sponsored content inside FeedUnit_ wrappers with
        // no dedicated pagelet identifier — these must be detected via inner signals.
        rootNode.querySelectorAll('[role="article"]').forEach((article) => {
            if (article.parentElement?.closest('[role="article"]')) return; // nested/comment
            if (article.closest('[role="complementary"]')) return;          // sidebar
            if (article.dataset.pfHidden) return;
            if (article.closest('[data-pagelet^="AdUnit_"]')) return;       // handled in Step 1

            const adSignal = article.querySelector([
                // Ad explanation page links (various FB domains)
                'a[href*="/ads/about"]',
                'a[href*="ad_preferences"]',
                'a[href*="about_ads"]',
                'a[href*="adchoices"]',
                'a[href*="adabouturl"]',
                'a[href*="facebook.com/ads"]',
                'a[href*="fb.com/ads"]',
                // Content Flow Token (_cft_) in href = Facebook ad tracking parameter.
                // FB appends this exclusively to links inside sponsored posts.
                // Both uppercase (%5B) and lowercase (%5b) percent-encoding variants covered.
                'a[href*="_cft_[0]"]',
                'a[href*="_cft_%5B0%5D"]',
                'a[href*="_cft_%5b0%5d"]',
                // testid fallbacks — confirmed FB ad container markers.
                '[data-testid="fbfeed_ads_native_container"]',
                '[data-testid="ad_boundary"]',
                // NOTE: [attributionsrc], [data-ad-rendering-role] removed —
                // both appear on organic comment profile links, not exclusive to ads.
            ].join(', '));

            if (adSignal) this._hidePostNode(article, 'Ad (Hard Signal)');
        });
    },

    /**
     * Soft "Sponsored" label detection (controlled by filters.removeSponsored).
     * Uses locale-aware text selectors, aria-labelledby, and post-level fallback.
     * More aggressive but less precise — kept separate for independent testing/tuning.
     *
     * data-ad-preview scan — DISABLED.
     * Facebook uses data-ad-preview on both ad post bodies AND comment text containers.
     * There is no reliable way to distinguish the two without false-positive comment hiding.
     */
    _removeSponsoredByLabels(rootNode) {
        let targets = [];

        // 1. Standard selector / locale token heuristic
        for (const selector of PF_SELECTOR_MAP.sponsoredIndicators) {
            if (selector.includes(':contains')) {
                const text = selector.match(/:contains\("([^"]+)"\)/)[1];
                const parts = selector.split(':');
                const baseSelector = parts[0];
                targets = targets.concat(PF_Helpers.findContains(rootNode, baseSelector, text));
            } else {
                targets = targets.concat(Array.from(rootNode.querySelectorAll(selector)));
            }
        }

        // 2a. aria-labelledby heuristic
        // FB often uses: <span aria-labelledby="some-id"></span> ... <span id="some-id">Sponsored</span>
        const labeledElements = rootNode.querySelectorAll('[aria-labelledby]');
        labeledElements.forEach(el => {
            const labelId = el.getAttribute('aria-labelledby');
            const labelNode = document.getElementById(labelId);
            if (labelNode && this._isSponsoredLabel(labelNode.textContent.trim())) {
                targets.push(el);
            }
        });

        // 2b. aria-describedby heuristic — FB's second obfuscation variant.
        // aria-describedby can list multiple IDs separated by spaces; check each.
        const describedElements = rootNode.querySelectorAll('[aria-describedby]');
        describedElements.forEach(el => {
            const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/);
            for (const id of ids) {
                if (!id) continue;
                const descNode = document.getElementById(id);
                if (descNode && this._isSponsoredLabel(descNode.textContent.trim())) {
                    targets.push(el);
                    break;
                }
            }
        });

        // 3. Post-level fallback scan for localized Sponsored markers
        const postCandidates = this._getPostCandidates(rootNode);
        postCandidates.forEach((post) => {
            if (!post || post.dataset.pfHidden) return;
            const marker = this._findSponsoredMarkerInPost(post);
            if (marker) targets.push(marker);
        });

        for (const indicator of targets) {
            // Skip indicators inside comment dialogs — FB uses identical markup for both.
            if (indicator.closest('[role="dialog"]')) continue;

            const postWrapper = PF_Helpers.getClosest(indicator, PF_SELECTOR_MAP.postContainer);
            if (postWrapper) {
                this._hidePostNode(postWrapper, 'Sponsored Post (Label Heuristic)');
            }
        }
    },

    /** @deprecated Use _removeAdsByHardSignals / _removeSponsoredByLabels directly. */
    removeSponsored(rootNode) {
        this._removeAdsByHardSignals(rootNode);
        this._removeSponsoredByLabels(rootNode);
    },

    /**
     * Hunt for side-rail specific ads which Facebook generates using different logic than Feed units.
     * @param {HTMLElement} rootNode
     */
    removeRightRailAds(rootNode) {
        // Find the right column container
        const rightCol = rootNode.matches('[role="complementary"]') ? rootNode : rootNode.querySelector('[role="complementary"]');
        if (!rightCol) return;

        // 1. Static known containers
        const staticAds = rightCol.querySelectorAll('[data-pagelet="RightRailAdUnits"], [data-pagelet="EgoPane"]');
        staticAds.forEach((ad) => {
            if (this._looksLikeContactsModule(ad)) return;
            this._hideNodeSafely(ad, 'Right Rail Target');
        });

        // 2. Deep traverse for obfuscated text injection.
        // Driven from this.sponsoredTokens so all supported locales (EN/ES/FR/DE/IT/NL/SV/DA/NO)
        // are covered automatically — no hardcoded locale list here.
        const adSpans = this.sponsoredTokens.reduce((acc, token) => {
            // Use the display-form token for findContains (case-insensitive text match).
            // sponsoredTokens stores lowercase normalized forms so we capitalize first char
            // to match FB's title-case label, e.g. "Gesponsord", "Sponsrad".
            const display = token.charAt(0).toUpperCase() + token.slice(1);
            return acc.concat(PF_Helpers.findContains(rightCol, 'span, div, h2, h3', display));
        }, []);
        adSpans.forEach(el => {
            // Verify exact match to prevent false positives if someone's name contains the word
            if (this._isSponsoredLabel(el.textContent)) {
                const targetWrap = this._findRightRailAdContainer(el, rightCol);
                if (targetWrap && !targetWrap.dataset.pfHidden) {
                    this._hideNodeSafely(targetWrap, 'Right Rail Heuristics');
                }
            }
        });
    },

    _findRightRailAdContainer(markerNode, rightCol) {
        if (!markerNode) return null;

        const strictPagelet = PF_Helpers.getClosest(markerNode, '[data-pagelet="RightRailAdUnits"], [data-pagelet="EgoPane"]', 8);
        if (strictPagelet && !this._looksLikeContactsModule(strictPagelet)) {
            return strictPagelet;
        }

        const listItem = PF_Helpers.getClosest(markerNode, '[role="listitem"], li', 6);
        if (listItem && !this._looksLikeContactsModule(listItem) && this._isLikelyAdCardContainer(listItem)) {
            return listItem;
        }

        let current = markerNode.parentElement;
        let depth = 0;
        while (current && current !== rightCol && depth < 9) {
            if (this._looksLikeContactsModule(current)) return null;
            if (this._isLikelyAdCardContainer(current)) return current;
            current = current.parentElement;
            depth += 1;
        }

        return null;
    },

    _looksLikeContactsModule(node) {
        if (!node || !node.querySelector) return false;

        // Aria-label exact match (all locale variants)
        const contactsAriaSelector = [
            '[aria-label="Contacts"]',
            '[aria-label="Contactos"]',
            '[aria-label="Kontakte"]',
            '[aria-label="Contatti"]',
            '[aria-label="Contacten"]',
            '[aria-label="Kontakter"]'
        ].join(', ');
        if (node.querySelector(contactsAriaSelector)) return true;

        // Heading text match
        const heading = node.querySelector('h2, h3, [role="heading"]');
        const headingText = this._normalizeComparableText(heading?.textContent || '');
        const contactsHeadings = new Set([
            'contacts', 'contactos', 'kontakte', 'contatti', 'contacten', 'kontakter'
        ]);
        if (contactsHeadings.has(headingText)) return true;

        // Body text + link count heuristic
        const text = this._normalizeComparableText((node.textContent || '').slice(0, 800));
        if (!text) return false;

        const hasContactsToken = [
            'contacts', 'contactos', 'kontakte', 'contatti', 'contacten', 'kontakter'
        ].some((token) => text.includes(token));

        const manyLinks = node.querySelectorAll('a[role="link"], a[href]').length >= 8;
        return hasContactsToken && manyLinks;
    },

    _isLikelyAdCardContainer(node) {
        if (!node || !node.getBoundingClientRect) return false;

        const rect = node.getBoundingClientRect();
        if (rect.width < 140 || rect.width > 560) return false;
        if (rect.height < 40 || rect.height > 760) return false;

        const text = this._normalizeComparableText((node.textContent || '').slice(0, 900));
        const hasSponsoredToken = this.sponsoredTokens.some((token) => text.includes(this._normalizeComparableText(token)));
        const hasOutboundLinks = node.querySelectorAll('a[href]').length >= 1;
        const hasMedia = !!node.querySelector('img, video, canvas');

        if (this._looksLikeContactsModule(node)) return false;
        if (hasSponsoredToken) return true;

        return hasOutboundLinks && hasMedia;
    },

    _findSponsoredMarkerInPost(postNode) {
        const postRect = postNode.getBoundingClientRect ? postNode.getBoundingClientRect() : null;

        // Pass 1: aria-label and single-node textContent scan (fast path).
        // 400px height limit covers tall posts where the label sits below a large image.
        // 48 char limit allows "Sponsored · 3 hours ago" style combined labels through.
        const candidates = postNode.querySelectorAll('[aria-label], [role="link"], a, span, div');
        for (const node of candidates) {
            const text = this._normalizeComparableText(
                node.getAttribute('aria-label')
                || node.textContent
                || ''
            );

            if (!text || text.length > 48) continue;
            if (!this._isSponsoredLabel(text)) continue;

            // Prefer markers near the top header area of a post.
            if (postRect && node.getBoundingClientRect) {
                const rect = node.getBoundingClientRect();
                if (rect.top - postRect.top > 400) continue;
            }

            return node;
        }

        // Pass 2: TreeWalker deep text reconstruction.
        // FB sometimes splits "Sponsored" across many tiny adjacent text nodes so
        // that no single node's textContent equals the full word.  TreeWalker
        // reconstructs the concatenated string and strips ZWC before matching.
        const strip = (s) => s.replace(/[\u00ad\u200b-\u200f\u2028\u2029\u202a-\u202f\u2060\u2061\ufeff]/g, '');
        const walker = document.createTreeWalker(postNode, NodeFilter.SHOW_TEXT, null, false);
        let rebuilt = '';
        let lastNode = null;
        while (walker.nextNode()) {
            const raw = walker.currentNode.nodeValue || '';
            rebuilt += strip(raw);
            // Once we accumulate enough chars to potentially contain a token, check.
            // Reset after 80 chars to avoid matching across unrelated text blocks.
            if (rebuilt.length > 80) rebuilt = rebuilt.slice(-40);
            if (this._isSponsoredLabel(rebuilt.trim())) return walker.currentNode.parentElement || postNode;
            lastNode = walker.currentNode;
        }
        void lastNode; // suppress unused-var lint

        return null;
    },

    _isSponsoredLabel(text) {
        // Strip zero-width and invisible Unicode chars FB injects between letters
        // (e.g. U+200B ZERO WIDTH SPACE, U+200C/D, U+2060, U+FEFF) to defeat text
        // matching. Then strip diacritics so accented forms match the token list.
        const cleaned = String(text || '').replace(/[\u00ad\u200b-\u200f\u2028\u2029\u202a-\u202f\u2060\u2061\ufeff]/g, '');
        // Normalize separators: U+2022 BULLET (•) and U+00B7 MIDDLE DOT (·) are used
        // interchangeably by FB across locales and UI variants. Collapse all to ' · '.
        const normalized = this._normalizeComparableText(cleaned).replace(/\s*[•·]\s*/g, ' · ');
        if (!normalized) return false;

        return this.sponsoredTokens.some((token) => {
            // Exact match or "Sponsored" is a prefix (e.g. "Sponsored · 3h ago")
            if (normalized === token) return true;
            if (normalized.startsWith(`${token} `)) return true;
            if (normalized.startsWith(`${token} ·`)) return true;
            if (normalized.startsWith(`${token}:`)) return true;
            // "Sponsored" at end — FB can prefix with a page badge or dot separator
            // e.g. "Page Name · Sponsored" or "Promoted · Sponsored"
            if (normalized.endsWith(` ${token}`)) return true;
            if (normalized.endsWith(` · ${token}`)) return true;
            // Mid-string: "Posted by Page · Sponsored · Follow"
            if (normalized.includes(` · ${token} ·`)) return true;
            if (normalized.includes(` · ${token}`)) return true;
            return false;
        });
    },

});
