import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../../common/db/index.js";
import { users, authIdentities } from "../../common/db/schema.js";
import config from "../../common/config/index.js";
import {
  getGoogleAuthUrl,
  exchangeCodeForTokens,
  getGoogleUserInfo,
  loginWithGoogle,
} from "./google-auth.service.js";

const fakeTokenResponse = {
  access_token: "fake-access-token",
  id_token: "fake-id-token",
  expires_in: 3600,
  token_type: "Bearer",
  scope: "openid email profile",
};

const fakeProfile = (
  overrides: Partial<{ sub: string; email: string }> = {},
) => ({
  sub: overrides.sub ?? `google-${randomUUID()}`,
  email: overrides.email ?? `test-${randomUUID()}@example.com`,
  email_verified: true,
  name: "Test User",
});

const jsonResponse = (body: unknown, ok = true): Promise<Response> =>
  Promise.resolve({
    ok,
    json: () => Promise.resolve(body),
  } as Response);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getGoogleAuthUrl", () => {
  it("builds the Google authorization URL with the expected params", () => {
    const url = new URL(getGoogleAuthUrl());

    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("client_id")).toBe(config.google.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(
      config.google.redirectUri,
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("access_type")).toBe("offline");
  });
});

describe("exchangeCodeForTokens", () => {
  it("returns the token payload on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      await jsonResponse(fakeTokenResponse),
    );

    const result = await exchangeCodeForTokens("auth-code");

    expect(result).toEqual(fakeTokenResponse);
    expect(fetch).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws when Google rejects the code", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      await jsonResponse({ error: "invalid_grant" }, false),
    );

    await expect(exchangeCodeForTokens("bad-code")).rejects.toThrow(
      /google authorization failed/i,
    );
  });
});

describe("getGoogleUserInfo", () => {
  it("returns the profile on success, authorized with the given access token", async () => {
    const profile = fakeProfile();
    vi.mocked(fetch).mockResolvedValueOnce(await jsonResponse(profile));

    const result = await getGoogleUserInfo("some-access-token");

    expect(result).toEqual(profile);
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect((init as RequestInit).headers).toEqual({
      Authorization: "Bearer some-access-token",
    });
  });

  it("throws when the profile fetch fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(await jsonResponse({}, false));

    await expect(getGoogleUserInfo("bad-token")).rejects.toThrow(
      /failed to fetch google profile/i,
    );
  });
});

describe("loginWithGoogle", () => {
  it("creates a new user and a google auth identity on first login", async () => {
    const profile = fakeProfile();
    vi.mocked(fetch)
      .mockResolvedValueOnce(await jsonResponse(fakeTokenResponse))
      .mockResolvedValueOnce(await jsonResponse(profile));

    const result = await loginWithGoogle("auth-code");

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();

    const [identity] = await db
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, "google"),
          eq(authIdentities.providerUid, profile.sub),
        ),
      );
    expect(identity).toBeDefined();

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, identity!.userId));
    expect(user?.email).toBe(profile.email);
  });

  it("logs in the existing user on a repeat login, without a duplicate identity", async () => {
    const profile = fakeProfile();
    vi.mocked(fetch)
      .mockResolvedValueOnce(await jsonResponse(fakeTokenResponse))
      .mockResolvedValueOnce(await jsonResponse(profile));
    const first = await loginWithGoogle("auth-code");

    vi.mocked(fetch)
      .mockResolvedValueOnce(await jsonResponse(fakeTokenResponse))
      .mockResolvedValueOnce(await jsonResponse(profile));
    const second = await loginWithGoogle("auth-code-2");

    expect(second.accessToken).toBeTruthy();
    expect(second.refreshToken).not.toBe(first.refreshToken);

    const identities = await db
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, "google"),
          eq(authIdentities.providerUid, profile.sub),
        ),
      );
    expect(identities).toHaveLength(1);
  });

  it("propagates a token-exchange failure without creating a user", async () => {
    const profile = fakeProfile();
    vi.mocked(fetch).mockResolvedValueOnce(await jsonResponse({}, false));

    await expect(loginWithGoogle("bad-code")).rejects.toThrow(
      /google authorization failed/i,
    );

    const matches = await db
      .select()
      .from(users)
      .where(eq(users.email, profile.email));
    expect(matches).toHaveLength(0);
  });

  it("propagates a profile-fetch failure without creating a user", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(await jsonResponse(fakeTokenResponse))
      .mockResolvedValueOnce(await jsonResponse({}, false));

    await expect(loginWithGoogle("auth-code")).rejects.toThrow(
      /failed to fetch google profile/i,
    );
  });
});
