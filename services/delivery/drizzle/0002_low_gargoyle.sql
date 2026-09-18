CREATE TYPE "public"."delivery_status" AS ENUM('PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'FAILED');--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"warehouse_id" uuid,
	"driver_id" uuid,
	"status" "delivery_status" DEFAULT 'PENDING' NOT NULL,
	"estimated_arrival" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "deliveries_order_id_idx" ON "deliveries" USING btree ("order_id");