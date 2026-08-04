/*
# Create internal_inventory table and inventory_images storage bucket

1. New Tables
- `internal_inventory`
  - `id` (uuid, primary key, auto-generated)
  - `user_id` (uuid, not null, defaults to auth.uid()) — owner of the record
  - `product_name` (text, not null) — name of the internal stock item
  - `quantity` (integer, not null, default 0) — number of units in stock
  - `cost_price` (numeric, not null, default 0) — per-unit cost
  - `image_url` (text, nullable) — public URL of the uploaded image in storage
  - `created_at` (timestamptz, default now()) — record creation timestamp
  - This table is fully independent from the Noon products table.

2. Security — RLS on internal_inventory
- Owner-scoped CRUD: each authenticated user can only access rows they own.
- `user_id` defaults to `auth.uid()` so inserts omitting it still satisfy the INSERT policy.

3. Storage — inventory_images bucket
- Public bucket (read access to everyone, uploads restricted to authenticated users).
- Storage policies:
  - SELECT: anyone can read (public images for display).
  - INSERT: authenticated users can upload to their own folder path.
  - UPDATE/DELETE: authenticated users can manage their own folder path.
  - Files are stored under `user_id/` prefixes so users can only write/delete their own images.

4. Indexes
- Index on `user_id` for policy checks.
*/

CREATE TABLE IF NOT EXISTS internal_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  cost_price numeric(12,2) NOT NULL DEFAULT 0,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE internal_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_internal_inventory" ON internal_inventory;
CREATE POLICY "select_own_internal_inventory" ON internal_inventory FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_internal_inventory" ON internal_inventory;
CREATE POLICY "insert_own_internal_inventory" ON internal_inventory FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_internal_inventory" ON internal_inventory;
CREATE POLICY "update_own_internal_inventory" ON internal_inventory FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_internal_inventory" ON internal_inventory;
CREATE POLICY "delete_own_internal_inventory" ON internal_inventory FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_internal_inventory_user_id ON internal_inventory(user_id);

-- Create the storage bucket for inventory images (public so images display without auth)
INSERT INTO storage.buckets (id, name, public)
VALUES ('inventory_images', 'inventory_images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: anyone can read (public bucket), only owners can write/delete
DROP POLICY IF EXISTS "inventory_images_public_read" ON storage.objects;
CREATE POLICY "inventory_images_public_read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'inventory_images');

DROP POLICY IF EXISTS "inventory_images_owner_insert" ON storage.objects;
CREATE POLICY "inventory_images_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inventory_images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "inventory_images_owner_update" ON storage.objects;
CREATE POLICY "inventory_images_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'inventory_images' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'inventory_images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "inventory_images_owner_delete" ON storage.objects;
CREATE POLICY "inventory_images_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'inventory_images' AND (storage.foldername(name))[1] = auth.uid()::text);
