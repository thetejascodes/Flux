ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "subtotal" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
UPDATE "orders" SET "subtotal" = "total_amount" WHERE "subtotal" = 0;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "subtotal" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_fee" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN IF EXISTS "product_id";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN IF EXISTS "quantity";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN IF EXISTS "reservation_id";
