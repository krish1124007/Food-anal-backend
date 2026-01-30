import { asyncHandler } from "../../utils/asyncHandler.js";
import { returnCode } from "../../utils/returnCode.js";
import { User } from "../../models/user.models.js";
import { uploadBufferToCloudinary } from "../../middlewares/multer.js"
import { parseAIJSON } from "../../utils/parseJson.js";
import cloudinary from "../../config/cloudinary.js";
import { getGroqCompletion } from "../../utils/groq.js";
import { analyzeFoodImage } from "../../utils/imageprocessing.js";


const clearCloudinaryImages = asyncHandler(async (req, res) => {
    try {
        const result = await cloudinary.api.delete_resources_by_prefix('Food/');
        console.log("Cloudinary Delete Result:", result);
        return returnCode(res, 200, true, "Successfully cleared Food images from Cloudinary", result);
    } catch (error) {
        console.error("Cloudinary Clear Error:", error);
        return returnCode(res, 500, false, "Failed to clear images from Cloudinary", error.message);
    }
});




const updateUser = asyncHandler(async (req, res) => {
    const { user_update_object } = req.body;
    const user = await User.findByIdAndUpdate(req.user.id, user_update_object, { new: true });

    if (!user) {
        return returnCode(res, 500, false, "user is not found", null);
    }

    return returnCode(res, 200, true, "user updated successfully", user);
})

const deleteUser = asyncHandler(async (req, res) => {
    const user = await User.findByIdAndDelete(req.user.id);
    if (!user) {
        return returnCode(res, 500, false, "user is not found", null);
    }
    return returnCode(res, 200, true, "user deleted successfully", user);
})

const setTheDailyLimits = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) {
        return returnCode(res, 500, false, "user is not found", null);
    }

    // Activity multiplier
    const activityMap = {
        low: 1.2,
        moderate: 1.5,
        high: 1.8,
        very_high: 2.0
    };
    const mltp = activityMap[user.activityLevel] || 1.2;

    // BMR
    let bmr = 0;
    if (user.gender === "male") {
        bmr = (10 * user.weight) + (6.25 * user.height) - (5 * user.age) + 5;
    } else {
        bmr = (10 * user.weight) + (6.25 * user.height) - (5 * user.age) - 161;
    }

    const cal = Math.round(bmr * mltp);

    // Protein
    const proteinFactorMap = {
        healthy_life: 0.8,
        lose: 1.4,
        gain: 2.0,
        athlete: 2.4
    };
    const factor = proteinFactorMap[user.goals] || 0.8;
    const protein = user.weight * factor;
    const proteinCalories = protein * 4;

    // Fat (25%)
    const fatCalories = cal * 0.25;
    const fats = fatCalories / 9;

    // Carbs = remaining calories
    const carbCalories = cal - (proteinCalories + fatCalories);
    const carbs = carbCalories / 4;

    // Fiber
    const fiber = Math.floor(cal / 1000) * 14;

    console.log(cal, protein, carbs, fats, fiber);

    // System prompt from Python backend
    const SYSTEM_PROMPT = `You are a certified nutrition and health analysis AI.

The user will provide their personal profile details (age, gender, height, weight, activity level, goals, illness, and additional info) and a set of PRE-CALCULATED daily nutrition limits (calories, protein, carbs, fat, fiber).

Your objective is to:
1. **Analyze User Health Data**: Examine the user's illnesses (e.g., diabetes, blood pressure, etc.) and goals.
2. **Review and Adjust Baseline Limits**: Evaluate the pre-calculated limits (calories, protein, carbs, fat, fiber) provided by the system. If they are not appropriate for the user's specific health condition or goals, ADJUST them reasonably. For example:
   - For diabetics: Ensure carbs and sugar are strictly controlled.
   - For muscle building: Ensure protein is sufficient.
   - For heart/cholesterol issues: Monitor fat and fiber.
3. **Calculate Missing Metrics**: 
   - Calculate the daily **sugar** limit based on total calorie intake and health conditions.
   - Calculate the daily **calcium** limit (in mg) based on the user's age and gender.
4. **Set Vitamin Limits (RND)**: Determine the daily limits for Vitamin A, B, C, D, E, and K according to RND (Recommended Nutritional Data/RDA) for the user's profile.

Rules:
1. Use scientifically accepted nutrition standards (WHO / RDA / ICMR).
2. All values must be realistic, safe, and personalized.
3. Use the following units:
   - Calories: kcal
   - Macronutrients: grams (g)
   - Minerals (Calcium): milligrams (mg)
   - Vitamins: Set values in mg or µg as per standard guidelines.
4. Return ONLY a valid JSON object.
5. Do NOT add explanations, comments, markdown, or extra text.
6. Do NOT rename, remove, or add any keys.
7. Ensure all values are numbers (no strings, no nulls).

Return the JSON in exactly the structure below:

{
  "calories": ,
  "protein": ,
  "carbs": ,
  "fat": ,
  "sugar": ,
  "fiber": ,
  "vitaminA": ,
  "vitaminB": ,
  "vitaminC": ,
  "vitaminD": ,
  "vitaminE": ,
  "vitaminK": ,
  "calcium": 
}`;

    const userProfileData = {
        age: user.age,
        gender: user.gender,
        height: user.height,
        weight: user.weight,
        activityLevel: user.activityLevel,
        goals: user.goals,
        illness: user.illnesses,
        AdditionalInfo: user.AdditionalInfo,
        dailyLimits: {
            calories: cal,
            protein: protein,
            carbs: carbs,
            fat: fats,
            fiber: fiber
        }
    };

    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `User Profile Details:\n${JSON.stringify(userProfileData, null, 2)}` }
    ];

    try {
        // Use Groq directly instead of Python backend
        const aiResponseText = await getGroqCompletion(messages, {
            model: "llama-3.1-8b-instant",
            temperature: 0.3
        });

        const aiResponse = parseAIJSON(aiResponseText);

        if (!aiResponse) {
            return returnCode(res, 500, false, "Failed to parse AI response", null);
        }

        user.dailyLimits = aiResponse;
        user.markModified('dailyLimits');
        await user.save();
        console.log(aiResponse);

        return returnCode(res, 200, true, "successfully fetch all details", aiResponse);
    } catch (error) {
        console.error("Error generating daily limits:", error);
        return returnCode(res, 500, false, "Failed to generate daily limits", error.message);
    }
})

