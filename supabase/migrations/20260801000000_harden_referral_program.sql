-- Programa Indique e Ganhe: rastreamento, acompanhamento, métricas e baixas auditáveis.
-- Esta migração é aditiva e mantém os leads existentes.

ALTER TABLE IF EXISTS public.leads
  ADD COLUMN IF NOT EXISTS tracking_code TEXT,
  ADD COLUMN IF NOT EXISTS submission_key UUID,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'dashboard',
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_tracking_code
  ON public.leads (tracking_code)
  WHERE tracking_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_submission_key
  ON public.leads (submission_key)
  WHERE submission_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_history_lead_id
  ON public.lead_history (lead_id);

CREATE TABLE IF NOT EXISTS public.link_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref TEXT NOT NULL CHECK (char_length(ref) BETWEEN 1 AND 50),
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_link_clicks_ref_created_at
  ON public.link_clicks (ref, created_at DESC);

CREATE TABLE IF NOT EXISTS public.web_vitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id TEXT NOT NULL UNIQUE,
  metric_name TEXT NOT NULL CHECK (metric_name IN ('CLS', 'FCP', 'FID', 'INP', 'LCP', 'TTFB')),
  value NUMERIC(14, 4) NOT NULL CHECK (value >= 0),
  delta NUMERIC(14, 4) NOT NULL,
  rating TEXT CHECK (rating IN ('good', 'needs-improvement', 'poor')),
  navigation_type TEXT,
  path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_vitals_name_created_at
  ON public.web_vitals (metric_name, created_at DESC);

CREATE TABLE IF NOT EXISTS public.commission_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_ref TEXT NOT NULL UNIQUE,
  lead_name TEXT,
  colaborador_name TEXT,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  type TEXT NOT NULL DEFAULT 'pix_colaborador'
    CHECK (type IN ('pix_colaborador', 'desconto_cliente', 'bonus_top')),
  status TEXT NOT NULL DEFAULT 'baixa_registrada'
    CHECK (status IN ('baixa_registrada')),
  payment_reference TEXT,
  confirmation_source TEXT NOT NULL DEFAULT 'manual_admin',
  confirmed_by UUID,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.commission_payments
  ADD COLUMN IF NOT EXISTS commission_ref TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'baixa_registrada',
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_source TEXT NOT NULL DEFAULT 'manual_admin',
  ADD COLUMN IF NOT EXISTS confirmed_by UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION public.get_link_click_counts()
RETURNS TABLE(ref TEXT, click_count BIGINT)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT link_clicks.ref, COUNT(*)::BIGINT AS click_count
  FROM public.link_clicks
  GROUP BY link_clicks.ref
  ORDER BY COUNT(*) DESC, link_clicks.ref ASC;
$$;

-- O serviço de servidor é a única superfície autorizada para estas tabelas.
ALTER TABLE public.link_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.link_clicks FROM anon, authenticated;
REVOKE ALL ON TABLE public.web_vitals FROM anon, authenticated;
REVOKE ALL ON TABLE public.commission_payments FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.link_clicks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.web_vitals TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commission_payments TO service_role;
REVOKE ALL ON FUNCTION public.get_link_click_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_link_click_counts() TO service_role;

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

-- Remove políticas permissivas que possam existir de uma instalação anterior.
DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policy.polname, relation.relname
    FROM pg_policy policy
    JOIN pg_class relation ON relation.oid = policy.polrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('link_clicks', 'web_vitals', 'commission_payments')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_record.polname, policy_record.relname);
  END LOOP;
END
$$;

-- Corrige o helper de autorização: sem search_path mutável e sem execução anônima.
ALTER FUNCTION public.get_my_colaborador_role()
  SECURITY INVOKER
  SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.get_my_colaborador_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_colaborador_role() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- Mantém o comportamento atual do painel, mas evita políticas com auth.role() reavaliado por linha.
DROP POLICY IF EXISTS "Permitir leitura total para administradores logados" ON public.leads;
DROP POLICY IF EXISTS "Permitir inserção para administradores logados" ON public.leads;
DROP POLICY IF EXISTS "Permitir atualização para administradores logados" ON public.leads;
DROP POLICY IF EXISTS "Permitir deleção para administradores logados" ON public.leads;
CREATE POLICY "leads_select_authenticated" ON public.leads
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "leads_insert_authenticated" ON public.leads
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "leads_update_authenticated" ON public.leads
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "leads_delete_authenticated" ON public.leads
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Histórico Autenticado" ON public.lead_history;
CREATE POLICY "lead_history_authenticated" ON public.lead_history
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS insert_autenticados ON public.colaboradores;
DROP POLICY IF EXISTS update_autenticados ON public.colaboradores;
DROP POLICY IF EXISTS delete_autenticados ON public.colaboradores;
CREATE POLICY "colaboradores_insert_authenticated" ON public.colaboradores
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "colaboradores_update_authenticated" ON public.colaboradores
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "colaboradores_delete_authenticated" ON public.colaboradores
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS escrita_autenticados_settings ON public.settings;
CREATE POLICY "settings_insert_authenticated" ON public.settings
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "settings_update_authenticated" ON public.settings
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "settings_delete_authenticated" ON public.settings
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS redemptions_autenticados ON public.redemptions;
CREATE POLICY "redemptions_authenticated" ON public.redemptions
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
