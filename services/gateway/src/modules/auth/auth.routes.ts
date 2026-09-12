import { Router } from "express";
import * as authController from "./auth.controllers.js";
import * as googleAuthController from "./google-auth.controllers.js";
import validate from "../../common/middleware/validateMiddleware.js";
import { RequestOtpDto,VerifyOtpDto } from "./dto/otp.dto.js";
import { SignUpDto,LoginDto,RefreshDto } from "./dto/auth.dto.js";

const router = Router();

router.post("/signup",validate(SignUpDto),authController.signUp);
router.post("/login",validate(LoginDto),authController.login);
router.post("/refresh",validate(RefreshDto),authController.refresh);

router.post("/otp/request",validate(RequestOtpDto),authController.requestOtp);
router.post("/otp/verify",validate(VerifyOtpDto),authController.verifyOtp);

router.get("/google",googleAuthController.googleRedirect);
router.get("/google/callback",googleAuthController.googleCallback);

export default router;