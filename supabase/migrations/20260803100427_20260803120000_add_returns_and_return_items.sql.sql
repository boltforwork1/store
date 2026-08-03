/*
# Returns management: add `returns` and `return_items` tables

## Summary
Adds the database schema for the Noon Returns workflow. Noon sends a webhook
notification containing a `barcode` when a return barcode is created. The
webhook edge function uses that barcode to call Noon's
`POST /returns/v1/return-references/list` endpoint and stores the returned
items here. This migration only adds tables — the webhook receiver edge
function is deployed separately.

## 1. New `returns` table
- `id` (uuid, PRIMARY KEY) — internal identifier.
- `barcode` (text, NOT NULL, UNIQUE) — the return barcode from the Noon
  webhook payload. Unique so duplicate webhook deliveries for the same
  return are idempotent (re-delivery upserts the same row).
- `created_at` (timestamptz, default now()) — when the return record was
  first stored.

## 2. New `return_items` table (linked to `returns`)
- `id` (uuid, PRIMARY KEY) — internal identifier.
- `return_id` (uuid, NOT NULL) — FK to `returns(id)`, ON DELETE CASCADE.
- `mp_code` (text) — marketplace code from the Noon API response.
- `purchase_item_nr` (text) — purchase item number from the Noon API response.
- `partner_sku` (text) — partner SKU from the Noon API response.
- `merchant_code` (text) — merchant code from the Noon API response.
- `created_at` (timestamptz, default now()) — audit timestamp.

These four columns strictly match the Noon API `items` array response shape.

## 3. Security (RLS)
This app has a sign-in screen and uses shared, single-tenant store data (the
same pattern as `orders` and `products`). RLS is enabled on both tables with
`authenticated`-scoped CRUD policies:
- `returns`: shared-data policies (`USING (true)` / `WITH CHECK (true)`,
  documented as intentionally shared among all authenticated operators).
- `return_items`: ownership delegated to the parent `returns` row via an
  EXISTS subquery, mirroring the `order_items` pattern.

The webhook edge function writes using the service role key, which bypasses
RLS, so webhook deliveries are not affected by these policies.

## 4. Idempotency
- `CREATE TABLE IF NOT EXISTS` and guarded constraint/index creation make the
  migration safe to re-run.
- The UNIQUE constraint on `returns.barcode` lets the webhook upsert safely.
*/

-- ---------------------------------------------------------------------------
-- 1. Create the `returns` table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'returns_barcode_key' AND conrelid = 'returns'::regclass
  ) THEN
    ALTER TABLE returns ADD CONSTRAINT returns_barcode_key UNIQUE (barcode);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Create the `return_items` table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL,
  mp_code text,
  purchase_item_nr text,
  partner_sku text,
  merchant_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT return_items_return_id_fkey
    FOREIGN KEY (return_id)
    REFERENCES returns (id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_return_items_return_id
  ON return_items (return_id);

-- ---------------------------------------------------------------------------
-- 3. Enable RLS and create policies on `returns`
-- ---------------------------------------------------------------------------
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_returns" ON returns;
CREATE POLICY "auth_select_returns" ON returns FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_returns" ON returns;
CREATE POLICY "auth_insert_returns" ON returns FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_returns" ON returns;
CREATE POLICY "auth_update_returns" ON returns FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_returns" ON returns;
CREATE POLICY "auth_delete_returns" ON returns FOR DELETE
  TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 4. Enable RLS and create policies on `return_items`
-- ---------------------------------------------------------------------------
ALTER TABLE return_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_return_items" ON return_items;
CREATE POLICY "auth_select_return_items" ON return_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM returns
      WHERE returns.id = return_items.return_id
    )
  );

DROP POLICY IF EXISTS "auth_insert_return_items" ON return_items;
CREATE POLICY "auth_insert_return_items" ON return_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM returns
      WHERE returns.id = return_items.return_id
    )
  );

DROP POLICY IF EXISTS "auth_update_return_items" ON return_items;
CREATE POLICY "auth_update_return_items" ON return_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM returns
      WHERE returns.id = return_items.return_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM returns
      WHERE returns.id = return_items.return_id
    )
  );

DROP POLICY IF EXISTS "auth_delete_return_items" ON return_items;
CREATE POLICY "auth_delete_return_items" ON return_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM returns
      WHERE returns.id = return_items.return_id
    )
  );
