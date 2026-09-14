CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "reservations_order_idx" ON "reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "reservations_status_expires_idx" ON "reservations" USING btree ("status","expires_at");