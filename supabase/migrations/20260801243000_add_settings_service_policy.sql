-- Policy explícita para deixar claro que settings pertence somente ao backend.

DROP POLICY IF EXISTS "settings_service_role" ON public.settings;
CREATE POLICY "settings_service_role" ON public.settings
  FOR ALL TO service_role
  USING ((SELECT current_user) = 'service_role')
  WITH CHECK ((SELECT current_user) = 'service_role');
