import cron from "node-cron";
import { User } from "../../models/user.models.js";


const resetTheDailyLimits = () => {
    // Schedule task to run at 12:00 AM (midnight)
    cron.schedule('0 0 * * *', async () => {
        console.log('Running daily limit reset task...');

        try {
            const users = await User.find({});

            for (const user of users) {
                // 1. Create a new intakeHistorySchema (Archiving current state or just logging date)
                // Assuming we just want to mark the new day. 
                // If we wanted to archive "yesterday's" intake, we'd need to calculate it (Goal - Remaining).
                // For now, per request "create the new intakeHistorySchema",
                // 1. Archive current daily limits to history
                // We snapshot the "remaining" (or modified) limits of the day into history.
                // Note: user.dailyLimits is a Mongoose object, so we convert to object to detach it.
                const historyEntry = user.dailyLimits.toObject ? user.dailyLimits.toObject() : { ...user.dailyLimits };
                delete historyEntry._id; // avoid id collision if any
                historyEntry.date = new Date();

                user.nutritionHistory.push(historyEntry);

                await user.save();
            }
            console.log('Daily limits archived.');

        } catch (error) {
            console.error('Error in daily limit reset task:', error);
        }
    });
};

export default resetTheDailyLimits;
