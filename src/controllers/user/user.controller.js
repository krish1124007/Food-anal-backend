import { asyncHandler } from "../../utils/asyncHandler.js";
import { returnCode } from "../../utils/returnCode.js";
import { User } from "../../models/user.models.js";
import { uploadBufferToCloudinary } from "../../middlewares/multer.js"
import { parseAIJSON } from "../../utils/parseJson.js";

async function AiAnswer(limits, user_Details, product_ingredients) {

    const result = await fetch("http://localhost:8000/analyze", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            dailyuserlimits: limits,
            user_Details: user_Details,
            product_Details: product_ingredients
        })
    })
    return result;
}

async function setDailyLimits(user_details) {
    const result = await fetch("http://localhost:8000/setDailyLimits", {
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
    const user = req.user
    const result = await uploadBufferToCloudinary(req.file.buffer, 'Food');

    const main_user = await User.findById(user.id);


    const main_result = await AiAnswer(main_user.dailyLimits, {
        age: main_user.age,
        gender: main_user.gender,
        height: main_user.height,
        weight: main_user.weight,
        activityLevel: main_user.activityLevel,
        goals: main_user.goals,
    }, {
        image_url: result.secure_url,
        name: name_of_food,
        description: des
    });


    const aiResponse = await main_result.json();
    console.log(aiResponse)

    return returnCode(res, 200, true, "successfully fetch all details", aiResponse);

})

const AcceptFood = asyncHandler(async (req, res) => {
    const { limits_update } = req.body;

    const user_id = req.user.id;

    const user = await User.findById(user_id);

    if (!user) {
        return returnCode(res, 500, false, "user is not found", null);
    }


    // Recursive function to update limits (subtracting values)
    const updateStats = (target, source) => {
        for (const key in source) {
            if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                if (!target[key]) target[key] = {};
                updateStats(target[key], source[key]);
            } else if (typeof source[key] === 'number') {
                if (typeof target[key] === 'number') {
                    target[key] -= source[key];
                } else {
                    target[key] = -source[key];
                }
            }
        }
    };

    updateStats(user.dailyLimits, limits_update);
    user.markModified('dailyLimits');

    await user.save();

    return returnCode(res, 200, true, "successfully updated limits", user);
})


export {
    askToAiToEatOrNot,
    AcceptFood,
    setTheDailyLimits
}
 


// in the fronend when the click on the scan than open the camara and also give option to click photo upload from galarray ad not upload photo after the seelct sif click the photo than show after click if select from galaary than after that show the that phoot and two input food name and description and add the button scan after the scan user can se two button Eat and reject and summary about the