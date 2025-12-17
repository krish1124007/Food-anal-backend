import cron from "node-cron";
import { User } from "../models/user.models.js";


const resetTheDailyLimits = () => {
    // Schedule task to run at 12:00 AM (midnight)
    cron.schedule('0 0 * * *', async () => {
        console.log('Running daily intake reset task...');

        try {
            const users = await User.find({});
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            for (const user of users) {
                // Check if entry already exists (in case job ran twice or manually triggered)
                const exists = user.nutritionHistory.some(h => {
                    const hDate = new Date(h.date);
                    hDate.setHours(0, 0, 0, 0);
                    return hDate.getTime() === today.getTime();
                });

                if (!exists) {
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
                    await user.save();
                }
            }
            console.log('Daily intake entries initialized for all users.');

        } catch (error) {
            console.error('Error in daily intake reset task:', error);
        }
    });
};

export default resetTheDailyLimits;
