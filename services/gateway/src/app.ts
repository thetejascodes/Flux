import express from "express";
import errorHandler from "./common/middleware/errorHandler.js";
import authRoutes from "./modules/auth/auth.routes.js";
import proxyTo from "./common/utils/proxy.utils.js";
import isAuthenticated from "./modules/auth/auth.middleware.js";
import rateLimiter from "./common/middleware/rateLimiter.js";
import config from "./common/config/index.js";
import { db } from "./common/db/index.js";
import { sql } from "drizzle-orm";

const app = express();
const ordersLimiter = rateLimiter({
  windowMs: 60_000,
  max: 30,
  keyPrefix: "orders",
});

app.get("/health", async (req, res) => {
  const checks: Record<string, "ok" | "down"> = {
    database: "ok",
  };
  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    checks.database = "down";
  }
  const allOk = Object.values(checks).every((status) => status === "ok");
  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ok" : "degraded",
    checks,
  });
});

app.use("/catalog", isAuthenticated, proxyTo(config.services.catalogUrl));
app.use("/inventory", isAuthenticated, proxyTo(config.services.inventoryUrl));
app.use(
  "/orders",
  isAuthenticated,
  ordersLimiter,
  proxyTo(config.services.orderUrl),
);
// app.use("/payments",  isAuthenticated, proxyTo(config.services.paymentUrl));
// app.use("/delivery",  isAuthenticated, proxyTo(config.services.deliveryUrl));

app.use(express.json());
app.use("/api/auth", authRoutes);

app.use(errorHandler);

export default app;