const askToAiToEatOrNot = asyncHandler(async (req, res) => {
    const { name_of_food, des } = req.body;
    const user = req.user;

    if (!name_of_food || typeof name_of_food !== 'string' || name_of_food.trim() === '') {
        return returnCode(res, 400, false, "Food name is required and must be a non-empty string", null);
    }

    if (des && typeof des !== 'string') {
        return returnCode(res, 400, false, "Food description must be a string if provided", null);
    }

    if (!req.file) {
        return returnCode(res, 400, false, "Food image is required", null);
    }

    console.log("The file is : ", req.file)

    const uploadResult = await uploadBufferToCloudinary(req.file.buffer, "Food");
    console.log("upload result is : ", uploadResult)

    const main_user = await User.findById(user.id);

    const product_Details = {
        image_url: uploadResult.secure_url,
        name: name_of_food,
        description: des && des.trim() ? des.trim() : "No description provided"
    };

    console.log("Sending to AI Vision - product_Details:", product_Details);

    // Get today's intake for context
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIntake = main_user.nutritionHistory.find(h => {
        const hDate = new Date(h.date);
        hDate.setHours(0, 0, 0, 0);
        return hDate.getTime() === today.getTime();
    }) || { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0 };

    /* 
    // OLD Python-based Nutrition Analysis
    const aiResult = await nutritionAnalyticsAgent(
        main_user.dailyLimits,
        {
            age: main_user.age,
            gender: main_user.gender,
            height: main_user.height,
            weight: main_user.weight,
            activityLevel: main_user.activityLevel,
            goals: main_user.goals,
            illness: main_user.illnesses,
            AdditionalInfo: main_user.AdditionalInfo
        },
        product_Details
    );
    */

    // NEW Groq Vision Analysis
    const visionResult = await analyzeFoodImage({
        imageSource: req.file.buffer, // We pass the buffer directly
        user_today_details: {
            todayIntake,
            dailyLimits: main_user.dailyLimits
        },
        user_data: {
            age: main_user.age,
            gender: main_user.gender,
            height: main_user.height,
            weight: main_user.weight,
            activityLevel: main_user.activityLevel,
            goals: main_user.goals,
            illnesses: main_user.illnesses,
            additionalHealthInfo: main_user.AdditionalInfo
        }
    });

    console.log("Vision analysis complete");

    return returnCode(res, 200, true, "Successfully fetched AI analysis", visionResult);
});

