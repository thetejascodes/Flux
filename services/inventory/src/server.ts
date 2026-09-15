import "dotenv/config";
import app from "./app.js";
import config from "./common/config/index.js";
import { startExpiryJob } from "./modules/stock/expireReservations.job.js";

const port = config.port;

const startServer = async () => {
  app.listen(port, () => {
    startExpiryJob();
    console.log(`🚀 Inventory service running on port ${port}`);
  });
};

startServer().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
