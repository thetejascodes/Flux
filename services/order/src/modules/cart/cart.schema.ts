import {
  pgTable,
  uuid,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    productId: uuid("product_id").notNull(),
    quantity: integer("quantity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdIdx: index("cart_items_user_id_idx").on(table.userId),
    userProductUnique: uniqueIndex("cart_items_user_id_product_id_unique").on(
      table.userId,
      table.productId,
    ),
  }),
);