const acceptFood = asyncHandler(async (req, res) => {
    const { limits_update, date } = req.body;
    const user_id = req.user.id;

    console.log("--- acceptFood Debug ---");
    console.log("User ID:", user_id);
    console.log("Request Body:", JSON.stringify(req.body, null, 2));

    const user = await User.findById(user_id);

    if (!user) {
        return returnCode(res, 500, false, "user is not found", null);
    }

    let targetDate;
    if (date) {
        targetDate = new Date(date);
    } else {
        targetDate = new Date();
    }
    targetDate.setHours(0, 0, 0, 0);

    let targetHistory = user.nutritionHistory.find(h => {
        const hDate = new Date(h.date);
        hDate.setHours(0, 0, 0, 0);
        return hDate.getTime() === targetDate.getTime();
    });

    if (!targetHistory) {
        console.log("Creating new history entry for date:", targetDate);
        user.nutritionHistory.push({
            date: targetDate,
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            sugar: 0,
            fiber: 0,
            vitaminA: 0,
            vitaminB: 0,
            vitaminC: 0,
            vitaminD: 0,
            vitaminE: 0,
            vitaminK: 0,
            calcium: 0
        });
        targetHistory = user.nutritionHistory[user.nutritionHistory.length - 1];
    } else {
        console.log("Found existing history entry.");
    }

    console.log("History Before Update:", JSON.stringify(targetHistory, null, 2));

    const updateStats = (target, source) => {
        for (const key in source) {
            if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                updateStats(target[key], source[key]);
            }
            else {
                let val = source[key];
                if (typeof val === 'string') {
                    val = parseFloat(val);
                }

                if (typeof val === 'number' && !isNaN(val)) {
                    if (typeof target[key] !== 'number') {
                        target[key] = 0;
                    }
                    console.log(`Updating ${key}: ${target[key]} + ${val}`);
                    target[key] += val;
                }
            }
        }
    };

    if (limits_update) {
        updateStats(targetHistory, limits_update);
    } else {
        console.warn("No limits_update provided in request body");
    }

    console.log("History After Update:", JSON.stringify(targetHistory, null, 2));

    await user.save();

    return returnCode(res, 200, true, "successfully updated intake history", user);
})

const getUserDetails = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) {
        return returnCode(res, 404, false, "User not found", null);
    }
    return returnCode(res, 200, true, "User details fetched successfully", user);
});

const getHealthReport = asyncHandler(async (req, res) => {
    const { date } = req.query;
    const user = await User.findById(req.user.id);
    if (!user) {
        return returnCode(res, 404, false, "User not found", null);
    }

    if (date) {
        const targetDate = new Date(date);
        targetDate.setHours(0, 0, 0, 0);

        const dayData = user.nutritionHistory.find(h => {
            const hDate = new Date(h.date);
            hDate.setHours(0, 0, 0, 0);
            return hDate.getTime() === targetDate.getTime();
        });

        if (dayData) {
            return returnCode(res, 200, true, "Selected day report fetched", {
                dayData,
                dailyLimits: user.dailyLimits,
                isSpecificDate: true
            });
        }
    }

    // Default: Get last 30 days of history
    const history = user.nutritionHistory.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 30);

    // Calculate averages
    const averages = {
        calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0
    };

    if (history.length > 0) {
        history.forEach(day => {
            averages.calories += day.calories || 0;
            averages.protein += day.protein || 0;
            averages.carbs += day.carbs || 0;
            averages.fat += day.fat || 0;
            averages.sugar += day.sugar || 0;
            averages.fiber += day.fiber || 0;
        });

        Object.keys(averages).forEach(key => {
            averages[key] = Math.round(averages[key] / history.length);
        });
    }

    const report = {
        history: history.reverse(), // Send chronological for charts
        averages,
        dailyLimits: user.dailyLimits,
        streak: calculateStreak(user.nutritionHistory), // Helper needed or just simplified
        summary: "Your nutrition tracking is going well. " + (averages.protein < (user.dailyLimits?.protein || 50) ? "Try to increase protein intake." : "Protein intake is good.")
    };

    return returnCode(res, 200, true, "Health report generated", report);
});

