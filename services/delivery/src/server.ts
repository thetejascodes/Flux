import "dotenv/config";
import { createServer } from "http";
import app from "./app.js";
import config from "./common/config/index.js";
import { connectRabbitMQ } from "./common/events/connection.js";
import { registerDeliverySagaHandlers } from "./modules/deliveries/deliveries.gateway.js";
import { initSocket } from "./common/websocket/websocket.js";
import startTrackingSimulation from "./modules/deliveries/deliveries.tracking.js";
const port = config.port;

const startServer = async () => {
  await connectRabbitMQ();
  await registerDeliverySagaHandlers();

  const httpServer = createServer(app);
  initSocket(httpServer);
  startTrackingSimulation();
  httpServer.listen(port, () => {
    console.log(`🚀 Deliveries service running on port ${port}`);
  });
};

startServer().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
