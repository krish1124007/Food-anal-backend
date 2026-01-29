import { asyncHandler } from "../../utils/asyncHandler.js";
import { returnCode } from "../../utils/returnCode.js";
import { User } from "../../models/user.models.js";
import { uploadBufferToCloudinary } from "../../middlewares/multer.js"
import { parseAIJSON } from "../../utils/parseJson.js";
import cloudinary from "../../config/cloudinary.js";


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

export async function nutritionAnalyticsAgent(limits, user_Details, product_ingredients) {
    const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8000";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second timeout

    try {
        const response = await fetch(
            `${PYTHON_BACKEND_URL}/analyze`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    dailyuserlimits: limits,
                    user_Details,
                    product_Details: product_ingredients
                }),
                signal: controller.signal
            }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            console.error("Python AI error:", {
                status: response.status,
                statusText: response.statusText,
                errorDetails: errorData
            });
            throw new Error(`AI service failed: ${response.status} - ${errorData?.detail || response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('AI service timeout - please try again');
        }
        throw error;
    }
}

async function setDailyLimits(user_details) {
    const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8000";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second timeout

    try {
        const result = await fetch(`${PYTHON_BACKEND_URL}/setDailyLimits`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                user_Details: user_details
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Daily limits service timeout - please try again');
        }
        throw error;
    }
}

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

    const result = await setDailyLimits({
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
    })

    let aiRaw = await result.json();
    const aiResponse = parseAIJSON(aiRaw.data);

    if (!aiResponse) {
        return returnCode(res, 500, false, "Failed to parse AI response", null);
    }

    user.dailyLimits = aiResponse;
    user.markModified('dailyLimits');
    await user.save();
    console.log(aiResponse)

    return returnCode(res, 200, true, "successfully fetch all details", aiResponse);
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

    console.log("Sending to AI - product_Details:", product_Details);

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

    console.log(typeof JSON.parse(aiResult.ai_response));

    return returnCode(res, 200, true, "Successfully fetched AI analysis", JSON.parse(aiResult.ai_response));
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
    const user = await User.findById(req.user.id);
    if (!user) {
        return returnCode(res, 404, false, "User not found", null);
    }

    // Get last 30 days of history
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
    // Placeholder for AI Chat backend logic
    // The user requested NOT to implement the actual AI call here.
    const { message } = req.body;

    // Mock response
    return returnCode(res, 200, true, "Message received", {
        reply: "This is a simulated AI response. The actual AI integration is pending implementation."
    });
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
