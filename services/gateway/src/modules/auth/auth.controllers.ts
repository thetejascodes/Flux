import * as otpService from "./otp.service.js";
import * as authService from "./auth.service.js";
import ApiResponse from "../../common/utils/api-response.js";
import type { RequestOtpInput, VerifyOtpInput } from "./dto/otp.dto.js";
import type { NextFunction, Request, Response } from "express";

const requestOtp = async (
  req: Request<{}, {}, RequestOtpInput>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { phone } = req.body;
    const result = await otpService.requestOtp({ phone });
    return ApiResponse.ok(res, "Otp Sent Successfully", result);
  } catch (error) {
    next(error);
  }
};

const verifyOtp = async (req: Request<{}, {}, VerifyOtpInput>,
  res: Response,
  next: NextFunction,) => {
  try {
    const {phone,code} = req.body; 
    const result = await otpService.verifyOtp({phone,code});
    return ApiResponse.ok(res,"Otp Verified",result);
  } catch (error) {
    next(error);
  }
};

const signUp = async (req: Request, res: Response) => {
  try {
  } catch (error) {}
};

const login = async (req: Request, res: Response) => {
  try {
  } catch (error) {}
};
const refresh = async (req: Request, res: Response) => {
  try {
  } catch (error) {}
};
