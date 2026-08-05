/*
# Create documents table and link finance records to documents

1. New Tables
- `documents`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `user_id` (uuid, not null, defaults to the authenticated user, references auth.users)
  - `date` (date, not null) — the document date
  - `document_number` (text, not null, unique per user) — a human-readable document reference
  - `total_amount` (numeric, not null, default 0) — the monetary total on the document
  - `created_at` (timestamptz, default now())
2. Modified Tables
- `finance_records`
  - Add `document_number` (text, nullable) — optional link to a document number.
    It is a free-text field (not a hard FK) so finance records can reference a
    document that has not been saved in the documents table yet.
3. Security
- Enable RLS on `documents`.
- Owner-scoped CRUD: each authenticated user can only access rows they own.
  The `user_id` column defaults to `auth.uid()` so inserts that omit it succeed.
- No policy changes needed on `finance_records` (existing owner-scoped policies
  already cover the new nullable column).
4. Important Notes
- The `documents.document_number` uniqueness is scoped per user via a partial
  unique index on (user_id, document_number) so different users can reuse the
  same document number without conflict.
- `finance_records.document_number` is intentionally NOT a foreign key; it is a
  free-text reference so users can type a new number that is not yet saved as a
  document.
*/

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  document_number text NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Per-user unique document number
CREATE UNIQUE INDEX IF NOT EXISTS documents_user_document_number_uniq
  ON documents (user_id, document_number);

DROP POLICY IF EXISTS "select_own_documents" ON documents;
CREATE POLICY "select_own_documents" ON documents FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_documents" ON documents;
CREATE POLICY "insert_own_documents" ON documents FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_documents" ON documents;
CREATE POLICY "update_own_documents" ON documents FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_documents" ON documents;
CREATE POLICY "delete_own_documents" ON documents FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Add document_number to finance_records (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'finance_records' AND column_name = 'document_number'
  ) THEN
    ALTER TABLE finance_records ADD COLUMN document_number text;
  END IF;
END $$;
