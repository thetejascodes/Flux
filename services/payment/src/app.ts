import express from "express";
import errorHandler from "./common/middleware/errorHandler.js";
import { db } from "./common/db/index.js";
import { sql } from "drizzle-orm";
import { getChannel } from "./common/events/connection.js";

const app = express();

app.use(express.json());

app.get("/health", async (req, res) => {
  const checks: Record<string, "ok" | "down"> = {
    database: "ok",
    rabbitmq: "ok",
  };
  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    checks.database = "down";
  }
  try {
    getChannel();
  } catch {
    checks.rabbitmq = "down";
  }
  const allOk = Object.values(checks).every((status) => status === "ok");
  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ok" : "degraded",
    checks,
  });
});

app.use(errorHandler);

export default app;
