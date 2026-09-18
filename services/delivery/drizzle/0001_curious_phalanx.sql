CREATE TYPE "public"."driver_status" AS ENUM('AVAILABLE', 'BUSY', 'OFFLINE');--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "driver_status" DEFAULT 'OFFLINE' NOT NULL,
	"current_latitude" numeric(9, 6) NOT NULL,
	"current_longitude" numeric(9, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "drivers_status_idx" ON "drivers" USING btree ("status");