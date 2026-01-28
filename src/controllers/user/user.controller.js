import { asyncHandler } from "../../utils/asyncHandler.js";
import { returnCode } from "../../utils/returnCode.js";
import { User } from "../../models/user.models.js";
import { uploadBufferToCloudinary } from "../../middlewares/multer.js"
import { parseAIJSON } from "../../utils/parseJson.js";

export async function nutritionAnalyticsAgent(limits, user_Details, product_ingredients) {
    const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8000";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

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
            // Get the error details from FastAPI
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
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

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




//user update functions

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

    const result = await setDailyLimits({
        age: user.age,
        gender: user.gender,
        height: user.height,
        weight: user.weight,
        activityLevel: user.activityLevel,
        goals: user.goals,
        illness: user.illnesses,
        AdditionalInfo: user.AdditionalInfo
    })

    let aiRaw = await result.json();
    const aiResponse = parseAIJSON(aiRaw);

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

    // Validate required fields
    if (!name_of_food || typeof name_of_food !== 'string' || name_of_food.trim() === '') {
        return returnCode(
            res,
            400,
            false,
            "Food name is required and must be a non-empty string",
            null
        );
    }

    // Validate description (optional but if provided, should be string)
    if (des && typeof des !== 'string') {
        return returnCode(
            res,
            400,
            false,
            "Food description must be a string if provided",
            null
        );
    }


    if (!req.file) {
        return returnCode(
            res,
            400,
            false,
            "Food image is required",
            null
        );
    }

    console.log("The file is : ", req.file)

    const uploadResult = await uploadBufferToCloudinary(
        req.file.buffer,
        "Food"
    );

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

    return returnCode(
        res,
        200,
        true,
        "Successfully fetched AI analysis",
        JSON.parse(aiResult.ai_response)
    );
});


const acceptFood = asyncHandler(async (req, res) => {
    const { limits_update, date } = req.body;
    const user_id = req.user.id;

    const user = await User.findById(user_id);

    if (!user) {
        return returnCode(res, 500, false, "user is not found", null);
    }

    // 1. Identify Target Date
    // If date is provided (YYYY-MM-DD), use it. Otherwise fall back to server today.
    let targetDate;
    if (date) {
        targetDate = new Date(date);
    } else {
        targetDate = new Date();
    }
    // Normalize to midnight for consistent comparison
    targetDate.setHours(0, 0, 0, 0);

    // 2. Find history entry for that date
    let targetHistory = user.nutritionHistory.find(h => {
        const hDate = new Date(h.date);
        hDate.setHours(0, 0, 0, 0);
        return hDate.getTime() === targetDate.getTime();
    });

    // 3. If not found, create it
    if (!targetHistory) {
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
    }

    // 4. Recursive Update Function for History (Incrementing)
    const updateStats = (target, source) => {
        for (const key in source) {
            if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {}; // Ensure nested object exists
                updateStats(target[key], source[key]); // Recurse
            } else if (typeof source[key] === 'number') {
                // Initialize if undefined
                if (typeof target[key] !== 'number') {
                    target[key] = 0;
                }
                // ADD the value (Consumption increases)
                target[key] += source[key];
            }
        }
    };

    // Apply updates to the history entry
    updateStats(targetHistory, limits_update);

    await user.save();

    return returnCode(res, 200, true, "successfully updated intake history", user);
})


export {
    askToAiToEatOrNot,
    acceptFood,
    setTheDailyLimits,
    updateUser,
    deleteUser
}


