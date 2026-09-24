import express from "express";
import errorHandler from "./common/middleware/errorHandler.js";
import authRoutes from "./modules/auth/auth.routes.js";
import proxyTo from "./common/utils/proxy.utils.js";
import isAuthenticated from "./modules/auth/auth.middleware.js";
import rateLimiter from "./common/middleware/rateLimiter.js";
import config from "./common/config/index.js";

const app = express();
const ordersLimiter = rateLimiter({
  windowMs: 60_000,
  max: 30,
  keyPrefix: "orders",
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
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
