import Groq from "groq-sdk";
import dotenv from "dotenv"

dotenv.config({});

export const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export const getGroqCompletion = async (messages, model = "llama-3.1-8b-instant") => {
    try {
        const response = await groq.chat.completions.create({
            messages,
            model,
            temperature: 0.7,
            max_tokens: 1024,
            top_p: 1,
            stream: false,
            stop: null,
        });

        return response.choices[0]?.message?.content || "";
    } catch (error) {
        console.error("Groq API Error:", error);
        throw new Error("Failed to get response from Groq AI");
    }
};
