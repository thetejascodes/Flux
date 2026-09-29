ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "total_amount" numeric(10, 2) NOT NULL;
