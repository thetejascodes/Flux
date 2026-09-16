import "dotenv/config";
import app from "./app.js";
import config from "./common/config/index.js";
import { startExpiryJob } from "./modules/stock/expireReservations.job.js";
import { connectRabbitMQ } from "./common/events/connection.js";
import { registerInventorySagaHandlers } from "./modules/stock/stock.gateway.js";

const port = config.port;

const startServer = async () => {
  startExpiryJob();
  await connectRabbitMQ();
  await registerInventorySagaHandlers();
  app.listen(port, () => {
    console.log(`🚀 Inventory service running on port ${port}`);
  });
};

startServer().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
