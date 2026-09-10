import {
  pgTable,
  uuid,
  varchar,
  pgEnum,
  timestamp,
  boolean,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const authProviderEnum = pgEnum("auth_provider", [
  "email",
  "otp",
  "google",
]);
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).unique(),
  phone: varchar("phone", { length: 20 }).unique(),
  role: userRoleEnum("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    provider: authProviderEnum("provider").notNull(),
    providerUid: varchar("provider_uid", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    providerUidUnique: uniqueIndex("auth_identities_provider_uid_unique").on(
      table.provider,
      table.providerUid,
    ),
    userIdIdx: index("auth_identities_user_id_idx").on(table.userId),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    refreshTokenHash: varchar("refresh_token_hash", { length: 255 })
      .unique()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdExpiresIdx: index("sessions_user_id_expires_at_idx").on(
      table.userId,
      table.expiresAt,
    ),
  }),
);

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    phoneHash: varchar("phone_hash", { length: 255 }).notNull(),
    codeHash: varchar("code_hash", { length: 255 }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumed: boolean("consumed").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    phoneLookupIdx: index("otp_codes_phone_lookup_idx").on(
      table.phoneHash,
      table.consumed,
      table.expiresAt,
    ),
  }),
);