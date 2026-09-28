import * as otpService from "./otp.service.js";
import * as authService from "./auth.service.js";
import ApiResponse from "../../common/utils/api-response.js";
import type { RequestOtpInput, VerifyOtpInput } from "./dto/otp.dto.js";
import type { SignUpInput, LoginInput, RefreshInput } from "./dto/auth.dto.js";
import type { NextFunction, Request, Response } from "express";
import logger from "../../common/logger.js";

const requestOtp = async (
  req: Request<{}, {}, RequestOtpInput>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { phone } = req.body;
    logger.info("OTP requested", { phoneLast4: phone.slice(-4) });
    const result = await otpService.requestOtp({ phone });
    return ApiResponse.ok(res, "Otp Sent Successfully", result);
  } catch (error) {
    logger.error("OTP request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
};

const verifyOtp = async (
  req: Request<{}, {}, VerifyOtpInput>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { phone, code } = req.body;
    const result = await otpService.verifyOtp({ phone, code });
    logger.info("OTP verified", { phoneLast4: phone.slice(-4) });
    return ApiResponse.ok(res, "Otp Verified", result);
  } catch (error) {
    logger.warn("OTP verification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
};

const signUp = async (
  req: Request<{}, {}, SignUpInput>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password } = req.body;
    const result = await authService.signUp({ email, password });
    logger.info("user signed up", { email });
    return ApiResponse.created(res, "User Created Successfully", result);
  } catch (error) {
    logger.warn("signup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
};

const login = async (
  req: Request<{}, {}, LoginInput>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password });
    logger.info("user logged in", { email });
    return ApiResponse.ok(res, "User Login Successfully", result);
  } catch (error) {
    logger.warn("login failed", {
      email: req.body.email,
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
};

const refresh = async (
  req: Request<{}, {}, RefreshInput>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refresh({ refreshToken });
    logger.info("token refreshed");
    return ApiResponse.ok(res, "Refresh Token", result);
  } catch (error) {
    logger.warn("token refresh failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
};

export { requestOtp, verifyOtp, signUp, login, refresh };