import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const notificationType = pgEnum("notification_type", [
  "ORDER_CREATED",
  "PAYMENT_SUCCEEDED",
  "PAYMENT_FAILED",
  "DELIVERY_ASSIGNED",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull(),
    type: notificationType("type").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderIdIdx: index("notifications_order_id_idx").on(table.orderId),
    orderTypeUnique: uniqueIndex("notifications_order_id_type_unique").on(
      table.orderId,
      table.type,
    ),
  }),
);
