/*
# Add Noon Service Account credentials to settings

## Context
Noon uses Service Account authentication: a signed JWT generated from a
`key_id` and an RSA `private_key` (PEM). The previous schema only stored a
single `noon_api_key` text field, which corrupts the private key's newline
formatting and produces 502 Bad Gateway errors from Noon.

## Changes
1. `settings`
   - Add `noon_key_id` (text, nullable) — the public key identifier issued
     by the Noon partner portal.
   - Add `noon_private_key` (text, nullable) — the full RSA private key in
     PEM format. Stored as text so newlines are preserved verbatim.
   - The existing `noon_api_key` column is kept for backward compatibility
     (legacy bearer-token integrations); the JWT path takes precedence when
     both `noon_key_id` and `noon_private_key` are present.

## Security notes
- No data is lost: both new columns are nullable and added with
  `IF NOT EXISTS` guards, so the migration is safe to re-run.
- RLS is already enabled on `settings` and unchanged. The existing
  `authenticated`-only CRUD policies continue to apply to the new columns.
- Edge functions read these columns with the service role key, which
  bypasses RLS, so no policy changes are needed.
*/

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS noon_key_id text;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS noon_private_key text;
