CREATE TABLE IF NOT EXISTS payment_orders (
  payment_id text PRIMARY KEY,
  package_id text NOT NULL,
  amount_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  job_id text,
  pf_payment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE INDEX IF NOT EXISTS payment_orders_job_id_idx ON payment_orders (job_id);
CREATE INDEX IF NOT EXISTS payment_orders_status_idx ON payment_orders (status);
