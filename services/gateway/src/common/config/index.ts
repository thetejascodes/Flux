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
  port: Number(optional("PORT", "8000")),
  database: {
    url: required("DATABASE_URL"),
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
