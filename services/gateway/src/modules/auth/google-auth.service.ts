import { eq, and } from "drizzle-orm";
import { db } from "../../common/db/index.js";
import { authIdentities, users } from "../../common/db/schema.js";
import ApiError from "../../common/utils/api-error.js";
import config from "../../common/config/index.js";
import { issueTokens } from "./auth.service.js";

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}


const getGoogleAuthUrl = ()=>{
    const params = new URLSearchParams({
        client_id:config.google.clientId,
        redirect_uri:config.google.redirectUri,
        response_type:"code",
        scope: "openid email profile",
        access_type:"offline"
    });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}