import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../../common/db/index.js";
import { users, sessions, authIdentities } from "../../common/db/schema.js";
import { signUp, login, refresh, issueTokens } from "./auth.service.js";

const randomEmail = () => `test-${randomUUID()}@example.com`;

describe("signUp", () => {
  it("creates a user and an email identity", async () => {
    const email = randomEmail();
    const result = await signUp({ email, password: "correct-horse-1" });

    expect(result.email).toBe(email);

    const [identity] = await db
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, "email"),
          eq(authIdentities.providerUid, email),
        ),
      );

    expect(identity).toBeDefined();
    expect(identity?.passwordHash).not.toBe("correct-horse-1"); // never stored raw
    expect(identity?.userId).toBe(result.id);
  });

  it("rejects a second signup with the same email", async () => {
    const email = randomEmail();
    await signUp({ email, password: "correct-horse-1" });

    await expect(
      signUp({ email, password: "different-password-2" }),
    ).rejects.toThrow(/already exists/i);
  });
});

describe("login", () => {
  it("succeeds with the correct password and returns both tokens", async () => {
    const email = randomEmail();
    await signUp({ email, password: "correct-horse-1" });

    const result = await login({ email, password: "correct-horse-1" });

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it("rejects an incorrect password", async () => {
    const email = randomEmail();
    await signUp({ email, password: "correct-horse-1" });

    await expect(login({ email, password: "wrong-password" })).rejects.toThrow(
      /invalid email or password/i,
    );
  });

  it("rejects a login for an email that was never signed up, with the SAME message as a wrong password", async () => {
    // deliberately checking this stays vague — a different message here
    // would let an attacker enumerate which emails have accounts
    await expect(
      login({ email: randomEmail(), password: "anything" }),
    ).rejects.toThrow(/invalid email or password/i);
  });
});

describe("refresh", () => {
  it("issues a new token pair and invalidates the old refresh token", async () => {
    const email = randomEmail();
    await signUp({ email, password: "correct-horse-1" });
    const { refreshToken: firstRefreshToken } = await login({
      email,
      password: "correct-horse-1",
    });

    const result = await refresh({ refreshToken: firstRefreshToken });

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.refreshToken).not.toBe(firstRefreshToken);

    // the old refresh token must now be dead — rotation only means
    // something if reuse is actually rejected, not just "a new one works"
    await expect(refresh({ refreshToken: firstRefreshToken })).rejects.toThrow(
      /invalid or expired refresh token/i,
    );
  });

  it("rejects a refresh token that never existed", async () => {
    await expect(refresh({ refreshToken: "not-a-real-token" })).rejects.toThrow(
      /invalid or expired refresh token/i,
    );
  });
});

describe("issueTokens", () => {
  it("creates a session row with roughly a 7-day expiry", async () => {
    const email = randomEmail();
    const user = await signUp({ email, password: "correct-horse-1" });

    const before = Date.now();
    await issueTokens(user.id, "user");
    const after = Date.now();

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id));

    expect(session).toBeDefined();

    const expectedMin = before + 7 * 24 * 60 * 60 * 1000 - 5000; // 5s tolerance
    const expectedMax = after + 7 * 24 * 60 * 60 * 1000 + 5000;
    expect(session!.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(session!.expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
  });
});
