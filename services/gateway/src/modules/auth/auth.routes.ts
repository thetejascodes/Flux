import { Router } from "express";
import * as authController from "./auth.controllers.js";
import validate from "../../common/middleware/validateMiddleware.js";
import { RequestOtpDto,VerifyOtpDto } from "./dto/otp.dto.js";
import { SignUpDto,LoginDto,RefreshDto } from "./dto/auth.dto.js";

const router = Router();

router.post("/signup",validate(SignUpDto),authController.signUp);
router.post("/login",validate(LoginDto),authController.login);


export default router;