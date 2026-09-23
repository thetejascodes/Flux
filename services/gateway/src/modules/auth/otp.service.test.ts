import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../../common/db/index.js";
import { users, authIdentities, otpCodes } from "../../common/db/schema.js";

vi.mock("./otp.js", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

import sendOtp from "./otp.js";
import { requestOtp, verifyOtp } from "./otp.service.js";

const mockedSendOtp = vi.mocked(sendOtp);

const randomPhone = () =>
  `+1555${Math.floor(1000000 + Math.random() * 8999999)}${randomUUID().slice(0, 4)}`;

const hashToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const lastCodeSentTo = (phone: string): string => {
  const call = [...mockedSendOtp.mock.calls]
    .reverse()
    .find(([p]) => p === phone);
  if (!call) throw new Error(`sendOtp was never called for ${phone}`);
  return call[1] as string;
};

beforeEach(() => {
  mockedSendOtp.mockClear();
});

describe("requestOtp", () => {
  it("sends a 6-digit code and reports success", async () => {
    const phone = randomPhone();

    const result = await requestOtp({ phone });

    expect(result).toEqual({ success: true });
    expect(mockedSendOtp).toHaveBeenCalledTimes(1);
    const [sentPhone, code] = mockedSendOtp.mock.calls[0]!;
    expect(sentPhone).toBe(phone);
    expect(code).toMatch(/^\d{6}$/);
  });

  it("stores only a hash of the code, never the raw code", async () => {
    const phone = randomPhone();
    await requestOtp({ phone });
    const code = lastCodeSentTo(phone);
    const phoneHash = hashToken(phone);

    const [row] = await db
      .select()
      .from(otpCodes)
      .where(eq(otpCodes.phoneHash, phoneHash));

    expect(row).toBeDefined();
    expect(row?.codeHash).not.toBe(code);
    expect(row?.codeHash).toBe(hashToken(code));
  });

  it("rate-limits after 3 requests for the same phone within an hour", async () => {
    const phone = randomPhone();
    await requestOtp({ phone });
    await requestOtp({ phone });
    await requestOtp({ phone });

    await expect(requestOtp({ phone })).rejects.toThrow(/too many attempts/i);
    // the 4th (rejected) request must never actually be sent
    expect(mockedSendOtp).toHaveBeenCalledTimes(3);
  });

  it("does not let one phone's rate limit affect another", async () => {
    const busyPhone = randomPhone();
    const freshPhone = randomPhone();
    await requestOtp({ phone: busyPhone });
    await requestOtp({ phone: busyPhone });
    await requestOtp({ phone: busyPhone });

    await expect(requestOtp({ phone: freshPhone })).resolves.toEqual({
      success: true,
    });
  });
});

describe("verifyOtp", () => {
  it("creates a new user and an otp auth identity on first verification", async () => {
    const phone = randomPhone();
    await requestOtp({ phone });
    const code = lastCodeSentTo(phone);

    const result = await verifyOtp({ phone, code });

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();

    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    expect(user).toBeDefined();

    const [identity] = await db
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, "otp"),
          eq(authIdentities.providerUid, phone),
        ),
      );
    expect(identity).toBeDefined();
    expect(identity?.userId).toBe(user!.id);
  });

  it("reuses the existing user on a later verification, without duplicating it", async () => {
    const phone = randomPhone();
    await requestOtp({ phone });
    const first = await verifyOtp({ phone, code: lastCodeSentTo(phone) });

    await requestOtp({ phone });
    const second = await verifyOtp({ phone, code: lastCodeSentTo(phone) });

    expect(second.accessToken).toBeTruthy();
    expect(second.refreshToken).not.toBe(first.refreshToken);

    const matchingUsers = await db
      .select()
      .from(users)
      .where(eq(users.phone, phone));
    expect(matchingUsers).toHaveLength(1);
  });

  it("rejects an incorrect code", async () => {
    const phone = randomPhone();
    await requestOtp({ phone });

    await expect(verifyOtp({ phone, code: "000000" })).rejects.toThrow(
      /invalid or expired code/i,
    );
  });

  it("rejects reusing an already-consumed code", async () => {
    const phone = randomPhone();
    await requestOtp({ phone });
    const code = lastCodeSentTo(phone);

    await verifyOtp({ phone, code });

    await expect(verifyOtp({ phone, code })).rejects.toThrow(
      /invalid or expired code/i,
    );
  });

  it("rejects an expired code", async () => {
    const phone = randomPhone();
    const code = "123456";
    await db.insert(otpCodes).values({
      phoneHash: hashToken(phone),
      codeHash: hashToken(code),
      expiresAt: new Date(Date.now() - 1000),
      consumed: false,
    });

    await expect(verifyOtp({ phone, code })).rejects.toThrow(
      /invalid or expired code/i,
    );
  });

  it("rejects a code for a phone that never requested one", async () => {
    await expect(
      verifyOtp({ phone: randomPhone(), code: "123456" }),
    ).rejects.toThrow(/invalid or expired code/i);
  });
});
