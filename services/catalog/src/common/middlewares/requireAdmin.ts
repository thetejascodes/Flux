import type { Request, Response, NextFunction } from "express";
import ApiError from "../utils/api-error.js";

const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const role = req.headers["x-user-role"];
  if (role !== "admin") {
    return next(ApiError.forbidden("Admin access required"));
  }
  next();
};
export default requireAdmin;
