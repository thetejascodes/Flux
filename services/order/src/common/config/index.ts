function optional(key: string, fallback: string) {
  return process.env[key] ?? fallback;
}
function required(key: string) {
  const value = process.env[key];
  if (!value) throw new Error("Missing required env var: " + key);
  return value;
}

const config = {
  port: Number(optional("PORT", "4003")),
  database: { url: required("DATABASE_URL") },
  rabbitmq: { url: required("RABBITMQ_URL") },
  services: {
    catalogUrl: required("CATALOG_SERVICE_URL"),
  },
  cart: {
    abandonAfterMinutes: Number(optional("CART_ABANDON_MINUTES", "30")),
    sweepIntervalMs: Number(optional("CART_SWEEP_INTERVAL_MS", "60000")),
    sweepBatchSize: Number(optional("CART_SWEEP_BATCH_SIZE", "100")),
  },
  shipping: {
    freeThreshold: Number(optional("FREE_SHIPPING_THRESHOLD", "500")),
    flatFee: Number(optional("SHIPPING_FLAT_FEE", "40")),
  },
};

export default config;
