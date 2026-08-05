/*
# Create staff_users table for User Management

1. Purpose
   The Settings page now has a "User Management" section that lets an
   admin create new staff accounts and reset their passwords. Creating a
   user through Supabase's client-side `auth.signUp` would log out the
   currently signed-in admin, so account creation and password resets are
   performed by a secure edge function (`admin-user-management`) that uses
   the service-role key. That edge function mirrors every created auth
   account into this `staff_users` table so the Settings page can list
   the users without querying the protected `auth.users` table from the
   browser.

2. New Tables
   - `staff_users`
     - `id` (uuid, primary key) — matches the auth.users id of the created user.
     - `email` (text, unique, not null) — the staff member's sign-in email.
     - `created_at` (timestamptz, default now()) — when the account was created.

3. Security
   - Enable RLS on `staff_users`.
   - SELECT: any signed-in user (`authenticated`) can read the list of
     staff accounts so the Settings page can render the table.
   - INSERT / UPDATE / DELETE: blocked from the browser. Only the
     `admin-user-management` edge function (using the service-role key,
     which bypasses RLS) can insert/update/delete rows. No client-side
     policies are defined for these verbs, so the anon/authenticated
     roles cannot perform them.
*/

CREATE TABLE IF NOT EXISTS staff_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_staff_users" ON staff_users;
CREATE POLICY "select_staff_users"
  ON staff_users FOR SELECT
  TO authenticated
  USING (true);
