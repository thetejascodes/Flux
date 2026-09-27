import * as googleAuthService from "./google-auth.service.js";
import ApiResponse from "../../common/utils/api-response.js";
import type { Request, Response, NextFunction } from "express";
import ApiError from "../../common/utils/api-error.js";
import logger from "../../common/logger.js";

const googleRedirect = async (req: Request, res: Response) => {
  logger.info("redirecting to Google OAuth");
  return res.redirect(googleAuthService.getGoogleAuthUrl());
};

const googleCallback = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const code = req.query.code as string | undefined;
    if (!code) {
      throw ApiError.badRequest("Missing authorization code from Google");
    }
    const result = await googleAuthService.loginWithGoogle(code);
    logger.info("Google login successful", {
      userId: result.accessToken ? "issued" : undefined,
    });

    return ApiResponse.ok(res, "Google login successful", result);
  } catch (error) {
    logger.error("Google login failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    next(error);
  }
};

export { googleRedirect, googleCallback };
