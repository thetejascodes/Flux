import "dotenv/config";
import app from "./app.js";

const port = 4003;

const startServer = async () => {
  app.listen(port, () => {
    console.log(`🚀 Order service running on port ${port}`);
  });
};

startServer().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
