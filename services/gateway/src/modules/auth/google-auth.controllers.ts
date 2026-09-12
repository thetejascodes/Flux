import * as googleAuthService from "./google-auth.service.js";
import ApiResponse from "../../common/utils/api-response.js";
import type { Request, Response, NextFunction } from "express";

const googleRedirect = async(req:Request,res:Response)=>{
    return res.redirect(googleAuthService.getGoogleAuthUrl());
};
