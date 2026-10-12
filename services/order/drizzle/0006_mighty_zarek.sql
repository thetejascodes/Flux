CREATE TABLE "cart_reminders" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"reminder_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reminded_activity_at" timestamp with time zone NOT NULL
);
