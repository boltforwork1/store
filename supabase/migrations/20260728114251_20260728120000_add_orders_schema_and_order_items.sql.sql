/*
# Orders Management schema: expand `orders` and add `order_items`

## Summary
Extends the existing `orders` table to fully model the Noon `ListFbpiOrders`
response and adds a new `order_items` child table to hold the individual line
items inside each FBPI order. No existing columns or data are dropped/renamed.

## 1. `orders` table changes (additive only)
New columns added to the existing `orders` table:
- `fbpi_order_nr` (text) — the Noon FBPI order number. Canonical key returned by
  the Noon API. Given a UNIQUE constraint so it can serve as the upsert key for
  the sync edge function and as the FK target for `order_items`. Existing rows
  are backfilled from `noon_order_id`.
- `mp_order_nr` (text) — the Noon marketplace order number (customer-facing).
- `warehouse_code` (text) — the warehouse the order was placed against.
- `order_created_at` (timestamptz) — the order creation timestamp from Noon.

No existing column is dropped, renamed, or retyped.

## 2. New `order_items` table
- `mp_item_nr` (text, PRIMARY KEY) — Noon marketplace item number.
- `fbpi_order_nr` (text, NOT NULL) — FK to `orders.fbpi_order_nr`, ON DELETE CASCADE.
- `partner_sku` (text) — partner SKU for the line item.
- `mp_status` (text) — Noon marketplace status of the item.
- `integration_status` (text) — FBPI integration status of the item.
- `price` (numeric) — delivered invoice price for the item.
- `created_at` / `updated_at` (timestamptz) — audit timestamps.

## 3. Security (RLS)
- `order_items` has RLS ENABLED with four `authenticated`-scoped policies
  (SELECT/INSERT/UPDATE/DELETE) that delegate ownership to the parent `orders`
  row via an EXISTS subquery, mirroring the existing shared-data orders policy.

## 4. Idempotency
- `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, and guarded
  constraint/index creation make the migration safe to re-run.
*/

-- ---------------------------------------------------------------------------
-- 1. Extend the existing `orders` table (additive only)
-- ---------------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fbpi_order_nr text,
  ADD COLUMN IF NOT EXISTS mp_order_nr text,
  ADD COLUMN IF NOT EXISTS warehouse_code text,
  ADD COLUMN IF NOT EXISTS order_created_at timestamptz;

-- Backfill fbpi_order_nr from the existing noon_order_id column so legacy rows
-- are not left without a canonical key.
UPDATE orders
  SET fbpi_order_nr = noon_order_id
  WHERE fbpi_order_nr IS NULL
    AND noon_order_id IS NOT NULL;

-- Add a UNIQUE constraint on orders.fbpi_order_nr (required for the FK from
-- order_items). Multiple NULLs are allowed under Postgres UNIQUE, so legacy
-- rows that still have no fbpi_order_nr don't violate it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_fbpi_order_nr_key'
      AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_fbpi_order_nr_key UNIQUE (fbpi_order_nr);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Create the `order_items` table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  mp_item_nr text PRIMARY KEY,
  fbpi_order_nr text NOT NULL,
  partner_sku text,
  mp_status text,
  integration_status text,
  price numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_items_fbpi_order_nr_fkey
    FOREIGN KEY (fbpi_order_nr)
    REFERENCES orders (fbpi_order_nr)
    ON DELETE CASCADE
);

-- Index for looking up items by their parent order.
CREATE INDEX IF NOT EXISTS idx_order_items_fbpi_order_nr
  ON order_items (fbpi_order_nr);

-- updated_at auto-maintenance trigger.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_updated_at ON order_items;
CREATE TRIGGER trg_order_items_updated_at
  BEFORE UPDATE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Enable RLS and create policies on `order_items`
-- ---------------------------------------------------------------------------
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_order_items" ON order_items;
CREATE POLICY "auth_select_order_items"
  ON order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.fbpi_order_nr = order_items.fbpi_order_nr
    )
  );

DROP POLICY IF EXISTS "auth_insert_order_items" ON order_items;
CREATE POLICY "auth_insert_order_items"
  ON order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.fbpi_order_nr = order_items.fbpi_order_nr
    )
  );

DROP POLICY IF EXISTS "auth_update_order_items" ON order_items;
CREATE POLICY "auth_update_order_items"
  ON order_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.fbpi_order_nr = order_items.fbpi_order_nr
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.fbpi_order_nr = order_items.fbpi_order_nr
    )
  );

DROP POLICY IF EXISTS "auth_delete_order_items" ON order_items;
CREATE POLICY "auth_delete_order_items"
  ON order_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.fbpi_order_nr = order_items.fbpi_order_nr
    )
  );
