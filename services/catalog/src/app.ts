import express from "express";
import errorHandler from "./common/middlewares/errorHandler.js";

const app = express();

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use(express.json());

app.use(errorHandler);
export default app;