const getRecommendations = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) {
        return returnCode(res, 404, false, "User not found", null);
    }

    // Simple rule-based recommendations engine
    const recommendations = [];
    const limits = user.dailyLimits || {};

    // Goals based
    if (user.goals === 'lose_weight') {
        recommendations.push({
            type: 'diet',
            title: 'Caloric Deficit',
            description: 'Maintain a slight caloric deficit. Focus on high-volume, low-calorie foods like hydration-rich vegetables.'
        });
    } else if (user.goals === 'build_muscle') {
        recommendations.push({
            type: 'diet',
            title: 'Protein Priority',
            description: 'Ensure you are hitting your protein targets to support muscle repair and growth.'
        });
    }

    // General Health
    recommendations.push({
        type: 'general',
        title: 'Hydration',
        description: 'Drink at least 8 glasses of water daily to maintain optimal metabolism.'
    });

    if (user.illnesses && user.illnesses.includes('diabetes')) {
        recommendations.push({
            type: 'medical',
            title: 'Sugar Management',
            description: 'Monitor glycemic index of foods. Avoid simple carbs and sugary drinks.'
        });
    }

    return returnCode(res, 200, true, "Recommendations fetched", recommendations);
});

const aiChat = asyncHandler(async (req, res) => {
    const { message, chatHistory } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
        return returnCode(res, 404, false, "User not found", null);
    }

    // Extracting user health information for AI context
    const userContext = {
        name: user.name,
        age: user.age,
        gender: user.gender,
        height: user.height,
        weight: user.weight,
        activityLevel: user.activityLevel,
        goals: user.goals,
        illnesses: user.illnesses,
        dailyLimits: user.dailyLimits,
        additionalHealthInfo: user.AdditionalInfo
    };

    const systemPrompt = `You are a specialized health and nutrition AI assistant for the 'Food Activity' app.
    
    USER PROFILE:
    ${JSON.stringify(userContext, null, 2)}
    
    STRICT GUIDELINES:
    1. Always address the user as ${user.name}.
    2. Your knowledge is strictly limited to health, nutrition, diet, fitness, and the features of this app.
    3. If the user asks anything NOT related to these topics (e.g., politics, coding, general news, jokes), politely refuse to answer and redirect them to health-related questions.
    4. Provide personalized advice based on the USER PROFILE provided above.
    5. Be professional, encouraging, and concise.
    6. Do not give medical prescriptions; instead, suggest consulting a doctor for specialized medical issues.`;

    const messages = [
        { role: "system", content: systemPrompt },
        ...(chatHistory || []),
        { role: "user", content: message }
    ];

    try {
        const reply = await getGroqCompletion(messages);
        return returnCode(res, 200, true, "Success", { reply });
    } catch (error) {
        return returnCode(res, 500, false, "AI Chat service failed", error.message);
    }
});

// Helper Function
function calculateStreak(history) {
    if (!history || history.length === 0) return 0;

    const sorted = [...history].sort((a, b) => new Date(b.date) - new Date(a.date));
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if entry exists for today or yesterday to start streak
    const lastEntryDate = new Date(sorted[0].date);
    lastEntryDate.setHours(0, 0, 0, 0);

    const diffTime = Math.abs(today - lastEntryDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 1) return 0; // Streak broken

    // This is a naive streak calculation, assuming daily entries. 
    // Real implementation would check consecutive dates.
    streak = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
        const curr = new Date(sorted[i].date);
        const next = new Date(sorted[i + 1].date);
        curr.setHours(0, 0, 0, 0);
        next.setHours(0, 0, 0, 0);

        const diff = (curr - next) / (1000 * 60 * 60 * 24);
        if (diff === 1) {
            streak++;
        } else {
            break;
        }
    }
    return streak;
}

export {
    askToAiToEatOrNot,
    acceptFood,
    setTheDailyLimits,
    updateUser,
    deleteUser,
    clearCloudinaryImages,
    getUserDetails,
    getHealthReport,
    getRecommendations,
    aiChat
}
