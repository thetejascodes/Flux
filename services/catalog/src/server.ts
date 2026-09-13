import "dotenv/config";
import app from "./app.js";
import config from "./common/index.js";


app.listen(config.port, () => {
  console.log(`🚀 Catalog service running on port ${process.env.PORT}`);
});