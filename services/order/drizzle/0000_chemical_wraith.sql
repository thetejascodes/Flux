CREATE TYPE "public"."order_status" AS ENUM('PENDING', 'STOCK_RESERVED', 'CONFIRMED', 'STOCK_RESERVATION_FAILED', 'PAYMENT_FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" "order_status" DEFAULT 'PENDING' NOT NULL,
	"reservation_id" uuid,
	"payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "orders_user_id_idx" ON "orders" USING btree ("user_id");