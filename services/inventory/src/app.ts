import express from "express";
import errorHandler from "./common/middleware/errorHandler.js";
import stockRoutes from "./modules/stock/stock.routes.js";

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/reservations", stockRoutes);
app.use(errorHandler);

export default app;