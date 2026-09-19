CREATE TYPE "public"."notification_type" AS ENUM('ORDER_CREATED', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'DELIVERY_ASSIGNED');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notifications_order_id_idx" ON "notifications" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_order_id_type_unique" ON "notifications" USING btree ("order_id","type");