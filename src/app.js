import express from "express";
import dotenv from "dotenv";
import cors from "cors"
import { errorHandler } from "./utils/globalErrorHandler.js";
import { user_router } from "./routes/user.router.js"

dotenv.config({});


const app = express();

app.use(cors({
    origin: "*"
}))
app.use(express.json())




app.use("/api/v1/users", user_router);



// app.use(errorHandler)





export {
    app
}
