-- Mantém as novas tabelas fechadas para anon/authenticated e elimina índice duplicado.
DROP INDEX IF EXISTS public.idx_commission_payments_ref;

CREATE POLICY "link_clicks_service_role" ON public.link_clicks
  FOR ALL TO service_role
  USING ((SELECT current_user) = 'service_role')
  WITH CHECK ((SELECT current_user) = 'service_role');

CREATE POLICY "web_vitals_service_role" ON public.web_vitals
  FOR ALL TO service_role
  USING ((SELECT current_user) = 'service_role')
  WITH CHECK ((SELECT current_user) = 'service_role');

CREATE POLICY "commission_payments_service_role" ON public.commission_payments
  FOR ALL TO service_role
  USING ((SELECT current_user) = 'service_role')
  WITH CHECK ((SELECT current_user) = 'service_role');
