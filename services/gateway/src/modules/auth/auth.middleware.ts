import { verifyAccessToken } from "../../common/utils/jwt.utils.js";
import type { Request, Response, NextFunction } from "express";
import ApiError from "../../common/utils/api-error.js";

const isAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw ApiError.unauthorized("No token provided");
    }
    const token = header.replace("Bearer ", "");
    const payload = verifyAccessToken(token);
    req.userId = payload.userId;
    next();
  } catch (error) {
    next(error);
  }
};

export default isAuthenticated;
