import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";

export const warehouses = pgTable("warehouses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  latitude: numeric("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: numeric("longitude", { precision: 9, scale: 6 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
export const driverStatus = pgEnum("driver_status", [
  "AVAILABLE",
  "BUSY",
  "OFFLINE",
]);

export const drivers = pgTable(
  "drivers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    status: driverStatus("status").notNull().default("OFFLINE"),
    currentLatitude: numeric("current_latitude", {
      precision: 9,
      scale: 6,
    }).notNull(),
    currentLongitude: numeric("current_longitude", {
      precision: 9,
      scale: 6,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    statusIdx: index("drivers_status_idx").on(table.status),
  }),
);
export const deliveryStatus = pgEnum("delivery_status", [
  "PENDING",
  "ASSIGNED",
  "IN_TRANSIT",
  "DELIVERED",
  "FAILED",
]);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull(),
    warehouseId: uuid("warehouse_id"),
    driverId: uuid("driver_id"),
    status: deliveryStatus("status").notNull().default("PENDING"),
    estimatedArrival: timestamp("estimated_arrival", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    orderIdIdx: index("deliveries_order_id_idx").on(table.orderId),
  }),
);