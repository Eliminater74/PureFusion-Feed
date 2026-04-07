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
            return "⚠️ AI Error - Check your API key or network connection.";
        }
    }

    async _callGemini(system, prompt) {
        const apiKey = this.settings.llm.geminiApiKey;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
        
        const payload = {
            contents: [{ parts: [{ text: `SYSTEM INSTRUCTIONS: ${system}\n\nUSER PROMPT: ${prompt}` }] }]
            // Note: In v1beta we combine system and user if system roles aren't strictly isolated for pure pro models
        };

        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("Gemini API HTTP Error: " + res.status);
        const data = await res.json();
        
        if (data && data.candidates && data.candidates.length > 0) {
            return data.candidates[0].content.parts[0].text;
        }
        throw new Error("Invalid Gemini response format.");
    }

    async _callOpenAI(system, prompt) {
        const apiKey = this.settings.llm.openAIApiKey;
        const url = "https://api.openai.com/v1/chat/completions";
        
        const payload = {
            model: "gpt-4o-mini", // Cost efficient by default
            messages: [
                { role: "system", content: system },
                { role: "user", content: prompt }
            ],
            temperature: 0.3 // Keep it factual for summaries
        };

        const res = await fetch(url, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("OpenAI API HTTP Error: " + res.status);
        const data = await res.json();
        
        if (data && data.choices && data.choices.length > 0) {
            return data.choices[0].message.content;
        }
        throw new Error("Invalid OpenAI response format.");
    }

    async _callWindowAI(system, prompt) {
        // Experimental Chrome built-in Gemini Nano API
        if (!('ai' in window)) throw new Error("window.ai is not available.");
        const session = await window.ai.createTextSession();
        const response = await session.prompt(`[SYSTEM]: ${system}\n[USER]: ${prompt}`);
        session.destroy();
        return response;
    }
}

window.PF_LLMEngine = PF_LLMEngine;
