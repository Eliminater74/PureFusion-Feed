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

    applyToNodes(nodes) {
        // Quick bypass if LLM engine has no configured provider/API key
        if (!this.engine.isReady()) return;

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

    injectTLDR(rootNode) {
        if (!rootNode.querySelectorAll) return;
        
        // Find text bodies inside feed units
        const textNodes = rootNode.querySelectorAll(window.PF_SELECTOR_MAP.postTextBody);
        
        textNodes.forEach(textContainer => {
            if (textContainer.dataset.pfTldrInjected) return;
            const textContent = textContainer.textContent;
            
            // Only inject TL;DR if post is significantly long (e.g. > 600 chars)
            if (textContent.length > 600) {
                textContainer.dataset.pfTldrInjected = "true";

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
                    btn.innerHTML = `<span style="margin-right: 4px;">⏳</span> Analyzing...`;
                    btn.style.opacity = '0.7';
                    btn.style.pointerEvents = 'none';

                    try {
                        const systemContext = "You are a direct, concise summarizer. Read the user's post and summarize the core point in exactly one short, bulleted sentence. Do not add conversational filler.";
                        const summary = await this.engine.prompt(systemContext, textContent);
                        
                        btn.style.background = '#242526';
                        btn.style.border = '1px solid #00D4FF';
                        btn.style.color = '#00D4FF';
                        btn.style.opacity = '1';
                        btn.innerHTML = `<strong>TL;DR:</strong> ${summary}`;
                    } catch(e) {
                        btn.innerHTML = '⚠️ LLM Error. Check Key.';
                        window.PF_Logger.error(e);
                    }
                });

                textContainer.parentNode.insertBefore(btn, textContainer);
            }
        });
    }

    injectCommentCopilot(rootNode) {
        if (!rootNode.querySelectorAll) return;
        
        // Handle cases where the mutated node is the actual text box, or contains it
        const isMatch = rootNode.matches && rootNode.matches(window.PF_SELECTOR_MAP.commentInputBox);
        const commentBoxes = isMatch ? [rootNode] : Array.from(rootNode.querySelectorAll(window.PF_SELECTOR_MAP.commentInputBox));
        
        commentBoxes.forEach(box => {
            // Because React replaces this element often, we hook into the parent wrapper safely
            const parent = box.closest('form') || box.parentElement;
            if (!parent || parent.dataset.pfCopilotInjected) return;
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

            wand.addEventListener('click', async () => {
                // To generate a logical comment, we need the context of the main post
                const postContainer = window.PF_Helpers.getClosest(box, window.PF_SELECTOR_MAP.postContainer);
                const textContainer = postContainer ? postContainer.querySelector(window.PF_SELECTOR_MAP.postTextBody) : null;
                const postContext = textContainer ? textContainer.textContent : '';

                if (!postContext) {
                    alert('PureFusion: Could not extract parent post context for the AI Copilot.');
                    return;
                }

                wand.innerHTML = '⏳';
                try {
                    const systemContext = "You are a helpful social media assistant writing a short, friendly, and engaging response to the provided post. Make it sound natural, empathetic, and human. Under 2 sentences.";
                    const draft = await this.engine.prompt(systemContext, postContext);
                    
                    // Note: Copy to clipboard because React blocks direct innerHTML manipulation on Draft.js/Lexical inputs often
                    navigator.clipboard.writeText(draft);
                    wand.innerHTML = '✅';
                    setTimeout(() => wand.innerHTML = '🪄', 2000);
                    alert(`Copilot drafted and copied to clipboard:\n\n"${draft}"\n\nPaste it into the box!`);

                } catch(e) {
                    wand.innerHTML = '⚠️';
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
