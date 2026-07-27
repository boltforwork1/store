/*
# Make orders table webhook-ready

1. Purpose
- Noon FBPI pushes order events via webhooks (not a polling GET endpoint).
- Noon retries delivery on non-2xx responses, so the webhook receiver must be
  idempotent: re-delivering the same order must not create duplicate rows.

2. Changes to the `orders` table
- Add `raw_payload` (jsonb, nullable): stores the full Noon webhook body for
  debugging and future field extraction. Non-destructive ADD COLUMN.
- Add a unique constraint on `noon_order_id` so duplicate webhook deliveries
  are rejected at the database level (the edge function uses
  onConflict doNothing for safe upsert behavior).

3. Security
- RLS is already enabled on `orders`. No policy changes here — the webhook
  edge function inserts using the service role key (bypasses RLS), and the
  frontend reads using the anon key (covered by existing anon SELECT policy).
*/

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;

-- Unique constraint for idempotent webhook inserts. Null noon_order_id values
-- are allowed (multiple nulls don't violate uniqueness in Postgres).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_noon_order_id_key'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_noon_order_id_key UNIQUE (noon_order_id);
  END IF;
END $$;
