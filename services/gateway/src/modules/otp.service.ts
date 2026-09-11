import sendOtp from "./auth/otp.js";
import { db } from "../common/db/index.js";
import { authIdentities, otpCodes, sessions, users } from "../common/db/schema.js";
import crypto, { randomInt } from "crypto";
import { count, eq, and, gt, gte, desc } from "drizzle-orm";
import ApiError from "../common/utils/api-error.js";
import {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from "../common/utils/jwt.utils.js";
const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const requestOtp = async (phone: string) => {
  const phoneHash = hashToken(phone);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const row = await db
    .select({ recentCount: count() })
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.phoneHash, phoneHash),
        gt(otpCodes.createdAt, oneHourAgo),
      ),
    );
  const recentCount = row[0]?.recentCount ?? 0;
  if (recentCount >= 3) {
    throw ApiError.tooManyRequests("Too many attempts, try again later");
  }
  const code = randomInt(100000, 999999).toString();
  const codeHash = hashToken(code);
  const otpCode = await db.insert(otpCodes).values({
    phoneHash: phoneHash,
    codeHash: codeHash,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    consumed: false,
  });
  await sendOtp(phone, code);
  return { success: true };
};

const verifyOtp = async (phone: string, submittedCode: string) => {
  const phoneHash = hashToken(phone);
  const submitedCodeHash = hashToken(submittedCode);
  const currentTime = new Date(Date.now());
  const consumedRow = db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.phoneHash, phoneHash),
          eq(otpCodes.codeHash, submitedCodeHash),
          eq(otpCodes.consumed, false),
          gt(otpCodes.expiresAt, currentTime),
        ),
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1)
      .for("update");
    if (!row) {
      throw ApiError.badRequest("Invalid or expired code");
    }
    const [updated] = await tx
      .update(otpCodes)
      .set({ consumed: true })
      .where(eq(otpCodes.id, row.id))
      .returning();
    return updated;
  });
  const [extingUser] = await db
    .select()
    .from(users)
    .where(eq(users.phone, phoneHash));
  let user = extingUser;
  if (!user) {
    user = await db.transaction(async (tx) => {
      const [newUser] = await tx.insert(users).values({ phone }).returning();
      if (!newUser) {
        throw ApiError.internal("Failed to create user");
      }
      await tx.insert(authIdentities).values({
        userId: newUser.id,
        provider: "otp",
        providerUid: phone,
      });
      return newUser;
    });
  }
  const accessToken = generateAccessToken({userId:user.id});
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);

  await db.insert(sessions).values({
    userId:user.id,
    refreshTokenHash,
    expiresAt:new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  return {accessToken,refreshToken,user}
};

