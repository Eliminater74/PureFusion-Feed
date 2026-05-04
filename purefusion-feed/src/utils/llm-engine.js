/**
 * PureFusion Feed - LLM Engine (Bring Your Own Key)
 * 
 * Secure abstraction layer for routing prompts to OpenAI or Gemini.
 * Keys are loaded from local storage and NEVER sent anywhere but the direct 
 * official provider endpoints. Handled entirely client-side.
 */

class PF_LLMEngine {
    constructor(settings) {
        this.settings = settings;
    }

    /**
     * Checks if the user has configured an active AI provider
     */
    isReady() {
        const p = this.settings.llm.provider;
        if (p === 'none') return false;
        if (p === 'openai' && this.settings.llm.openAIApiKey.trim().length > 10) return true;
        if (p === 'gemini' && this.settings.llm.geminiApiKey.trim().length > 10) return true;
        if (p === 'windowai') return ('ai' in window); // Chrome Built-in Nano Support
        return false;
    }

    /**
     * Main reasoning router
     */
    async prompt(systemContext, userPrompt) {
        if (!this.isReady()) return null;

        const provider = this.settings.llm.provider;
        
        try {
            if (provider === 'gemini') {
                return await this._callGemini(systemContext, userPrompt);
            } else if (provider === 'openai') {
                return await this._callOpenAI(systemContext, userPrompt);
            } else if (provider === 'windowai') {
                return await this._callWindowAI(systemContext, userPrompt);
            }
        } catch (error) {
            PF_Logger.error(`PF_LLMEngine Error (${provider}):`, error);

            const rawMessage = error && error.message ? String(error.message) : 'Unknown error';
            const isFetchFailure = /failed to fetch|networkerror|network request failed/i.test(rawMessage);
            if (isFetchFailure) {
                return '⚠️ AI Error - Network or permission blocked. Re-save AI provider in settings.';
            }

            const safeMessage = rawMessage.length > 110 ? `${rawMessage.slice(0, 110)}...` : rawMessage;
            return `⚠️ AI Error - ${safeMessage}`;
        }
    }

    async _callGemini(system, prompt) {
        const apiKey = (this.settings.llm.geminiApiKey || '').trim();
        if (!apiKey) throw new Error('Gemini API key is missing.');

        const discoveredModels = await this._fetchGeminiModelNames(apiKey);
        const models = this._buildGeminiModelPriority(discoveredModels);
        const apiVersions = ['v1beta', 'v1'];

        const payload = {
            systemInstruction: {
                parts: [{ text: system }]
            },
            contents: [{
                role: 'user',
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: 0.3
            }
        };

        let lastError = null;

        for (const version of apiVersions) {
            for (const model of models) {
                const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent`;

                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': apiKey
                    },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    const errText = await this._safeErrorText(res);
                    lastError = new Error(`Gemini API ${res.status}: ${errText}`);

                    if (this._shouldTryNextGeminiModel(res.status, errText)) {
                        continue;
                    }

                    throw lastError;
                }

                const data = await res.json();
                const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text && text.trim()) {
                    return text.trim();
                }

                throw new Error('Gemini returned an empty response.');
            }
        }

        throw lastError || new Error('No compatible Gemini model is available for this API key.');
    }

    async _callOpenAI(system, prompt) {
        const apiKey = this.settings.llm.openAIApiKey;
        const url = 'https://api.openai.com/v1/chat/completions';
        
        const payload = {
            model: 'gpt-4o-mini', // Cost efficient by default
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: prompt }
            ],
            temperature: 0.3 // Keep it factual for summaries
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('OpenAI API HTTP Error: ' + res.status);
        const data = await res.json();
        
        if (data && data.choices && data.choices.length > 0) {
            return data.choices[0].message.content;
        }
        throw new Error('Invalid OpenAI response format.');
    }

    async _callWindowAI(system, prompt) {
        // Experimental Chrome built-in Gemini Nano API
        if (!('ai' in window)) throw new Error('window.ai is not available.');
        const session = await window.ai.createTextSession();
        const response = await session.prompt(`[SYSTEM]: ${system}\n[USER]: ${prompt}`);
        session.destroy();
        return response;
    }

    async _safeErrorText(response) {
        try {
            const text = await response.text();
            if (!text) return 'Unknown error';

            try {
                const parsed = JSON.parse(text);
                return parsed?.error?.message || text;
            } catch {
                return text;
            }
        } catch {
            return 'Unknown error';
        }
    }

    async _fetchGeminiModelNames(apiKey) {
        const versions = ['v1beta', 'v1'];
        const found = [];

        for (const version of versions) {
            try {
                const url = `https://generativelanguage.googleapis.com/${version}/models`;
                const res = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'x-goog-api-key': apiKey
                    }
                });

                if (!res.ok) continue;

                const data = await res.json();
                const models = data?.models || [];

                models.forEach((model) => {
                    const supportsGenerate = Array.isArray(model.supportedGenerationMethods)
                        && model.supportedGenerationMethods.includes('generateContent');
                    const name = model?.name || '';
                    if (!supportsGenerate || !name.startsWith('models/')) return;

                    const shortName = name.replace('models/', '').trim();
                    if (!shortName) return;
                    found.push(shortName);
                });
            } catch {
                // Soft-fail: we can still use built-in fallback model names.
            }
        }

        return [...new Set(found)];
    }

    _buildGeminiModelPriority(discovered = []) {
        const preferred = [
            'gemini-2.5-flash',
            'gemini-2.0-flash',
            'gemini-1.5-flash',
            'gemini-1.5-pro',
            'gemini-pro'
        ];

        const rankedDiscovered = discovered
            .filter((name) => /^gemini/i.test(name))
            .sort((a, b) => {
                const aFlash = /flash/i.test(a) ? 1 : 0;
                const bFlash = /flash/i.test(b) ? 1 : 0;
                if (aFlash !== bFlash) return bFlash - aFlash;
                return a.localeCompare(b);
            });

        return [...new Set([...preferred, ...rankedDiscovered])];
    }

    _shouldTryNextGeminiModel(status, errText = '') {
        if (status === 404) return true;

        const msg = String(errText || '').toLowerCase();
        if (status === 400 && (
            msg.includes('not found for api version')
            || msg.includes('is not found')
            || msg.includes('unsupported for generatecontent')
            || msg.includes('models/')
        )) {
            return true;
        }

        return false;
    }
}

window.PF_LLMEngine = PF_LLMEngine;
