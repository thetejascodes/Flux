import { pgTable, uuid, varchar, numeric, timestamp, index } from "drizzle-orm/pg-core";

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    description: varchar("description", { length: 1000 }),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    category: varchar("category", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    categoryIdx: index("products_category_idx").on(table.category),
  }),
);