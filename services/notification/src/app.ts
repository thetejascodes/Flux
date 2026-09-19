import express from "express";
import errorHandler from "./common/middlewares/errorHandler.js";

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
app.use(errorHandler);
export default app;
