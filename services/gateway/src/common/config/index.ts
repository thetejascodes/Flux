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
    privateKey: Buffer.from(required("JWT_PRIVATE_KEY"), "base64").toString(
      "utf-8",
    ),
    publicKey: Buffer.from(required("JWT_PUBLIC_KEY"), "base64").toString(
      "utf-8",
    ),
    accessExpiresIn: optional("JWT_ACCESS_EXPIRES_IN", "15m"),
  },

  twilio: {
    accountSid: optional("TWILIO_ACCOUNT_SID", ""),
    apiKeySid: optional("TWILIO_API_KEY_SID", ""),
    apiKeySecret: optional("TWILIO_API_KEY_SECRET", ""),
    fromNumber: optional("TWILIO_FROM_NUMBER", ""),
  },

  google: {
    clientId: optional("GOOGLE_CLIENT_ID", ""),
    clientSecret: optional("GOOGLE_CLIENT_SECRET", ""),
    redirectUri: optional("GOOGLE_REDIRECT_URI", ""),
  },
  services: {
    catalogUrl: optional("CATALOG_SERVICE_URL", "http://localhost:4001"),
  },

  otpStubMode: optional("OTP_STUB_MODE", "true") === "true",
};

export default config;
