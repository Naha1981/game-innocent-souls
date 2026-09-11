CREATE TABLE IF NOT EXISTS "game_records" (
  "job_id" text PRIMARY KEY NOT NULL,
  "child_name" text NOT NULL,
  "adventure" text NOT NULL,
  "atlas_data" text NOT NULL,
  "atlas_mime_type" text DEFAULT 'image/png' NOT NULL,
  "manifest_json" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "paid_at" timestamp with time zone
);
