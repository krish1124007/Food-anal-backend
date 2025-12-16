import { app } from "./app.js";
import { connectDB } from "./db/index.js";
import resetTheDailyLimits from "./cron/resetTheDailyLimits.js";




connectDB().then(() => {
    resetTheDailyLimits();
    app.listen(process.env.PORT, () => {
        console.log(`Server is running on port ${process.env.PORT}`);
    })
}).catch((error) => {
    console.log(error);
})