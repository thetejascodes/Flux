import { pgTable,uuid,varchar,pgEnum,timestamp,boolean } from "drizzle-orm/pg-core";

export const authProviderEnum = pgEnum("auth_provider", ["email", "otp", "google"]);
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).unique(),
  phone: varchar("phone", { length: 20 }).unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  googleId: varchar("google_id", { length: 255 }).unique(),
  provider: authProviderEnum("provider").notNull(),
  role: userRoleEnum("role").notNull().default("user"),
  createdAt:timestamp("created_at",{withTimezone:true}).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  refreshTokenHash: varchar("refresh_token_hash", { length: 255 }).unique().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const otpCodes = pgTable("otp_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  phoneHash: varchar("phone_hash", { length: 255 }).notNull(),
  codeHash: varchar("code_hash", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  consumed: boolean("consumed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});


