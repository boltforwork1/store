/*
# Add customer_country_code column to orders table

1. Purpose
- The Noon FBPI orders list endpoint returns a `customer_country_code` field
  per order. We persist fetched orders into the `orders` table and want to
  store this field so the Orders tab can display it and the dashboard can
  surface geographic breakdowns later.

2. Changes
- Add nullable `customer_country_code` text column to `public.orders`.
  Nullable + no default so existing webhook-populated rows are unaffected.

3. Security
- No RLS or policy changes. Existing open CRUD policies on `orders` are
  unchanged.

4. Important notes
- Idempotent: wrapped in a DO block that checks information_schema before
  adding the column.
- Non-destructive: no columns dropped or renamed; existing rows are kept.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'customer_country_code'
  ) THEN
    ALTER TABLE orders ADD COLUMN customer_country_code text;
  END IF;
END $$;
