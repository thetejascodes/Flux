import {
  pgTable,
  pgEnum,
  uuid,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const reservationStatusEnum = pgEnum("reservation_status", [
  "PENDING",
  "CONFIRMED",
  "RELEASED",
  "EXPIRED",
]);

export const stock = pgTable(
  "stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull(),
    warehouseId: uuid("warehouse_id").notNull(),
    quantityAvailable: integer("quantity_available").notNull().default(0),
    quantityReserved: integer("quantity_reserved").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    productWarehouseIdx: index("stock_product_warehouse_idx").on(
      table.productId,
      table.warehouseId,
    ),
  }),
);

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull(),
    warehouseId: uuid("warehouse_id").notNull(),
    orderId: uuid("order_id").notNull(),
    quantity: integer("quantity").notNull(),
    status: reservationStatusEnum("status").notNull().default("PENDING"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    orderIdx: index("reservations_order_idx").on(table.orderId),
    statusExpiresIdx: index("reservations_status_expires_idx").on(
      table.status,
      table.expiresAt,
    ),
  }),
);
