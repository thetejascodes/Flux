CREATE TYPE "public"."reservation_status" AS ENUM('PENDING', 'CONFIRMED', 'RELEASED', 'EXPIRED');--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"public"."reservation_status";--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "status" SET DATA TYPE "public"."reservation_status" USING "status"::"public"."reservation_status";