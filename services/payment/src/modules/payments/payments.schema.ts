import {
  pgTable,
  uuid,
  numeric,
  text,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";

export const paymentStatus = pgEnum("payment_status", [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
]);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    status: paymentStatus("status").notNull().default("PENDING"),

    idempotencyKey: text("idempotency_key").notNull().unique(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    orderIdIdx: index("payments_order_id_idx").on(table.orderId),
  }),
);
