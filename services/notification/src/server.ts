import "dotenv/config";
import app from "./app.js";
const port = process.env.PORT;;

const startServer = async () => {
  app.listen(port, () => {
    console.log(`🚀 Notification service running on port ${port}`);
  });
};

startServer().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
