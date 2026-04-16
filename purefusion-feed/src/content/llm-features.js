/**
 * PureFusion Feed - LLM Generative Features
 * 
 * Injects on-the-fly generative AI tools such as TL;DR summarizers, 
 * Smart Comment co-pilots, and sensationalism-decoders directly into 
 * the Facebook DOM.
 */

class PF_LLMFeatures {
    constructor(settings) {
        this.settings = settings;
        this.engine = new window.PF_LLMEngine(settings);
    }

    sweepDocument() {
        this.applyToNodes([document.body || document.documentElement]);
    }

    applyToNodes(nodes) {
        // We do NOT bypass if the engine isn't ready. 
        // We want the AI tools (like the wand and TL;DR) to inject visually so the user knows they exist.
        // We will catch the 'not ready' state when they actually click the buttons.

        nodes.forEach(node => {
            if (this.settings.llm.tldrEnabled) {
                this.injectTLDR(node);
            }
            if (this.settings.llm.smartCommentEnabled) {
                this.injectCommentCopilot(node);
            }
            if (this.settings.llm.clickbaitDecoder) {
                this.decodeClickbait(node);
            }
        });
    }

    updateSettings(settings) {
        this.settings = settings;
        if (this.engine) this.engine.settings = settings;
    }

    injectTLDR(rootNode) {
        if (!rootNode.querySelectorAll) return;
        
        // Find text bodies inside feed units
        const textNodes = rootNode.querySelectorAll(window.PF_SELECTOR_MAP.postTextBody);
        
        textNodes.forEach(textContainer => {
            const postHost = this._resolvePostHost(textContainer);
            if (!postHost) return;

            const existingBtn = postHost.querySelector('.pf-tldr-btn');
            if (existingBtn) return;

            const textContent = this._extractPostText(postHost) || textContainer.textContent || '';
            
            // Only inject TL;DR if post is long enough to benefit from summarization
            if (textContent.length > 260) {
                postHost.dataset.pfTldrInjected = "true";

                const btn = document.createElement('div');
                btn.className = "pf-tldr-btn";
                btn.style.cssText = `
                    display: inline-flex; align-items: center; 
                    background: linear-gradient(90deg, #6C3FC5, #00D4FF);
                    color: white; font-weight: bold; font-size: 11px;
                    padding: 4px 10px; border-radius: 12px;
                    margin-bottom: 8px; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    transition: transform 0.2s;
                `;
                btn.innerHTML = `<span style="margin-right: 4px;">✨</span> Summarize with AI`;
                
                // Add hover effect
                btn.onmouseenter = () => btn.style.transform = 'scale(1.05)';
                btn.onmouseleave = () => btn.style.transform = 'scale(1)';

                btn.addEventListener('click', async () => {
                    if (!this.engine.isReady()) {
                        PF_Helpers.showToast('AI is not configured. Set a provider in PureFusion settings.', 'warn');
                        return;
                    }

                    const latestText = this._extractPostText(postHost) || textContent;
                    if (!latestText || latestText.length < 60) {
                        PF_Helpers.showToast('Not enough post text to summarize.', 'warn');
                        return;
                    }
                    
                    btn.innerHTML = `<span style="margin-right: 4px;">⏳</span> Analyzing...`;
                    btn.style.opacity = '0.7';
                    btn.style.pointerEvents = 'none';

                    try {
                        const systemContext = "You are a direct, concise summarizer. Read the user's post and summarize the core point in exactly one short, bulleted sentence. Do not add conversational filler.";
                        const summary = await this.engine.prompt(systemContext, latestText);
                        
                        btn.style.background = '#242526';
                        btn.style.border = '1px solid #00D4FF';
                        btn.style.color = '#00D4FF';
                        btn.style.opacity = '1';
                        btn.innerHTML = `<strong>TL;DR:</strong> ${summary}`;
                    } catch(e) {
                        btn.innerHTML = '⚠️ LLM Error. Check Key.';
                        PF_Helpers.showToast('TL;DR request failed. Verify your AI provider key.', 'error');
                        window.PF_Logger.error(e);
                    }
                });

                const anchor = this._ensureTLDRAnchor(postHost);
                anchor.appendChild(btn);
            }
        });
    }

