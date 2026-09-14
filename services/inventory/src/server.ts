import "dotenv/config";
import app from "./app.js";
import config from "./common/config/index.js";


app.listen(config.port, () => {
  console.log(`🚀 Inventory service running on port ${config.port}`);
});