import { eq, and } from "drizzle-orm";
import { db } from "../../common/db/index.js";
import { authIdentities, sessions, users } from "../../common/db/schema.js";
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

const getGoogleAuthUrl = () => {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

const exchangeCodeForTokens = async (
  code: string,
): Promise<GoogleTokenResponse> => {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.google.redirectUri,
    }),
  });
  if (!response.ok) {
    throw ApiError.unauthorized("Google authorization failed");
  }
  return response.json() as Promise<GoogleTokenResponse>;
};

const getGoogleUserInfo = async (
  accessToken: string,
): Promise<GoogleUserInfo> => {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok) {
    throw ApiError.unauthorized("Failed to fetch Google profile");
  }

  return response.json() as Promise<GoogleUserInfo>;
};

const loginWithGoogle = async (code: string) => {
  const googleTokens = await exchangeCodeForTokens(code);
  const profile = await getGoogleUserInfo(googleTokens.access_token);

  const [identify] = await db
    .select()
    .from(authIdentities)
    .where(
      and(
        eq(authIdentities.provider, "google"),
        eq(authIdentities.providerUid, profile.sub),
      ),
    );
  let userId: string;
  let role: string;
  if (identify) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, identify.userId));
    if (!user) {
      throw ApiError.internal(
        "User record missing for existing Google identity",
      );
    }
    userId = user.id;
    role = user.role ?? "user";
  } else {
    const created = await db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(users)
        .values({
          email: profile.email,
        })
        .returning();
      if (!newUser) {
        throw ApiError.internal("Failed to create user");
      }

      await tx.insert(authIdentities).values({
        userId: newUser.id,
        provider: "google",
        providerUid: profile.sub,
      });
      return newUser;
    });
    userId = created.id;
    role = created.role ?? "user";
  }
  return issueTokens(userId, role);
};
