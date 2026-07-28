/*
# Add noon_sku column to products table

1. Modified Tables
- `products`
  - Add `noon_sku` (text, nullable) to store the Noon `sku_parent` value that
    the user enters for on-demand catalog detail sync. This lets us remember
    which Noon SKU maps to each local product so future syncs can reuse it.

2. Security
- No RLS policy changes. The existing policies on `products` already cover
  CRUD for authenticated users; the new column inherits them automatically.

3. Notes
- The column is nullable so existing rows are unaffected.
- Populated by the noon-sync-catalog edge function when a user manually
  enters a Noon SKU for a specific product.
*/

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS noon_sku text;
