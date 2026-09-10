function optional(key: string, fallback: string) {
  return process.env[key] ?? fallback;
}

function required(key: string) {
  const value = process.env[key];
  if (!value) {
    throw new Error("Missing required env var: " + key);
  }
  return value;
}

const config = {
  port: Number(optional("PORT", "4000")),
  database: {
    url: required("DATABASE_URL"),
  },
  jwt: {
    privateKey: Buffer.from(process.env.JWT_PRIVATE_KEY!, "base64").toString(
      "utf-8",
    ),
    publicKey: Buffer.from(process.env.JWT_PUBLIC_KEY!, "base64").toString(
      "utf-8",
    ),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",

    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  },
  twilio: {
    accountSid: optional("TWILIO_ACCOUNT_SID", ""),
    apiKeySid: optional("TWILIO_API_KEY_SID", ""),
    apiKeySecret: optional("TWILIO_API_KEY_SECRET", ""),
    fromNumber: optional("TWILIO_FROM_NUMBER", ""),
  },
  otpStubMode: optional("OTP_STUB_MODE", "true"),
};

export default config;
