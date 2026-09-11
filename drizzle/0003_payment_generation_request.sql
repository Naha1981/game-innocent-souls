ALTER TABLE "payment_orders" ADD COLUMN IF NOT EXISTS "source_object_ref" text;
ALTER TABLE "payment_orders" ADD COLUMN IF NOT EXISTS "generation_request_json" text;
