import { db } from "../../common/db/index.js";
import { users,sessions,authIdentities } from "../../common/db/schema.js";
import { generateAccessToken,generateRefreshToken,hashRefreshToken,verifyAccessToken } from "../../common/utils/jwt.utils.js";
import ApiError from "../../common/utils/api-error.js";
import type { SignUpInput,LoginInput,RefreshInput } from "./dto/auth.dto.js";

const SALT_ROUNDS = 12;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; 

const issueTokens = async(userId:string, role:string)=>{
    const accessToken = generateAccessToken({userId});
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    await db.insert(sessions).values({
        userId,
        refreshTokenHash,
        expiresAt:new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    })
    return{accessToken,refreshToken};
}



export {issueTokens}