import { returnCode } from "./returnCode.js";
import { asyncHandler } from "./asyncHandler.js"
import { models } from "../model.admin.js";

export function CRUD(config = {}, model) {

    return asyncHandler(async (req, res) => {
        let db = models[model];

        if (config.readAll) {
            const data = await db.find({});

            return returnCode(res, 200, true, "fetch all data successfully", data)
        }
        else if (config.readById) {
            const { id } = req.params;
            const data = await db.findById(id);

            if (!data) {
                return returnCode(res, 404, false, "Data not found");
            }

            return returnCode(res, 200, true, "Data fetched successfully", data);
        }
        else if (config.readBy_) {
            const field = config.readBy_;
            const value = req.params[field] || req.body[field] || req.query[field];

            if (!value) {
                return returnCode(res, 400, false, `${field} is required`);
            }

            const data = await db.findOne({ [field]: value });
            if (!data) {
                return returnCode(res, 404, false, "Data not found");
            }

            return returnCode(res, 200, true, "Data fetched successfully", data);
        }

        else if (config.create) {
            const data = await db.create(req.body);
            if (!data) {
                return returnCode(res, 400, false, "Data creation failed");
            }
            return returnCode(res, 201, true, "Data created successfully", data);
        }
        else if (config.update) {
            const { id } = req.params;
            const data = await db.findByIdAndUpdate(id, req.body, { new: true });

            if (!data) {
                return returnCode(res, 404, false, "Data not found");
            }

            return returnCode(res, 200, true, "Data updated successfully", data);
        }

        else if (config.delete) {
            const { id } = req.params;
            const data = await db.findByIdAndDelete(id);

            if (!data) {
                return returnCode(res, 404, false, "Data not found");
            }

            return returnCode(res, 200, true, "Data deleted successfully", data);
        }
    })
}