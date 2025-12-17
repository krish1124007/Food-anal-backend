import { asyncHandler } from "../../utils/asyncHandler.js";
import { returnCode } from "../../utils/returnCode.js";
import { User } from "../../models/user.models.js";
import { uploadBufferToCloudinary } from "../../middlewares/multer.js"
import { parseAIJSON } from "../../utils/parseJson.js";

export async function AiAnswer(limits, user_Details, product_ingredients) {
    const response = await fetch(
        "https://food-py-back.onrender.com/analyze",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                dailyuserlimits: limits,
                user_Details,
                product_Details: product_ingredients
            })
        }
    );

    if (!response.ok) {
        const text = await response.text();
        console.error("Python AI error:", text);
        throw new Error("AI service failed");
    }

    return await response.json();
}


async function setDailyLimits(user_details) {
    const result = await fetch("https://food-py-back.onrender.com/setDailyLimits", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            user_Details: user_details
        })
    })
    return result;
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

    const uploadResult = await uploadBufferToCloudinary(
        req.file.buffer,
        "Food"
    );

    const main_user = await User.findById(user.id);

    const aiResult = await AiAnswer(
        main_user.dailyLimits,
        {
            age: main_user.age,
            gender: main_user.gender,
            height: main_user.height,
            weight: main_user.weight,
            activityLevel: main_user.activityLevel,
            goals: main_user.goals,
        },
        {
            image_url: uploadResult.secure_url,
            name: name_of_food,
            description: des
        }
    );

    return returnCode(
        res,
        200,
        true,
        "Successfully fetched AI analysis",
        aiResult
    );
});


const acceptFood = asyncHandler(async (req, res) => {
    const { limits_update } = req.body;
    const user_id = req.user.id;

    const user = await User.findById(user_id);

    if (!user) {
        return returnCode(res, 500, false, "user is not found", null);
    }

    // 1. Identify Today's Date (ignoring time for comparison)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 2. Find today's history entry
    let todayHistory = user.nutritionHistory.find(h => {
        const hDate = new Date(h.date);
        hDate.setHours(0, 0, 0, 0);
        return hDate.getTime() === today.getTime();
    });

    // 3. If not found, create it
    if (!todayHistory) {
        user.nutritionHistory.push({
            date: today,
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            sugar: 0,
            fiber: 0,
            micronutrients: {}
        });
        todayHistory = user.nutritionHistory[user.nutritionHistory.length - 1]; // Get the newly added reference
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
    updateStats(todayHistory, limits_update);

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


