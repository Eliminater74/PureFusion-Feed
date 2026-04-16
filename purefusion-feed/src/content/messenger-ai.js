/**
 * PureFusion Feed - Messenger AI Assist
 *
 * Adds lightweight rewrite and smart-reply helpers to Messenger composers.
 * Works in messenger.com and Facebook chat popups when stable composer hooks
 * are detected. If hooks are not detected, this module no-ops silently.
 */

class PF_MessengerAI {
    constructor(settings) {
        this.settings = settings;
        this.engine = new window.PF_LLMEngine(settings);

        this.processedComposers = new WeakSet();
        this.replyPanels = new WeakMap();
        this.observer = null;
        this.scanDebounced = PF_Helpers.debounce(() => this.scanDocument(), 220);

        // Messenger Enhancements state
        this.markAllReadBtn = null;
        this.filterBar = null;
        this.unsendObserver = null;
        this._activeConvFilter = 'all';
        this.enhancementsDebounced = PF_Helpers.debounce(() => this._applyEnhancements(), 600);

        this._injectStyles();
        this._startObserver();
        this.scanDocument();
        this._applyEnhancements();
    }

    updateSettings(settings) {
        this.settings = settings;
        if (this.engine) this.engine.settings = settings;

        this._refreshToolbars();
        this.scanDocument();
        this._applyEnhancements();
    }

    applyToNodes(nodes) {
        if (!this._isEnabled()) return;

        nodes.forEach((node) => {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

            if (node.matches && this._isComposer(node)) {
                this._attachToComposer(node);
            }

            if (node.querySelectorAll) {
                const composers = node.querySelectorAll('div[role="textbox"][contenteditable="true"]');
                composers.forEach((composer) => this._attachToComposer(composer));
            }
        });
    }

    scanDocument() {
        if (!this._isEnabled()) return;

        this._cleanupMisplacedToolbars();

        const composers = document.querySelectorAll('div[role="textbox"][contenteditable="true"]');
        composers.forEach((composer) => this._attachToComposer(composer));
    }

    _startObserver() {
        if (this.observer || typeof MutationObserver === 'undefined') return;

        this.observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    if (this._isEnabled()) this.scanDebounced();
                    if (this._isAnyEnhancementEnabled()) this.enhancementsDebounced();
                    return;
                }
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    _attachToComposer(composer) {
        if (!composer || this.processedComposers.has(composer)) return;
        if (!this._isComposer(composer)) return;
        if (!this._isLikelyMessengerComposer(composer)) return;

        const anchor = this._findToolbarAnchor(composer);
        if (!anchor || !anchor.parent) return;

        const composerId = this._getComposerId(composer);
        if (anchor.parent.querySelector(`.pf-msg-ai-toolbar[data-pf-composer-id="${composerId}"]`)) return;

        const toolbar = document.createElement('div');
        toolbar.className = 'pf-msg-ai-toolbar';
        toolbar.dataset.pfComposerId = composerId;

        const rewriteBtn = document.createElement('button');
        rewriteBtn.type = 'button';
        rewriteBtn.className = 'pf-msg-ai-btn';
        rewriteBtn.textContent = this._i18n('messenger_ai_rewrite_btn', 'Rewrite');

        const repliesBtn = document.createElement('button');
        repliesBtn.type = 'button';
        repliesBtn.className = 'pf-msg-ai-btn';
        repliesBtn.textContent = this._i18n('messenger_ai_replies_btn', 'Smart Replies');

        if (this.settings?.llm?.messengerRewriteEnabled) {
            toolbar.appendChild(rewriteBtn);
        }

        if (this.settings?.llm?.messengerSmartRepliesEnabled) {
            toolbar.appendChild(repliesBtn);
        }

        if (!toolbar.children.length) return;

        anchor.parent.insertBefore(toolbar, anchor.before || null);

        rewriteBtn.addEventListener('click', async () => {
            await this._handleRewrite(composer, rewriteBtn);
        });

        repliesBtn.addEventListener('click', async () => {
            await this._handleSmartReplies(composer, repliesBtn, toolbar);
        });

        this.processedComposers.add(composer);
    }

