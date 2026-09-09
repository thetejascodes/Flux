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
};

export default config;
