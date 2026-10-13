ALTER TYPE "public"."notification_type" ADD VALUE 'CART_ABANDONED';--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "dedup_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedup_key_unique" ON "notifications" USING btree ("dedup_key");