    _resolvePostHost(node) {
        if (!node || !node.closest) return null;

        return node.closest('[role="dialog"], [data-pagelet^="FeedUnit_"], [data-pagelet^="AdUnit_"], [role="article"]');
    }

    _extractPostText(postHost) {
        if (!postHost || !postHost.querySelectorAll) return '';

        const chunks = Array.from(postHost.querySelectorAll(window.PF_SELECTOR_MAP.postTextBody))
            .map((el) => String(el.textContent || '').trim())
            .filter(Boolean);

        if (chunks.length > 0) {
            return chunks.join(' ');
        }

        const fallback = postHost.querySelector('h2, h3, h4, span[dir="auto"], div[dir="auto"]');
        return String(fallback?.textContent || '').trim();
    }

    _ensureTLDRAnchor(postHost) {
        let anchor = postHost.querySelector(':scope > .pf-tldr-anchor');
        if (anchor) return anchor;

        anchor = document.createElement('div');
        anchor.className = 'pf-tldr-anchor';
        anchor.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin:6px 0 6px;';

        const textBody = postHost.querySelector(window.PF_SELECTOR_MAP.postTextBody);
        if (textBody && textBody.parentElement) {
            textBody.parentElement.insertBefore(anchor, textBody);
            return anchor;
        }

        const headerNode = postHost.querySelector('h3, h4');
        if (headerNode && headerNode.parentElement) {
            headerNode.parentElement.appendChild(anchor);
            return anchor;
        }

        postHost.prepend(anchor);
        return anchor;
    }

    _isMessengerChatPopup(box) {
        const dialog = box.closest('[role="dialog"]');
        if (!dialog) return false;
        const signals = [
            '[aria-label*="Call"]', '[aria-label*="Video"]', '[aria-label*="chat"]',
            '[aria-label*="Messenger"]', '[aria-label*="Llam"]', '[aria-label*="Cerrar chat"]',
            '[aria-label*="Minimize"]', '[aria-label*="Minimizar"]'
        ];
        return signals.some((sel) => !!dialog.querySelector(sel));
    }

