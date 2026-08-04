/*
# Add model_number column to internal_inventory

1. Modified Tables
- `internal_inventory`
  - Add `model_number` (text, not null, default '') — a required model number
    for each internal stock item. Existing rows back-fill to '' so the NOT NULL
    constraint applies without breaking old data.

2. Security
- No security changes. RLS and existing owner-scoped policies remain unchanged.

3. Notes
- The column is NOT NULL with a default of '' so it is safe to re-run.
- The frontend will treat an empty string as "missing" and require entry on
  Add/Edit, but the database allows '' to keep the migration non-destructive.
*/

ALTER TABLE internal_inventory
  ADD COLUMN IF NOT EXISTS model_number text NOT NULL DEFAULT '';
