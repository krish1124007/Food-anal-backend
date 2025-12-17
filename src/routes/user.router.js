import {
    askToAiToEatOrNot,
    setTheDailyLimits,
    acceptFood,
    updateUser,
    deleteUser
} from "../controllers/user/user.controller.js"
import {
    createAccount,
    login
} from "../controllers/user/user.auth.controller.js"
import { Router } from "express"
import { auth } from "../middlewares/auth.js"
import { upload } from "../middlewares/multer.js"


const router = Router();



router.route("/create-account").post(createAccount);
router.route("/login").post(login);
router.route("/ask-to-ai-to-eat-or-not").post(auth,upload.single("file"),askToAiToEatOrNot);
router.route("/set-daily-limits").post(auth,setTheDailyLimits);
router.route("/accept-food").post(auth,acceptFood);
router.route("/update-user").post(auth,updateUser);
router.route("/delete-user").post(auth,deleteUser);


export const user_router = router;