    async _handleRewrite(composer, button) {
        if (!this._checkReady()) return;

        const raw = this._getComposerText(composer);
        if (!raw) {
            PF_Helpers.showToast(this._i18n('messenger_ai_empty_input', 'Type a message first.'), 'info');
            return;
        }

        const original = button.textContent;
        button.disabled = true;
        button.textContent = this._i18n('messenger_ai_rewriting_btn', 'Rewriting...');

        try {
            const rewritten = await this.engine.prompt(
                'You rewrite chat text. Keep meaning, keep language, fix grammar and clarity. Keep it concise and natural. Return only rewritten text.',
                raw
            );

            if (!rewritten) throw new Error('Empty rewrite response.');

            this._setComposerText(composer, rewritten.replace(/^\s*"|"\s*$/g, '').trim());
            PF_Helpers.showToast(this._i18n('messenger_ai_rewrite_success', 'Message rewritten.'), 'success');
        } catch (err) {
            PF_Logger.error('PF_MessengerAI rewrite failed:', err);
            PF_Helpers.showToast(this._i18n('messenger_ai_rewrite_fail', 'Rewrite failed. Check AI provider settings.'), 'error');
        } finally {
            button.disabled = false;
            button.textContent = original;
        }
    }

    async _handleSmartReplies(composer, button, toolbar) {
        if (!this._checkReady()) return;

        const contextLines = this._collectRecentMessages(composer);
        if (contextLines.length < 2) {
            PF_Helpers.showToast(this._i18n('messenger_ai_context_missing', 'Need more chat context for smart replies.'), 'info');
            return;
        }

        const original = button.textContent;
        button.disabled = true;
        button.textContent = this._i18n('messenger_ai_generating_btn', 'Generating...');

        try {
            const prompt = `Conversation excerpt:\n${contextLines.join('\n')}\n\nGenerate exactly 3 short reply options. Keep them natural and friendly. Return one option per line.`;
            const response = await this.engine.prompt(
                'You generate concise chat replies. Output plain text only. No numbering, no labels, one reply per line.',
                prompt
            );

            const replies = this._parseReplies(response);
            if (!replies.length) {
                throw new Error('No replies parsed.');
            }

            this._renderReplyPanel(toolbar, composer, replies);
        } catch (err) {
            PF_Logger.error('PF_MessengerAI smart replies failed:', err);
            PF_Helpers.showToast(this._i18n('messenger_ai_replies_fail', 'Could not generate smart replies.'), 'error');
        } finally {
            button.disabled = false;
            button.textContent = original;
        }
    }

    _renderReplyPanel(toolbar, composer, replies) {
        const current = this.replyPanels.get(composer);
        if (current && current.remove) current.remove();

        const panel = document.createElement('div');
        panel.className = 'pf-msg-ai-replies';
        panel.dataset.pfComposerId = toolbar.dataset.pfComposerId || this._getComposerId(composer);

        replies.forEach((reply) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'pf-msg-ai-reply-chip';
            chip.textContent = reply;
            chip.addEventListener('click', () => {
                this._setComposerText(composer, reply);
                panel.remove();
                this.replyPanels.delete(composer);
            });
            panel.appendChild(chip);
        });

