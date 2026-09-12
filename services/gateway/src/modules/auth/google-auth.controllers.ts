import * as googleAuthService from "./google-auth.service.js";
import ApiResponse from "../../common/utils/api-response.js";
import type { Request, Response, NextFunction } from "express";
import ApiError from "../../common/utils/api-error.js";

const googleRedirect = async (req: Request, res: Response) => {
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
    return ApiResponse.ok(res, "Google login successful", result);
  } catch (error) {
    next(error);
  }
};