    injectCommentCopilot(rootNode) {
        if (!rootNode.querySelectorAll) return;

        // Handle cases where the mutated node is the actual text box, or contains it
        const isMatch = rootNode.matches && rootNode.matches(window.PF_SELECTOR_MAP.commentInputBox);
        const commentBoxes = isMatch ? [rootNode] : Array.from(rootNode.querySelectorAll(window.PF_SELECTOR_MAP.commentInputBox));

        commentBoxes.forEach(node => {
            // Because React replaces this element often, we hook into the parent wrapper safely
            const box = node.tagName === 'DIV' && node.getAttribute('role') === 'textbox'
            ? node : node.querySelector('div[role="textbox"]');

            if (!box || box.dataset.pfWandInjected) return;

            // Skip Messenger chat popup composers unless the user has opted in.
            // Messenger re-renders its composer aggressively and causes jitter when the
            // wand is injected. The separate smartCommentOnMessenger setting (default OFF)
            // gives users an explicit opt-in for this surface.
            if (this._isMessengerChatPopup(box) && !this.settings?.llm?.smartCommentOnMessenger) return;

            // Hide the wand entirely if no AI Engine is configured, to avoid clutter
            if (!this.engine.isReady()) return;

            const parent = box.closest('form') || box.parentElement;
            if (!parent || parent.dataset.pfCopilotInjected) return;
            
            box.dataset.pfWandInjected = "true";
            parent.dataset.pfCopilotInjected = "true";

            const wand = document.createElement('div');
            wand.style.cssText = `
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; font-size: 20px; z-index: 100;
                background: transparent; padding: 4px; border-radius: 50%;
                margin-top: 4px; margin-left: 8px; transition: transform 0.2s;
            `;
            wand.innerHTML = '🪄';
            wand.title = 'Draft a smart response via AI';
            wand.onmouseenter = () => wand.style.transform = 'scale(1.2)';
            wand.onmouseleave = () => wand.style.transform = 'scale(1)';

            // Instead of absolute positioning which gets clipped, inject it safely OUTSIDE the input box
            // For FB dialogs, the input is usually deeply wrapped. Let's find the nearest large container.
            let safeContainer = box.closest('.x1i10hfl') || box.parentElement.parentElement;
            if (safeContainer && safeContainer.parentNode) {
                // Insert it as a sibling AFTER the main text input cluster
                safeContainer.parentNode.insertBefore(wand, safeContainer.nextSibling);
            } else {
                parent.appendChild(wand); // Fallback
            }

            wand.addEventListener('click', async (e) => {
                if (!this.engine.isReady()) {
                    PF_Helpers.showToast('AI assistant is not ready yet. Add your API key in settings.', 'warn');
                    return;
                }

                // Attempt to isolate the context. 
                // 1. Try Feed node. 2. Try Modal/Theater node. 3. Fallback to generic body
                let postNode = e.target.closest(window.PF_SELECTOR_MAP ? window.PF_SELECTOR_MAP.postContainer : 'div[data-pagelet^="FeedUnit"]');
                
                if (!postNode) {
                    // Check if we are inside a Facebook theater modal viewing a photo or video
                    postNode = e.target.closest('div[role="dialog"]') || document.body;
                }

                const textContainer = postNode.querySelector(window.PF_SELECTOR_MAP.postTextBody);
                const postContext = textContainer ? textContainer.textContent : '';

                if (!postContext) {
                    PF_Helpers.showToast('Could not extract enough post text for AI reply.', 'warn');
                    return;
                }

                wand.innerHTML = '⏳';
                try {
                    const systemContext = "You are a helpful social media assistant writing a short, friendly, and engaging response to the provided post. Make it sound natural, empathetic, and human. Under 2 sentences.";
                    const draft = await this.engine.prompt(systemContext, postContext);
                    
                    // Note: Copy to clipboard because React blocks direct innerHTML manipulation on Draft.js/Lexical inputs often
                    await navigator.clipboard.writeText(draft);
                    wand.innerHTML = '✅';
                    setTimeout(() => wand.innerHTML = '🪄', 2000);
                    PF_Helpers.showToast('Copilot draft copied to clipboard. Paste it into the comment box.', 'success');

                } catch(e) {
                    wand.innerHTML = '⚠️';
                    PF_Helpers.showToast('Copilot failed to generate a draft. Check your provider key.', 'error');
                    window.PF_Logger.error(e);
                }
            });
        });
    }

    decodeClickbait(rootNode) {
        // If the cleaner module already flagged it as clickbait, we can decode it via LLM
        if (!rootNode.querySelectorAll) return;
        
        const collapsedItems = rootNode.querySelectorAll('[data-pf-collapsed="true"]');
        collapsedItems.forEach(item => {
            if (item.dataset.pfDecoded) return;
            item.dataset.pfDecoded = "true";

            // If we injected an overlay, find the "Show Anyway" button and inject a "De-Sensationalize" button
            const btnContainer = item.querySelector('button') ? item.querySelector('button').parentNode : null;
            if (btnContainer) {
                const decodeBtn = document.createElement('button');
                decodeBtn.style.cssText = `
                    background: #242526; color: #00D4FF; border: 1px solid #00D4FF; 
                    padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;
                    margin-left: 10px;
                `;
                decodeBtn.innerText = '🤖 Decode via AI';

                decodeBtn.addEventListener('click', async () => {
                    if (!this.engine.isReady()) {
                        PF_Helpers.showToast('AI decode is unavailable. Select a provider in settings.', 'warn');
                        return;
                    }
                    decodeBtn.innerText = 'Thinking...';
                    try {
                        const textContainer = item.querySelector(window.PF_SELECTOR_MAP.postTextBody);
                        const content = textContainer ? textContainer.textContent : '';
                        
                        const sys = "You decode clickbait. The user provides a sensationalized, low-information headline/post. Read between the lines and state what the post is ACTUALLY about in one blunt, un-emotional sentence.";
                        const answer = await this.engine.prompt(sys, content);
                        
                        decodeBtn.style.background = '#00D4FF';
                        decodeBtn.style.color = '#000';
                        decodeBtn.innerText = `Decoded: ${answer}`;
                    } catch(e) {
                        decodeBtn.innerText = 'Failed to Decode';
                    }
                });

                btnContainer.appendChild(decodeBtn);
            }
        });
    }
}

window.PF_LLMFeatures = PF_LLMFeatures;
