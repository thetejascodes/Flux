import "dotenv/config";
import app from "./app.js";
import config from "./common/config/index.js";
import { connectRabbitMQ } from "./common/events/connection.js";
const port = config.port;

const startServer = async () => {
  await connectRabbitMQ();
  app.listen(port, () => {
    console.log(`🚀 Payment service running on port ${port}`);
  });
};

startServer().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
