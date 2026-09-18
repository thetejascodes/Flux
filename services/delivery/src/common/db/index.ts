import { drizzle } from "drizzle-orm/node-postgres";
import config from "../config/index.js";
import * as schema from "./schema.js";

export const db = drizzle(config.database.url, { schema });