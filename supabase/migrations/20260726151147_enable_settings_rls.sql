/*
# Enable RLS on settings table (single-tenant, no auth)

1. Security
- Enable Row Level Security on the `settings` table.
- Add CRUD policies for `anon` and `authenticated` roles because this is a
  single-user corporate dashboard with no sign-in screen, so the frontend
  talks to Supabase as the `anon` role.
- `USING (true)` / `WITH CHECK (true)` is intentional: the settings table
  holds a single shared configuration row for the whole dashboard.
*/

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_settings" ON settings;
CREATE POLICY "anon_select_settings" ON settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_settings" ON settings;
CREATE POLICY "anon_insert_settings" ON settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_settings" ON settings;
CREATE POLICY "anon_update_settings" ON settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_settings" ON settings;
CREATE POLICY "anon_delete_settings" ON settings FOR DELETE
  TO anon, authenticated USING (true);
