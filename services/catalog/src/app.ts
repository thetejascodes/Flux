import express from "express";
import errorHandler from "./common/middlewares/errorHandler.js";
import productRoutes from "./modules/products/products.routes.js";
const app = express();

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use(express.json());
app.use("/products",productRoutes);
app.use(errorHandler);
export default app;