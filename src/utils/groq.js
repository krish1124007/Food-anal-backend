import Groq from "groq-sdk";
import dotenv from "dotenv"

dotenv.config({});

export const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export const getGroqCompletion = async (messages, options = {}) => {
    try {
        // Support both old signature (messages, model) and new signature (messages, options)
        const model = typeof options === 'string' ? options : (options.model || "llama-3.1-8b-instant");
        const temperature = typeof options === 'object' ? (options.temperature ?? 0.7) : 0.7;
        const max_tokens = typeof options === 'object' ? (options.max_tokens ?? 1024) : 1024;

        const response = await groq.chat.completions.create({
            messages,
            model,
            temperature,
            max_tokens,
            top_p: options.top_p ?? 1,
            stream: false,
            stop: null,
        });

        return response.choices[0]?.message?.content || "";
    } catch (error) {
        console.error("Groq API Error:", error);
        throw new Error("Failed to get response from Groq AI");
    }
};
