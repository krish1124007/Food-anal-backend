import fs from "fs";
import { groq } from "./groq.js";

function getBase64(source) {
    if (Buffer.isBuffer(source)) {
        return source.toString("base64");
    }
    return fs.readFileSync(source, { encoding: "base64" });
}




const currentTime = new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
});

const SYSTEM_PROMPT = `
You are an expert nutrition-analysis AI with deep knowledge of food labels, ingredients, and nutritional science.
Your task is to analyze the given inputs and return a SINGLE, valid JSON object.

INPUTS:
1. user_today_details: Foods eaten today, current macro/micronutrient intake.
2. user_data: User profile, health conditions, goals, daily limits, user additional info.
3. package_ingredients: FOOD PACKAGE IMAGE (nutrition label + ingredients list).

🔴 CRITICAL INSTRUCTIONS FOR LABEL READING:
1. STRICTLY READ THE NUTRITION LABEL from the image. If a nutrition facts table is visible, use EXACT values. Do NOT guess.
2. INGREDIENTS LIST PRIORITY: Read complete ingredients in quantity order.
3. HARMFUL INGREDIENTS TO FLAG: palm oil, hydrogenated oils, trans fats, HFCS, artificial colors (Red 40, Yellow 5, Yellow 6, Blue 1), sodium benzoate, BHA, BHT, MSG, excessive artificial sweeteners, excessive sodium (>400mg per serving).
4. SERVING SIZE ATTENTION: Respect per serving / per 100g values exactly as shown.
5. LABEL ACCURACY IS MANDATORY.

OUTPUT FORMAT:
Return ONLY a single valid JSON object. No markdown, no explanations.

JSON STRUCTURE:
{
  "DbUpdateIngredients": {
    "calories": number,
    "protein": number,
    "carbs": number,
    "fat": number,
    "sugar": number,
    "fiber": number,
    "vitaminA": number,
    "vitaminB": number,
    "vitaminC": number,
    "vitaminD": number,
    "vitaminE": number,
    "vitaminK": number,
    "calcium": number
  },
  "ingredient_analysis": {
    "healthy_ingredients": string[],
    "neutral_ingredients": string[],
    "harmful_ingredients": string[]
  },
  "additives_and_preservatives": string[],
  "recommendation": "eat" | "avoid" | "eat_limited",
  "eat_or_not": boolean,
  "why_eat": string | null,
  "why_avoid": string | null,
  "health_condition_check": string,
  "today_intake_comparison": string,
  "time_suitability": string,
  "better_alternative": string[]
}

MANDATORY RULES:
- NEVER guess calories, protein, carbs, fat, sugar, fiber if visible on label.
- Be STRICT with harmful ingredient detection.
- Compare with user health conditions.
- Consider current time: ${currentTime}.
- If recommendation is avoid or eat_limited → MUST give alternatives.
- If label text is unclear → lower confidence, be conservative.

Return ONE valid JSON object only.
`;


export async function analyzeFoodImage({
    imageSource,
    user_today_details,
    user_data
}) {
    try {
        const base64Image = getBase64(imageSource);

        const response = await groq.chat.completions.create({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            temperature: 0,
            messages: [
                {
                    role: "system",
                    content: SYSTEM_PROMPT
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `
user_today_details:
${JSON.stringify(user_today_details)}

user_data:
${JSON.stringify(user_data)}

Analyze the FOOD PACKAGE IMAGE carefully and follow all rules.
Return ONLY valid JSON.
`
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Image}`
                            }
                        }
                    ]
                }
            ]
        });

        let raw = response.choices[0].message.content;

        // Clean markdown if present
        let cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();

        try {
            const parsed = JSON.parse(cleaned);
            // Basic validation
            if (!parsed.DbUpdateIngredients || !parsed.recommendation) {
                console.error("AI returned invalid structure:", parsed);
                throw new Error("Invalid AI response structure");
            }
            return parsed;
        } catch (parseError) {
            console.error("Failed to parse AI JSON:", cleaned);
            throw new Error("AI response was not valid JSON");
        }
    } catch (error) {
        console.error("Vision Analysis Error:", error);
        throw error;
    }
}
