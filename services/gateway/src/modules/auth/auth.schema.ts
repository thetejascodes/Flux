import { pgTable,uuid,varchar,pgEnum } from "drizzle-orm/pg-core";

export const authProviderEnum = pgEnum("auth_provider", ["email", "otp", "google"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).unique(),
  phone: varchar("phone", { length: 20 }).unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  googleId: varchar("google_id", { length: 255 }).unique(),
  provider: authProviderEnum("provider").notNull(),
  role: varchar("role", { length: 20 }).default("user"),
});

