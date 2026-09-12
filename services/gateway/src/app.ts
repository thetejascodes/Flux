import express from "express";
import errorHandler from "./common/middleware/errorHandler.js";
import authRoutes from "./modules/auth/auth.routes.js";
const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);

app.use(errorHandler);
export default app;
