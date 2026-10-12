import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";

export const cartReminders = pgTable("cart_reminders", {
  userId: uuid("user_id").primaryKey(),
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  remindedActivityAt: timestamp("reminded_activity_at", {
    withTimezone: true,
  }).notNull(),
});