        toolbar.insertAdjacentElement('afterend', panel);
        this.replyPanels.set(composer, panel);
    }

    _collectRecentMessages(composer) {
        const scope = composer.closest('[role="main"], [role="dialog"]') || document;
        const nodes = Array.from(scope.querySelectorAll('div[dir="auto"], span[dir="auto"]'));

        const ignoreTokens = [
            'gif', 'sticker', 'emoji', 'like', 'me gusta',
            'aa', 'message', 'mensaje', 'comentar', 'comment'
        ];

        const lines = [];
        nodes.forEach((node) => {
            const text = this._normalizeText(node.textContent || '');
            if (!text) return;
            if (text.length < 2 || text.length > 240) return;
            if (ignoreTokens.includes(text)) return;

            lines.push(text);
        });

        const unique = [];
        const seen = new Set();
        for (let i = lines.length - 1; i >= 0; i -= 1) {
            const line = lines[i];
            if (seen.has(line)) continue;
            seen.add(line);
            unique.unshift(line);
            if (unique.length >= 8) break;
        }

        return unique;
    }

    _parseReplies(response) {
        if (!response) return [];

        const lines = String(response)
            .split(/\r?\n/)
            .map((line) => line.replace(/^\s*[-*\d.)]+\s*/, '').trim())
            .filter(Boolean)
            .slice(0, 3);

        return lines;
    }

    _getComposerText(composer) {
        return String(composer?.innerText || composer?.textContent || '').trim();
    }

    _setComposerText(composer, text) {
        if (!composer) return;

        const safeText = String(text || '').trim();

        const target = composer.matches('[contenteditable="true"]')
            ? composer
            : (composer.querySelector('[contenteditable="true"]') || composer);

        target.focus();

        // Replace content via Range to avoid duplicate inserts (e.g. "OkOk").
        try {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(target);
            range.deleteContents();

            const textNode = document.createTextNode(safeText);
            range.insertNode(textNode);
            range.setStartAfter(textNode);
            range.collapse(true);

            selection.removeAllRanges();
            selection.addRange(range);
        } catch {
            // Fallback for edge cases where Range APIs are blocked by host editor
            target.textContent = safeText;
        }

        this._dispatchComposerInput(target, safeText);
        this._moveCaretToEnd(target);
    }

    _dispatchComposerInput(target, text) {
        try {
            target.dispatchEvent(new InputEvent('beforeinput', {
                bubbles: true,
                cancelable: true,
                data: text,
                inputType: 'insertReplacementText'
            }));
        } catch {
            // noop
        }

        try {
            target.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                data: text,
                inputType: 'insertReplacementText'
            }));
        } catch {
            target.dispatchEvent(new Event('input', { bubbles: true }));
        }

        target.dispatchEvent(new Event('change', { bubbles: true }));
    }

    _moveCaretToEnd(el) {
        try {
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        } catch {
            // noop
        }
    }

    _findToolbarAnchor(composer) {
        const composerRow = this._findComposerRow(composer);
        if (composerRow && composerRow.parentElement) {
            return {
                parent: composerRow.parentElement,
                before: composerRow
            };
        }

        if (composer.parentElement) {
            return {
                parent: composer.parentElement,
                before: composer
            };
        }

        return null;
    }

    _findComposerRow(composer) {
        let node = composer;

        for (let depth = 0; depth < 7 && node; depth += 1) {
            const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
            const controls = node.querySelectorAll
                ? node.querySelectorAll('div[role="button"], button, a[role="link"]')
                : [];

            const hasComposer = node.contains && node.contains(composer);
            const looksLikeRow = !!(
                hasComposer
                && controls.length >= 3
                && rect
                && rect.height > 20
                && rect.height < 140
                && rect.width > 180
            );

            if (looksLikeRow) return node;
            node = node.parentElement;
        }

        return null;
    }

    _getComposerId(composer) {
        if (!composer.dataset.pfComposerId) {
            composer.dataset.pfComposerId = `pfm-${Math.random().toString(36).slice(2, 9)}`;
        }

        return composer.dataset.pfComposerId;
    }

    _isComposer(node) {
        return !!(node && node.matches && node.matches('div[role="textbox"][contenteditable="true"]'));
    }

    _isLikelyMessengerComposer(composer) {
        const label = this._normalizeText(
            composer.getAttribute('aria-label')
            || composer.getAttribute('title')
            || ''
        );

        if (label.includes('comment') || label.includes('coment') || label.includes('reply')) return false;

        const localContext = this._normalizeText(
            (composer.closest('[role="article"], [data-pagelet], [role="dialog"], [role="main"], form')?.innerText || '').slice(0, 800)
        );

        const looksLikeFeedCommentContext = /reply to|write a reply|write a comment|most relevant|view all \d+ replies|responder a|escribe una respuesta|escribe un comentario|más relevantes/.test(localContext);
        if (looksLikeFeedCommentContext) return false;

        const host = window.location.hostname || '';
        if (host.includes('messenger.com')) return true;

        // On facebook.com only allow chat popups, not feed comment composers.
        return this._isFacebookChatPopupComposer(composer);
    }

    _isFacebookChatPopupComposer(composer) {
        const dialog = composer.closest('[role="dialog"]');
        if (!dialog) return false;

        const headerSignals = [
            '[aria-label*="Call"]',
            '[aria-label*="Video"]',
            '[aria-label*="chat"]',
            '[aria-label*="Messenger"]',
            '[aria-label*="Llam"]',
            '[aria-label*="Cerrar chat"]',
            '[aria-label*="Minimize"]',
            '[aria-label*="Minimizar"]'
        ];

        return headerSignals.some((selector) => !!dialog.querySelector(selector));
    }

    _cleanupMisplacedToolbars() {
        const host = window.location.hostname || '';
        if (!host.includes('facebook.com')) return;

        document.querySelectorAll('.pf-msg-ai-toolbar').forEach((toolbar) => {
            const inFeedArticle = !!toolbar.closest('[role="article"]');
            const inDialog = !!toolbar.closest('[role="dialog"]');
            if (inFeedArticle && !inDialog) {
                const composerId = toolbar.dataset.pfComposerId;
                toolbar.remove();
                if (composerId) {
                    document.querySelectorAll(`.pf-msg-ai-replies[data-pf-composer-id="${composerId}"]`).forEach((panel) => panel.remove());
                }
            }
        });
    }

    _checkReady() {
        if (this.engine.isReady()) return true;
        PF_Helpers.showToast(this._i18n('messenger_ai_provider_required', 'Configure an AI provider in PureFusion settings first.'), 'warn');
        return false;
    }

    _isEnabled() {
        if (this.settings?.enabled === false) return false;
        return !!(
            this.settings?.llm?.messengerRewriteEnabled
            || this.settings?.llm?.messengerSmartRepliesEnabled
        );
    }

    _normalizeText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    _i18n(key, fallback) {
        if (typeof chrome === 'undefined' || !chrome.i18n) return fallback;
        return chrome.i18n.getMessage(key) || fallback;
    }

    _injectStyles() {
        if (document.getElementById('pf-msg-ai-styles')) return;

        const style = document.createElement('style');
        style.id = 'pf-msg-ai-styles';
        style.textContent = `
            .pf-msg-ai-toolbar {
                display: flex;
                gap: 8px;
                align-items: center;
                margin: 4px 8px 6px;
                padding: 0 2px;
                flex-wrap: nowrap;
                overflow-x: auto;
                scrollbar-width: thin;
            }

            .pf-msg-ai-btn {
                border: 1px solid rgba(140, 152, 173, 0.35);
                background: rgba(44, 49, 63, 0.88);
                color: #eaf0ff;
                border-radius: 999px;
                padding: 4px 10px;
                font: 700 11px/1.2 "Segoe UI Variable Text", "Segoe UI", sans-serif;
                cursor: pointer;
                white-space: nowrap;
            }

            .pf-msg-ai-btn:hover {
                border-color: rgba(0, 174, 255, 0.7);
                color: #a9e8ff;
            }

            .pf-msg-ai-btn:disabled {
                opacity: 0.72;
                cursor: default;
            }

            .pf-msg-ai-replies {
                display: grid;
                gap: 6px;
                margin: 0 8px 8px;
            }

            .pf-msg-ai-reply-chip {
                border: 1px solid rgba(114, 172, 255, 0.42);
                background: rgba(27, 49, 79, 0.72);
                color: #dbedff;
                border-radius: 10px;
                padding: 6px 10px;
                font: 600 12px/1.3 "Segoe UI Variable Text", "Segoe UI", sans-serif;
                cursor: pointer;
                max-width: 100%;
                text-align: left;
                width: 100%;
            }

            .pf-msg-ai-reply-chip:hover {
                border-color: rgba(72, 187, 255, 0.8);
                color: #ffffff;
            }

            /* Mark All Read button */
            .pf-messenger-mark-read-btn {
                background: rgba(18, 200, 220, 0.1);
                border: 1px solid rgba(18, 200, 220, 0.38);
                color: #a9f1ff;
                border-radius: 6px;
                padding: 3px 9px;
                font: 600 11px/1.5 "Segoe UI Variable Text", "Segoe UI", sans-serif;
                cursor: pointer;
                white-space: nowrap;
                margin-left: 8px;
                vertical-align: middle;
            }
            .pf-messenger-mark-read-btn:hover {
                background: rgba(18, 200, 220, 0.2);
                border-color: rgba(18, 200, 220, 0.6);
                color: #fff;
            }

            /* Conversation Filter Bar */
            .pf-messenger-filter-bar {
                display: flex;
                gap: 6px;
                padding: 6px 12px 6px;
                background: rgba(20, 24, 33, 0.92);
                border-bottom: 1px solid rgba(122, 132, 156, 0.2);
                position: sticky;
                top: 0;
                z-index: 50;
                flex-wrap: nowrap;
                overflow-x: auto;
                scrollbar-width: none;
            }
            .pf-msn-filter-btn {
                background: rgba(44, 49, 63, 0.88);
                border: 1px solid rgba(140, 152, 173, 0.28);
                color: #a9b3c8;
                border-radius: 999px;
                padding: 4px 12px;
                font: 600 11px/1.3 "Segoe UI Variable Text", "Segoe UI", sans-serif;
                cursor: pointer;
                white-space: nowrap;
                transition: background 0.15s, border-color 0.15s, color 0.15s;
            }
            .pf-msn-filter-btn:hover {
                background: rgba(60, 68, 85, 0.9);
                color: #eef2fb;
            }
            .pf-msn-filter-btn.pf-msn-filter-active {
                background: linear-gradient(135deg, #6C3FC5 0%, #4f76cf 100%);
                border-color: transparent;
                color: #fff;
            }

            /* Unsend placeholder */
            .pf-unsend-placeholder {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 5px 10px;
                margin: 2px 4px;
                background: rgba(239, 68, 68, 0.07);
                border: 1px solid rgba(239, 68, 68, 0.22);
                border-radius: 8px;
                font: italic 600 12px/1.4 "Segoe UI Variable Text", "Segoe UI", sans-serif;
                color: #a9b3c8;
            }
            .pf-unsend-dismiss {
                background: none;
                border: none;
                color: #6b7a99;
                cursor: pointer;
                font-size: 15px;
                line-height: 1;
                padding: 0 2px;
                flex-shrink: 0;
            }
            .pf-unsend-dismiss:hover { color: #fff; }
        `;

        document.head.appendChild(style);
    }

    _refreshToolbars() {
        document.querySelectorAll('.pf-msg-ai-toolbar, .pf-msg-ai-replies').forEach((el) => el.remove());
        this.processedComposers = new WeakSet();
        this.replyPanels = new WeakMap();
    }

    // -------------------------------------------------------------------------
    // Messenger Enhancements (Phase 43)
    // -------------------------------------------------------------------------

    _isAnyEnhancementEnabled() {
        if (this.settings?.enabled === false) return false;
        const s = this.settings?.social || {};
        return !!(
            s.alwaysShowMessageTimestamps
            || s.messengerMarkAllRead
            || s.messengerConversationFilter
            || s.detectUnsends
        );
    }

    _applyEnhancements() {
        this._applyTimestamps();
        this._injectMarkAllRead();
        this._injectConversationFilter();
        this._startUnsendDetection();
    }

    // 1. Always-visible timestamps ──────────────────────────────────────────

    _applyTimestamps() {
        const on = !!(this.settings?.enabled !== false && this.settings?.social?.alwaysShowMessageTimestamps);
        const existing = document.getElementById('pf-msg-timestamp-style');
        if (!on) { if (existing) existing.remove(); return; }
        if (existing) return;

        const style = document.createElement('style');
        style.id = 'pf-msg-timestamp-style';
        // Best-effort: target common timestamp patterns across Messenger DOM versions.
        // FB rotates class names, so we rely on data-testid, time elements, and
        // aria-label patterns. This may need selector updates after FB deploys.
        style.textContent = `
            [data-testid$="timestamp"],
            [data-testid*="message_timestamp"],
            time[datetime] {
                opacity: 1 !important;
                height: auto !important;
                max-height: none !important;
                overflow: visible !important;
                clip: unset !important;
                clip-path: unset !important;
                visibility: visible !important;
            }
        `;
        document.head.appendChild(style);
    }

    // 2. Mark All Read button ────────────────────────────────────────────────

    _injectMarkAllRead() {
        const on = !!(this.settings?.enabled !== false && this.settings?.social?.messengerMarkAllRead);
        if (!on) {
            if (this.markAllReadBtn) { this.markAllReadBtn.remove(); this.markAllReadBtn = null; }
            return;
        }
        if (this.markAllReadBtn && document.contains(this.markAllReadBtn)) return;

        const header = this._findChatListHeader();
        if (!header) return;

        const btn = document.createElement('button');
        btn.className = 'pf-messenger-mark-read-btn';
        btn.textContent = 'Mark all read';
        btn.title = 'Hides unread badge dots (cosmetic — does not mark as read on Facebook servers)';
        btn.addEventListener('click', () => {
            this._hideUnreadBadges();
            PF_Helpers.showToast('Unread badges hidden', 'success');
        });
        header.appendChild(btn);
        this.markAllReadBtn = btn;
    }

    _findChatListHeader() {
        const candidates = document.querySelectorAll('[role="heading"], h2, h3');
        const chatTokens = ['chats', 'messages', 'mensajes', 'nachrichten', 'messages', 'berichten'];
        for (const el of candidates) {
            const text = (el.textContent || '').trim().toLowerCase();
            if (chatTokens.includes(text)) return el.parentElement || el;
        }
        return null;
    }

    _hideUnreadBadges() {
        // Target unread count badges and bold unread indicators in conversation list
        const badgeSelectors = [
            '[data-testid="unread-count"]',
            '[aria-label*="unread"]',
            '[aria-label*="New message"]',
            '[aria-label*="nuevo mensaje"]'
        ];
        badgeSelectors.forEach((sel) => {
            document.querySelectorAll(sel).forEach((el) => {
                el.style.setProperty('display', 'none', 'important');
            });
        });
    }

    // 3. Conversation Filter bar ─────────────────────────────────────────────

    _injectConversationFilter() {
        const on = !!(this.settings?.enabled !== false && this.settings?.social?.messengerConversationFilter);
        if (!on) {
            if (this.filterBar) { this.filterBar.remove(); this.filterBar = null; }
            if (this._activeConvFilter !== 'all') {
                this._activeConvFilter = 'all';
                this._applyConversationFilter('all');
            }
            return;
        }
        if (this.filterBar && document.contains(this.filterBar)) return;

        const listContainer = this._findConversationListContainer();
        if (!listContainer) return;

        const bar = document.createElement('div');
        bar.className = 'pf-messenger-filter-bar';
        ['All', 'Unread', 'Groups'].forEach((label) => {
            const btn = document.createElement('button');
            btn.className = 'pf-msn-filter-btn';
            btn.dataset.pfFilter = label.toLowerCase();
            btn.textContent = label;
            if (label.toLowerCase() === this._activeConvFilter) {
                btn.classList.add('pf-msn-filter-active');
            }
            bar.appendChild(btn);
        });

        const parent = listContainer.parentElement;
        if (parent) parent.insertBefore(bar, listContainer);
        this.filterBar = bar;

        bar.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-pf-filter]');
            if (!btn) return;
            bar.querySelectorAll('.pf-msn-filter-btn').forEach((b) => b.classList.remove('pf-msn-filter-active'));
            btn.classList.add('pf-msn-filter-active');
            this._activeConvFilter = btn.dataset.pfFilter;
            this._applyConversationFilter(this._activeConvFilter);
        });
    }

    _findConversationListContainer() {
        const lists = document.querySelectorAll('[role="list"]');
        for (const list of lists) {
            if (list.querySelectorAll('a[href*="/messages/"]').length > 1) return list;
        }
        return null;
    }

    _applyConversationFilter(filter) {
        const listContainer = this._findConversationListContainer();
        if (!listContainer) return;

        listContainer.querySelectorAll('[role="listitem"]').forEach((row) => {
            if (filter === 'all') {
                row.style.removeProperty('display');
                return;
            }
            const show = filter === 'unread'
                ? this._isConversationUnread(row)
                : this._isGroupConversation(row);
            if (show) {
                row.style.removeProperty('display');
            } else {
                row.style.setProperty('display', 'none', 'important');
            }
        });
    }

    _isConversationUnread(row) {
        const unreadSelectors = ['[data-testid="unread-count"]', '[aria-label*="unread"]', '[aria-label*="New message"]'];
        for (const sel of unreadSelectors) {
            if (row.querySelector(sel)) return true;
        }
        // FB also bolds the conversation name when unread
        const nameEl = row.querySelector('span[dir="auto"]');
        if (nameEl) {
            const weight = parseInt(window.getComputedStyle(nameEl).fontWeight, 10);
            if (!Number.isNaN(weight) && weight >= 600) return true;
        }
        return false;
    }

    _isGroupConversation(row) {
        // Groups show stacked/multiple avatar images
        const imgs = row.querySelectorAll('img[alt]');
        if (imgs.length >= 2) return true;
        const link = row.querySelector('a');
        if (link) {
            const label = (link.getAttribute('aria-label') || '').toLowerCase();
            if (/group|grupo|groupe|gruppe|groep|grupp/.test(label)) return true;
        }
        return false;
    }

    // 4. Unsend Detection ────────────────────────────────────────────────────

    _startUnsendDetection() {
        const on = !!(this.settings?.enabled !== false && this.settings?.social?.detectUnsends);
        if (!on) {
            if (this.unsendObserver) { this.unsendObserver.disconnect(); this.unsendObserver = null; }
            return;
        }
        if (this.unsendObserver) return;

        const thread = document.querySelector('[role="main"]');
        if (!thread) return;

        this.unsendObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type !== 'childList' || !mutation.removedNodes.length) continue;
                mutation.removedNodes.forEach((node) => this._checkRemovedNode(node, mutation.target));
            }
        });

        this.unsendObserver.observe(thread, { childList: true, subtree: true });
    }

    _checkRemovedNode(node, parent) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

        const text = (node.textContent || '').trim();
        if (!text || text.length < 3 || text.length > 800) return;

        // Skip non-message elements (tooltips, menus, overlays, etc.)
        const role = (node.getAttribute && node.getAttribute('role')) || '';
        if (/tooltip|menu|dialog|banner|navigation/.test(role)) return;

        // Must have a dir="auto" child — FB message text nodes always have this
        if (!node.querySelector || !node.querySelector('[dir="auto"]')) return;

        // Must be within the conversation thread, not a sidebar/nav element
        const inThread = parent.closest && parent.closest('[role="main"]');
        if (!inThread) return;

        // Build placeholder
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const placeholder = document.createElement('div');
        placeholder.className = 'pf-unsend-placeholder';

        const label = document.createElement('span');
        label.textContent = `[Message removed by sender at ${timeStr}]`;

        const dismissBtn = document.createElement('button');
        dismissBtn.className = 'pf-unsend-dismiss';
        dismissBtn.textContent = '×';
        dismissBtn.title = 'Dismiss';
        dismissBtn.addEventListener('click', () => placeholder.remove());

        placeholder.appendChild(label);
        placeholder.appendChild(dismissBtn);

        try {
            parent.appendChild(placeholder);
        } catch {
            // parent may no longer be in DOM — silently ignore
        }
    }

    destroy() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.unsendObserver) {
            this.unsendObserver.disconnect();
            this.unsendObserver = null;
        }
        if (this.markAllReadBtn) { this.markAllReadBtn.remove(); this.markAllReadBtn = null; }
        if (this.filterBar) { this.filterBar.remove(); this.filterBar = null; }
        const tsStyle = document.getElementById('pf-msg-timestamp-style');
        if (tsStyle) tsStyle.remove();
    }
}

window.PF_MessengerAI = PF_MessengerAI;
