import { describe, it, expect, vi, afterEach } from "vitest";
import config from "../../common/config/index.js";

const { messagesCreate } = vi.hoisted(() => ({
  messagesCreate: vi.fn().mockResolvedValue({ sid: "SM_fake" }),
}));

vi.mock("twilio", () => ({
  default: vi.fn(() => ({
    messages: { create: messagesCreate },
  })),
}));

import sendOtp from "./otp.js";

describe("sendOtp", () => {
  const originalStubMode = config.otpStubMode;

  afterEach(() => {
    (config as { otpStubMode: boolean }).otpStubMode = originalStubMode;
    messagesCreate.mockClear();
  });

  it("logs the code to the console and skips Twilio when stub mode is on", async () => {
    (config as { otpStubMode: boolean }).otpStubMode = true;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendOtp("+15551234567", "123456");

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("123456"));
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("+15551234567"),
    );
    expect(messagesCreate).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it("sends a real SMS via Twilio when stub mode is off", async () => {
    (config as { otpStubMode: boolean }).otpStubMode = false;

    await sendOtp("+15551234567", "123456");

    expect(messagesCreate).toHaveBeenCalledWith({
      body: "Your Flux verification code is: 123456",
      from: config.twilio.fromNumber,
      to: "+15551234567",
    });
  });

  it("propagates a Twilio failure", async () => {
    (config as { otpStubMode: boolean }).otpStubMode = false;
    messagesCreate.mockRejectedValueOnce(new Error("Twilio is down"));

    await expect(sendOtp("+15551234567", "123456")).rejects.toThrow(
      /twilio is down/i,
    );
  });
});
