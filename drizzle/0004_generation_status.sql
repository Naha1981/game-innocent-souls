ALTER TABLE "payment_orders"
  ADD COLUMN IF NOT EXISTS "generation_status" text DEFAULT 'pending' NOT NULL;
