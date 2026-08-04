/*
# Create finance_records table for manual accounting/profit tracking

1. New Tables
- `finance_records`
  - `id` (uuid, primary key, auto-generated)
  - `date` (date, not null) — the transaction date the user enters
  - `sku` (text, not null) — product SKU reference (free-text, not FK to products)
  - `product_name` (text, not null) — human-readable product name
  - `quantity` (integer, not null, default 1) — number of units sold
  - `cost_price` (numeric, not null, default 0) — per-unit cost
  - `selling_price` (numeric, not null, default 0) — per-unit selling price
  - `created_at` (timestamptz, default now()) — record creation timestamp
  - This table is fully independent from the Noon API integration.

2. Security
- Enable RLS on `finance_records`.
- Owner-scoped CRUD: each authenticated user can only access rows they own.
- `user_id` column defaults to `auth.uid()` so inserts omitting it still satisfy the INSERT policy.

3. Indexes
- Index on `user_id` for policy checks.
- Index on `date` for monthly filtering.
*/

CREATE TABLE IF NOT EXISTS finance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  sku text NOT NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  cost_price numeric(12,2) NOT NULL DEFAULT 0,
  selling_price numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE finance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_finance_records" ON finance_records;
CREATE POLICY "select_own_finance_records" ON finance_records FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_finance_records" ON finance_records;
CREATE POLICY "insert_own_finance_records" ON finance_records FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_finance_records" ON finance_records;
CREATE POLICY "update_own_finance_records" ON finance_records FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_finance_records" ON finance_records;
CREATE POLICY "delete_own_finance_records" ON finance_records FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_finance_records_user_id ON finance_records(user_id);
CREATE INDEX IF NOT EXISTS idx_finance_records_date ON finance_records(date);
