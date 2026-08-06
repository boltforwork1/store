-- Helper: returns true when the current signed-in user is one of the configured admins.
-- Uses the email stored in the JWT so it works for any table's RLS policy.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (auth.jwt() ->> 'email') ILIKE ANY (ARRAY['kmg.fba@gmail.com', 'ahmed@gmail.com']),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- internal_inventory: admins see/manage all rows; everyone else only their own.
DROP POLICY IF EXISTS select_own_internal_inventory ON public.internal_inventory;
DROP POLICY IF EXISTS insert_own_internal_inventory ON public.internal_inventory;
DROP POLICY IF EXISTS update_own_internal_inventory ON public.internal_inventory;
DROP POLICY IF EXISTS delete_own_internal_inventory ON public.internal_inventory;

CREATE POLICY "select_internal_inventory" ON public.internal_inventory
  FOR SELECT TO authenticated USING (public.is_admin() OR auth.uid() = user_id);
CREATE POLICY "insert_internal_inventory" ON public.internal_inventory
  FOR INSERT TO authenticated WITH CHECK (public.is_admin() OR auth.uid() = user_id);
CREATE POLICY "update_internal_inventory" ON public.internal_inventory
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR auth.uid() = user_id)
  WITH CHECK (public.is_admin() OR auth.uid() = user_id);
CREATE POLICY "delete_internal_inventory" ON public.internal_inventory
  FOR DELETE TO authenticated USING (public.is_admin() OR auth.uid() = user_id);

-- finance_records: admins see/manage all rows; everyone else only their own.
DROP POLICY IF EXISTS select_own_finance_records ON public.finance_records;
DROP POLICY IF EXISTS insert_own_finance_records ON public.finance_records;
DROP POLICY IF EXISTS update_own_finance_records ON public.finance_records;
DROP POLICY IF EXISTS delete_own_finance_records ON public.finance_records;

CREATE POLICY "select_finance_records" ON public.finance_records
  FOR SELECT TO authenticated USING (public.is_admin() OR auth.uid() = user_id);
CREATE POLICY "insert_finance_records" ON public.finance_records
  FOR INSERT TO authenticated WITH CHECK (public.is_admin() OR auth.uid() = user_id);
CREATE POLICY "update_finance_records" ON public.finance_records
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR auth.uid() = user_id)
  WITH CHECK (public.is_admin() OR auth.uid() = user_id);
CREATE POLICY "delete_finance_records" ON public.finance_records
  FOR DELETE TO authenticated USING (public.is_admin() OR auth.uid() = user_id);

-- documents: admins see/manage all rows; everyone else only their own.
DROP POLICY IF EXISTS select_own_documents ON public.documents;
DROP POLICY IF EXISTS insert_own_documents ON public.documents;
DROP POLICY IF EXISTS update_own_documents ON public.documents;
DROP POLICY IF EXISTS delete_own_documents ON public.documents;

CREATE POLICY "select_documents" ON public.documents
  FOR SELECT TO authenticated USING (public.is_admin() OR auth.uid() = user_id);
CREATE POLICY "insert_documents" ON public.documents
  FOR INSERT TO authenticated WITH CHECK (public.is_admin() OR auth.uid() = user_id);
CREATE POLICY "update_documents" ON public.documents
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR auth.uid() = user_id)
  WITH CHECK (public.is_admin() OR auth.uid() = user_id);
CREATE POLICY "delete_documents" ON public.documents
  FOR DELETE TO authenticated USING (public.is_admin() OR auth.uid() = user_id);
