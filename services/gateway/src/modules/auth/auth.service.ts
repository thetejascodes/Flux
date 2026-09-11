import { db } from "../../common/db/index.js";
import { users, sessions, authIdentities } from "../../common/db/schema.js";
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  verifyAccessToken,
} from "../../common/utils/jwt.utils.js";
import ApiError from "../../common/utils/api-error.js";
import type { SignUpInput, LoginInput, RefreshInput } from "./dto/auth.dto.js";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcrypt";
const SALT_ROUNDS = 12;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const issueTokens = async (userId: string, role: string) => {
  const accessToken = generateAccessToken({ userId });
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  await db.insert(sessions).values({
    userId,
    refreshTokenHash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  return { accessToken, refreshToken };
};
const signUp = async ({ email, password }: SignUpInput) => {
  const [existing] = await db
    .select()
    .from(authIdentities)
    .where(
      and(
        eq(authIdentities.provider, "email"),
        eq(authIdentities.providerUid, email),
      ),
    );
  if (existing) {
    throw ApiError.conflict("An account with this email already exists");
  }
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await db.transaction(async (tx) => {
    const [newUser] = await tx
      .insert(users)
      .values({
        email,
      })
      .returning();
    if (!newUser) {
      throw ApiError.internal("Failed to create user");
    }
    await tx.insert(authIdentities).values({
      userId: newUser.id,
      provider: "email",
      providerUid: email,
      passwordHash,
    });
    return newUser;
  });
  return { id: user.id, email: user.email };
};

const login = async ({ email, password }: LoginInput) => {
  const [identify] = await db
    .select()
    .from(authIdentities)
    .where(
      and(
        eq(authIdentities.provider, "email"),
        eq(authIdentities.providerUid, email),
      ),
    );
  if (!identify || !identify.passwordHash) {
    throw ApiError.unauthorized("Invalid email or password");
  }
  const isValid = await bcrypt.compare(password, identify.passwordHash);
  if (!isValid) {
    throw ApiError.unauthorized("Invalid email or password");
  }
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, identify.userId));
    if(!user){
        throw ApiError.internal("User record missing for existing identity");
    }
    return issueTokens(user.id,user.role ?? "user");
};
const refresh = async ({ refreshToken }: RefreshInput) => {};

export { issueTokens, signUp, login, refresh };
