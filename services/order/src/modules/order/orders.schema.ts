import { pgTable, uuid, integer, timestamp, pgEnum, index } from "drizzle-orm/pg-core";

export const orderStatus = pgEnum("order_status", [
  "PENDING",
  "STOCK_RESERVED",
  "CONFIRMED",
  "STOCK_RESERVATION_FAILED",
  "PAYMENT_FAILED",
  "CANCELLED",
]);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    productId: uuid("product_id").notNull(),
    warehouseId: uuid("warehouse_id").notNull(),
    quantity: integer("quantity").notNull(),
    status: orderStatus("status").notNull().default("PENDING"),
    reservationId: uuid("reservation_id"),
    paymentId: uuid("payment_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdIdx: index("orders_user_id_idx").on(table.userId),
  }),
);