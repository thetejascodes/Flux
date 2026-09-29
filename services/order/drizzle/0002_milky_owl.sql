ALTER TABLE "orders" ADD COLUMN "subtotal" numeric(10, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_fee" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "product_id";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "quantity";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "reservation_id";