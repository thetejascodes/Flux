import { Router } from "express";
import * as authController from "./auth.controllers.js";
import * as googleAuthController from "./google-auth.controllers.js";
import validate from "../../common/middleware/validateMiddleware.js";
import rateLimiter from "../../common/middleware/rateLimiter.js";
import { RequestOtpDto,VerifyOtpDto } from "./dto/otp.dto.js";
import { SignUpDto,LoginDto,RefreshDto } from "./dto/auth.dto.js";

const router = Router();

const authLimiter = rateLimiter({ windowMs: 60_000, max: 10, keyPrefix: "auth" });

router.post("/signup",authLimiter,validate(SignUpDto),authController.signUp);
router.post("/login",authLimiter,validate(LoginDto),authController.login);
router.post("/refresh",authLimiter,validate(RefreshDto),authController.refresh);

router.post("/otp/request",authLimiter,validate(RequestOtpDto),authController.requestOtp);
router.post("/otp/verify",authLimiter,validate(VerifyOtpDto),authController.verifyOtp);

router.get("/google",googleAuthController.googleRedirect);
router.get("/google/callback",googleAuthController.googleCallback);

export default router;