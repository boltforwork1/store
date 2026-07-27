/*
# Create noon_session_cookies cache table

1. Purpose
- The `noon-auth` edge function authenticates to the Noon API using an RS256
  signed JWT and receives session cookies in the `Set-Cookie` response header.
- Edge function instances are stateless: module-level variables do not survive
  across requests or instances, so the session cookie MUST be persisted in the
  database to be reusable by subsequent Noon API calls (stock/price/order
  updates) without re-authenticating on every request.
- This table is a single-row cache (one active session per channel). The
  `noon-auth` function upserts the row after each successful login and other
  Noon edge functions read it to attach the cookie to outbound requests.

2. New Tables
- `noon_session_cookies`
  - `id` (int, primary key, fixed = 1) — enforces the single-row invariant.
  - `cookie` (text, not null) — the full `Set-Cookie` header value(s) joined,
    to be sent back verbatim as the `Cookie` request header.
  - `expires_at` (timestamptz, nullable) — parsed `Expires` attribute of the
    cookie, if present. Used to decide whether the cached cookie is still fresh.
  - `updated_at` (timestamptz, default now()) — last successful login time.

3. Security
- Enable RLS on `noon_session_cookies`.
- This table is server-side only: it is read and written exclusively by edge
  functions using the service role key, which bypasses RLS. No anon or
  authenticated frontend policy is granted, so the dashboard frontend cannot
  read the raw session cookie (which would leak Noon access). We still add a
  restrictive `authenticated` SELECT policy so an operator inspecting the table
  via the dashboard cannot retrieve the cookie value — the policy is
  intentionally `USING (false)` to deny all direct access. Writes are likewise
  denied to the frontend; only the service role (edge functions) can mutate.
*/

CREATE TABLE IF NOT EXISTS noon_session_cookies (
  id integer PRIMARY KEY DEFAULT 1,
  cookie text NOT NULL,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT noon_session_cookies_single_row CHECK (id = 1)
);

ALTER TABLE noon_session_cookies ENABLE ROW LEVEL SECURITY;

-- Deny all direct frontend access. Edge functions use the service role key,
-- which bypasses RLS, so they are unaffected.
DROP POLICY IF EXISTS "deny_select_session_cookies" ON noon_session_cookies;
CREATE POLICY "deny_select_session_cookies" ON noon_session_cookies
  FOR SELECT TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "deny_insert_session_cookies" ON noon_session_cookies;
CREATE POLICY "deny_insert_session_cookies" ON noon_session_cookies
  FOR INSERT TO anon, authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "deny_update_session_cookies" ON noon_session_cookies;
CREATE POLICY "deny_update_session_cookies" ON noon_session_cookies
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_delete_session_cookies" ON noon_session_cookies;
CREATE POLICY "deny_delete_session_cookies" ON noon_session_cookies
  FOR DELETE TO anon, authenticated USING (false);
