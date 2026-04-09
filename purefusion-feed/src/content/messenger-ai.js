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

        this._injectStyles();
        this._startObserver();
        this.scanDocument();
    }

    updateSettings(settings) {
        this.settings = settings;
        if (this.engine) this.engine.settings = settings;

        this._refreshToolbars();
        this.scanDocument();
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

        const composers = document.querySelectorAll('div[role="textbox"][contenteditable="true"]');
        composers.forEach((composer) => this._attachToComposer(composer));
    }

    _startObserver() {
        if (this.observer || typeof MutationObserver === 'undefined') return;

        this.observer = new MutationObserver((mutations) => {
            if (!this._isEnabled()) return;

            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    this.scanDebounced();
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

        composer.focus();

        // Use a single write path to avoid duplicate text insertion in Messenger.
        composer.textContent = safeText;

        try {
            composer.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                data: safeText,
                inputType: 'insertReplacementText'
            }));
        } catch {
            composer.dispatchEvent(new Event('input', { bubbles: true }));
        }

        this._moveCaretToEnd(composer);
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

        if (label.includes('comment') || label.includes('coment')) return false;
        if (label.includes('message') || label.includes('mensaje')) return true;

        const scope = composer.closest('[role="dialog"], [role="main"]') || document;
        const hasMessengerSignals = !!scope.querySelector('[aria-label*="GIF"], [aria-label*="Sticker"], [aria-label*="Emoji"], [aria-label*="Like"], [aria-label*="Me gusta"]');

        return hasMessengerSignals;
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
        `;

        document.head.appendChild(style);
    }

    _refreshToolbars() {
        document.querySelectorAll('.pf-msg-ai-toolbar, .pf-msg-ai-replies').forEach((el) => el.remove());
        this.processedComposers = new WeakSet();
        this.replyPanels = new WeakMap();
    }
}

window.PF_MessengerAI = PF_MessengerAI;
