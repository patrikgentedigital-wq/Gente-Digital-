-- Hardening de RBAC, segredos, auditoria e idempotência de webhooks.

CREATE TABLE IF NOT EXISTS public.webhook_events (
  source TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  PRIMARY KEY (source, event_id)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL CHECK (char_length(action) BETWEEN 1 AND 120),
  details TEXT NOT NULL CHECK (char_length(details) <= 2000),
  user_email TEXT NOT NULL CHECK (char_length(user_email) <= 320),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

-- Remover qualquer policy anterior das tabelas sensíveis antes de recriar o conjunto mínimo.
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT namespace.nspname, relation.relname, policy.polname
    FROM pg_policy policy
    JOIN pg_class relation ON relation.oid = policy.polrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('leads', 'lead_history', 'colaboradores', 'settings', 'redemptions', 'webhook_events', 'audit_logs')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_record.polname, policy_record.nspname, policy_record.relname);
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.is_app_staff()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'operator', 'viewer'), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_app_operator()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'operator'), FALSE);
$$;

REVOKE EXECUTE ON FUNCTION public.is_app_staff() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_app_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_app_operator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_staff() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_app_operator() TO authenticated, service_role;

-- Nunca expor configurações: public.settings contém credenciais de integração.
REVOKE ALL ON TABLE public.settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.webhook_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.audit_logs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.webhook_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.audit_logs TO service_role;

-- As novas tabelas de serviço não devem ser acessíveis pelo Data API público.
REVOKE ALL ON TABLE public.link_clicks FROM anon, authenticated;
REVOKE ALL ON TABLE public.web_vitals FROM anon, authenticated;
REVOKE ALL ON TABLE public.commission_payments FROM anon, authenticated;

-- Remover policies permissivas antigas.
DROP POLICY IF EXISTS "leitura_publica_colaboradores" ON public.colaboradores;
DROP POLICY IF EXISTS "leitura_publica_settings" ON public.settings;
DROP POLICY IF EXISTS "leads_select_authenticated" ON public.leads;
DROP POLICY IF EXISTS "leads_insert_authenticated" ON public.leads;
DROP POLICY IF EXISTS "leads_update_authenticated" ON public.leads;
DROP POLICY IF EXISTS "leads_delete_authenticated" ON public.leads;
DROP POLICY IF EXISTS "lead_history_authenticated" ON public.lead_history;
DROP POLICY IF EXISTS "colaboradores_insert_authenticated" ON public.colaboradores;
DROP POLICY IF EXISTS "colaboradores_update_authenticated" ON public.colaboradores;
DROP POLICY IF EXISTS "colaboradores_delete_authenticated" ON public.colaboradores;
DROP POLICY IF EXISTS "settings_insert_authenticated" ON public.settings;
DROP POLICY IF EXISTS "settings_update_authenticated" ON public.settings;
DROP POLICY IF EXISTS "settings_delete_authenticated" ON public.settings;
DROP POLICY IF EXISTS "redemptions_authenticated" ON public.redemptions;

DROP POLICY IF EXISTS "Permitir leitura total para administradores logados" ON public.leads;
DROP POLICY IF EXISTS "Permitir inserção para administradores logados" ON public.leads;
DROP POLICY IF EXISTS "Permitir atualização para administradores logados" ON public.leads;
DROP POLICY IF EXISTS "Permitir deleção para administradores logados" ON public.leads;
DROP POLICY IF EXISTS "Histórico Autenticado" ON public.lead_history;

CREATE POLICY "leads_select_staff" ON public.leads
  FOR SELECT TO authenticated USING (public.is_app_staff());
CREATE POLICY "leads_insert_staff" ON public.leads
  FOR INSERT TO authenticated WITH CHECK (public.is_app_operator());
CREATE POLICY "leads_update_staff" ON public.leads
  FOR UPDATE TO authenticated
  USING (public.is_app_operator())
  WITH CHECK (public.is_app_operator());
CREATE POLICY "leads_delete_admin" ON public.leads
  FOR DELETE TO authenticated USING (public.is_app_admin());

CREATE POLICY "lead_history_select_staff" ON public.lead_history
  FOR SELECT TO authenticated USING (public.is_app_staff());
CREATE POLICY "lead_history_insert_staff" ON public.lead_history
  FOR INSERT TO authenticated WITH CHECK (public.is_app_operator());
CREATE POLICY "lead_history_update_admin" ON public.lead_history
  FOR UPDATE TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());
CREATE POLICY "lead_history_delete_admin" ON public.lead_history
  FOR DELETE TO authenticated USING (public.is_app_admin());

CREATE POLICY "colaboradores_select_staff" ON public.colaboradores
  FOR SELECT TO authenticated USING (public.is_app_staff());
CREATE POLICY "colaboradores_insert_admin" ON public.colaboradores
  FOR INSERT TO authenticated WITH CHECK (public.is_app_admin());
CREATE POLICY "colaboradores_update_admin" ON public.colaboradores
  FOR UPDATE TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());
CREATE POLICY "colaboradores_delete_admin" ON public.colaboradores
  FOR DELETE TO authenticated USING (public.is_app_admin());

CREATE POLICY "redemptions_admin" ON public.redemptions
  FOR ALL TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

CREATE POLICY "webhook_events_service_role" ON public.webhook_events
  FOR ALL TO service_role
  USING ((SELECT current_user) = 'service_role')
  WITH CHECK ((SELECT current_user) = 'service_role');
CREATE POLICY "audit_logs_service_role" ON public.audit_logs
  FOR ALL TO service_role
  USING ((SELECT current_user) = 'service_role')
  WITH CHECK ((SELECT current_user) = 'service_role');

REVOKE EXECUTE ON FUNCTION public.get_link_click_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_link_click_counts() TO service_role;
