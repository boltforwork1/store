/*
# Add image_url column to products table

1. Modified Tables
- `products`
  - Add `image_url` (text, nullable) to store the product's primary image URL
    fetched from the Noon GetContent API.

2. Security
- No RLS policy changes. The existing policies on `products` already cover
  SELECT/INSERT/UPDATE/DELETE for authenticated users, and the new column
  inherits those policies automatically.

3. Notes
- The column is nullable so existing product rows are unaffected.
- The edge function `noon-sync-catalog` will populate this column by calling
  the Noon `/content/v1/product/content/get` endpoint for each SKU.
*/

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_url text;
