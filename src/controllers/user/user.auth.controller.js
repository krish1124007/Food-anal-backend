import { asyncHandler } from "../../utils/asyncHandler.js";
import { returnCode } from "../../utils/returnCode.js";
import { User } from "../../models/user.models.js";



const createAccount = asyncHandler(async(req,res)=>{

    const {name,email,password,age,gender,height,weight,activityLevel,illnesses,goals} = req.body;
    if(!name || !email || !password || !age || !gender || !height || !weight || !activityLevel || !illnesses || !goals){
        return returnCode(res,400,false,"All fields are required");
    }

    console.log("code is run")

    const user = await User.create({
        name,
        email,
        password,
        age,
        gender,
        height,
        weight,
        activityLevel,
        illnesses,
        goals
    })

    if(!user)
    {
        return returnCode(res,400,false,"User not created");
    }

    const token = user.generateToken();

    if(!token)
    {
        returnCode(res,500,false,"something error in generating the accesstoken",null);
    }
    

    return returnCode(res,201,true,"User created successfully",{user,token});
})

const login = asyncHandler(async(req,res)=>{
    const {email,password} = req.body;
    if(!email || !password){
        return returnCode(res,400,false,"All fields are required");
    }

    const user = await User.findOne({email}).select("+password");;
    if(!user)
    {
        return returnCode(res,400,false,"User not found");
    }

    const isMatch = await user.comparePassword(password);
    if(!isMatch)
    {
        return returnCode(res,400,false,"Invalid credentials");
    }

    const token = user.generateToken();
    res.cookie("token",token,{
        httpOnly:true,
        secure:true,
        sameSite:"strict",
        maxAge:24*60*60*1000
    })

    return returnCode(res,200,true,"Login successful",{user,token});
})

export {
    createAccount,
    login
}