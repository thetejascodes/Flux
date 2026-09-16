import express from "express";
import errorHandler from "./common/middleware/errorHandler.js";
import orderRoutes from "./modules/order/orders.routes.js";

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/", orderRoutes);

app.use(errorHandler);

export default app;