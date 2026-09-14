import { pgTable, uuid, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";

export const stock = pgTable(
  "stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull(),
    warehouseId: uuid("warehouse_id").notNull(),
    quantityAvailable: integer("quantity_available").notNull().default(0),
    quantityReserved: integer("quantity_reserved").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => ({
    productWarehouseIdx: index("stock_product_warehouse_idx").on(table.productId, table.warehouseId),
  }),
);
