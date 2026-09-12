import express from "express";
import errorHandler from "./common/middleware/errorHandler.js";
import authRoutes from "./modules/auth/auth.routes.js";
import proxyTo from "./common/utils/proxy.utils.js";
import isAuthenticated from "./modules/auth/auth.middleware.js";
import config from "./common/config/index.js";

const app = express();

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/catalog", isAuthenticated, proxyTo(config.services.catalogUrl));

app.use(express.json());
app.use("/api/auth", authRoutes);

app.use(errorHandler);
export default app;
