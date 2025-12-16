class ApiResponse{
    constructor(status,success,message,data)
    {
        this.status = status;
        this.success = success;
        this.message = message;
        this.data = data;
    }
}



export function returnCode(res,status,success,message,data)
{
    return res.status(status)
    .json(
        new ApiResponse(status,success,message,data)
    )
}