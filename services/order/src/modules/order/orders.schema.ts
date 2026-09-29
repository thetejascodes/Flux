import {
  pgTable,
  uuid,
  integer,
  timestamp,
  pgEnum,
  index,
  numeric,
} from "drizzle-orm/pg-core";

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
    warehouseId: uuid("warehouse_id").notNull(),
    status: orderStatus("status").notNull().default("PENDING"),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
    shippingFee: numeric("shipping_fee", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
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
