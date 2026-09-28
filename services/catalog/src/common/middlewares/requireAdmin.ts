import type { Request, Response, NextFunction } from "express";
import ApiError from "../utils/api-error.js";
import logger from "../logger.js";

const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const role = req.headers["x-user-role"];
  if (role !== "admin") {
    logger.warn("admin access denied", {
      userId: req.headers["x-user-id"],
      role,
      method: req.method,
      path: req.originalUrl,
    });
    return next(ApiError.forbidden("Admin access required"));
  }
  next();
};
export default requireAdmin;