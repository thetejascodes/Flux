import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import config from "../config/index.js";
import * as schema from "./schema.js";

export const pool = new Pool({ connectionString: config.database.url });
export const db = drizzle(pool, { schema });