/*
# Secure dashboard tables for authenticated access

## Context
The dashboard now requires sign-in (Supabase email/password auth). Previously
the app was single-tenant with no sign-in, so all tables allowed the `anon`
role. With auth now in place, we lock every dashboard table down to the
`authenticated` role only.

Because this is a single-tenant corporate dashboard (one shared catalog, one
shared order list, one shared settings row — not per-user data), we keep the
data shared across all authenticated users rather than scoping by `user_id`.
There is no `user_id` column on these tables and none is added: every signed-in
operator manages the same shared store data.

## Changes
1. `products`
   - Enable RLS (was disabled).
   - CRUD policies scoped to `authenticated` only. Data is intentionally shared
     among all authenticated operators, so `USING (true)` / `WITH CHECK (true)`
     is correct and documented here.
2. `orders`
   - Enable RLS (was disabled).
   - CRUD policies scoped to `authenticated` only, same shared-data rationale.
3. `settings`
   - Replace the previous `anon, authenticated` policies with `authenticated`
     -only policies. The single shared configuration row is now reachable only
     after sign-in. The edge functions read settings with the service role key,
     which bypasses RLS, so they are unaffected.

## Security notes
- `anon` can no longer read or write any dashboard data. An unauthenticated
  visitor hitting the app directly via the anon key will see empty tables,
  which is the intended behavior — the UI redirects them to /login before they
  ever issue a query.
- No `user_id` columns are introduced because data is shared, not per-user.
- Policies are dropped before recreate to keep the migration idempotent.
*/

-- =====================================================
-- products
-- =====================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_products" ON products;
CREATE POLICY "auth_select_products" ON products FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_products" ON products;
CREATE POLICY "auth_insert_products" ON products FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_products" ON products;
CREATE POLICY "auth_update_products" ON products FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_products" ON products;
CREATE POLICY "auth_delete_products" ON products FOR DELETE
  TO authenticated USING (true);

-- =====================================================
-- orders
-- =====================================================
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_orders" ON orders;
CREATE POLICY "auth_select_orders" ON orders FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_orders" ON orders;
CREATE POLICY "auth_insert_orders" ON orders FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_orders" ON orders;
CREATE POLICY "auth_update_orders" ON orders FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_orders" ON orders;
CREATE POLICY "auth_delete_orders" ON orders FOR DELETE
  TO authenticated USING (true);

-- =====================================================
-- settings (replace anon policies with authenticated-only)
-- =====================================================
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_settings" ON settings;
DROP POLICY IF EXISTS "anon_insert_settings" ON settings;
DROP POLICY IF EXISTS "anon_update_settings" ON settings;
DROP POLICY IF EXISTS "anon_delete_settings" ON settings;

DROP POLICY IF EXISTS "auth_select_settings" ON settings;
CREATE POLICY "auth_select_settings" ON settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_settings" ON settings;
CREATE POLICY "auth_insert_settings" ON settings FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_settings" ON settings;
CREATE POLICY "auth_update_settings" ON settings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_settings" ON settings;
CREATE POLICY "auth_delete_settings" ON settings FOR DELETE
  TO authenticated USING (true);
