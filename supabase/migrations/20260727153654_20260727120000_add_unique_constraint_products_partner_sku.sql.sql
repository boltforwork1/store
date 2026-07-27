/*
# Add UNIQUE constraint on products.partner_sku

1. Purpose
- The catalog CSV import uses an upsert with `onConflict: "partner_sku"`.
  Postgres requires a unique or exclusion constraint on the conflict target
  column, otherwise the upsert fails with:
  "there is no unique or exclusion constraint matching the ON CONFLICT specification"
- This migration adds that constraint so upserts resolve correctly.

2. Changes
- Add a UNIQUE constraint on `products.partner_sku` (named
  `products_partner_sku_key`) if it does not already exist.

3. Security
- No RLS or policy changes. Existing open CRUD policies on `products` are
  unchanged.

4. Important notes
- Idempotent: wrapped in a DO block that checks `pg_constraint` before adding.
- Non-destructive: no columns dropped or renamed; existing rows are kept.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_partner_sku_key'
      AND conrelid = 'products'::regclass
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_partner_sku_key UNIQUE (partner_sku);
  END IF;
END $$;
