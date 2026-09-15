-- =====================================================================
-- supabase_migration_fix_all.sql
-- Migration idempotente consolidada (pode ser reexecutada sem erro).
-- Executar no SQL Editor do Supabase Dashboard.
-- Seções: user_roles | is_admin() | settings RLS | leads RLS |
--         commission_payments CHECK | índice phone | redemptions.user_id |
--         audit_logs | lead_history FK cascade
-- =====================================================================

-- ---------------------------------------------------------------------
-- (a) Tabela user_roles + RLS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'vendedor' CHECK (role IN ('admin', 'vendedor')),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Service role (supabaseAdmin) sempre bypassa RLS (service_role ignora RLS),
-- mas a policy explícita abaixo documenta a intenção.
DROP POLICY IF EXISTS "user_roles_service_role_all" ON public.user_roles;
CREATE POLICY "user_roles_service_role_all"
  ON public.user_roles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------
-- (b) Função is_admin() com search_path fixado (evita hijacking de
--     search_path em funções SECURITY DEFINER). DROP antes para forçar
--     a recriação com o SET search_path.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.is_admin();

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
$$;

-- ---------------------------------------------------------------------
-- (c) RLS em settings: revogar leitura pública; apenas admins.
--     ATENÇÃO: o token IXC fica nesta tabela — nunca habilite SELECT
--     público ou para authenticated genérico.
-- ---------------------------------------------------------------------
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.settings FROM anon;
REVOKE ALL ON public.settings FROM authenticated;

DROP POLICY IF EXISTS "settings_admin_all" ON public.settings;
CREATE POLICY "settings_admin_all"
  ON public.settings
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "settings_service_role_all" ON public.settings;
CREATE POLICY "settings_service_role_all"
  ON public.settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Remove policies antigas/permissivas com outros nomes que permitiriam
-- authenticated/anon lerem settings (o token IXC fica aqui).
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname, roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'settings'
      AND policyname NOT IN ('settings_admin_all', 'settings_service_role_all')
  LOOP
    IF 'authenticated' = ANY (pol.roles) OR 'anon' = ANY (pol.roles) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.settings', pol.policyname);
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------
-- (d) RLS em leads:
--     SELECT para autenticados (compatibilidade com o painel atual),
--     INSERT para autenticados.
--     TODO/FUTURO: restringir SELECT por coluna "ref" do usuário
--     (ex.: USING (ref = auth.uid()::text) ou join com user_roles) para
--     que vendedores só vejam as próprias indicações.
-- ---------------------------------------------------------------------
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_select_authenticated" ON public.leads;
CREATE POLICY "leads_select_authenticated"
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "leads_insert_authenticated" ON public.leads;
CREATE POLICY "leads_insert_authenticated"
  ON public.leads
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "leads_service_role_all" ON public.leads;
CREATE POLICY "leads_service_role_all"
  ON public.leads
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------
-- (e) commission_payments: CHECK em type (pix_colaborador, desconto_cliente,
--     bonus_top). CHECK não suporta IF NOT EXISTS: dropamos se existir e
--     recriamos. Envolvido em DO block para não falhar se a tabela ou a
--     coluna não existirem.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'commission_payments'
  )
     AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'commission_payments'
      AND column_name = 'type'
  ) THEN
    ALTER TABLE public.commission_payments
      DROP CONSTRAINT IF EXISTS commission_payments_type_check;
    BEGIN
      ALTER TABLE public.commission_payments
        ADD CONSTRAINT commission_payments_type_check
        CHECK (type IN ('pix_colaborador', 'desconto_cliente', 'bonus_top'));
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'AVISO: commission_payments possui linhas com type fora dos valores esperados; constraint nao aplicada. Verifique os dados.';
    END;
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- (f) Índice único de telefone em leads.
--     IMPORTANTE: phone vazio deve ser gravado como NULL (não como
--     string ''), senão o índice partial abaixo não permite o segundo
--     registro vazio. O código deve normalizar '' -> NULL antes de insert.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  -- Se existir um índice idx_leads_phone NÃO-partial, dropa antes.
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_leads_phone'
      AND indexdef NOT LIKE '%WHERE%'
  ) THEN
    DROP INDEX public.idx_leads_phone;
  END IF;

  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_phone
      ON public.leads (phone)
      WHERE phone IS NOT NULL AND phone <> '';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'AVISO: existem telefones duplicados em leads (formatos diferentes do mesmo numero); o indice unico partial NAO foi criado. Normalizar telefone antes de tentar novamente.';
  END;
END
$$;

-- ---------------------------------------------------------------------
-- (g) Garantir coluna user_id em redemptions (antes das policies que
--     possam referenciá-la).
-- ---------------------------------------------------------------------
ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS user_id uuid;

-- ---------------------------------------------------------------------
-- (h) Tabela audit_logs + RLS (admins leem; service role escreve tudo).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  user_email text,
  action text,
  details jsonb,
  user_agent text
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_admin_select" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_select"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "audit_logs_service_role_all" ON public.audit_logs;
CREATE POLICY "audit_logs_service_role_all"
  ON public.audit_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------
-- (i) FK ON DELETE CASCADE em lead_history -> leads(id).
--     Nomes de tabela/constraint/coluna podem variar entre ambientes:
--     ajuste 'lead_history' e a coluna 'lead_id' abaixo se necessário
--     (o DO block já descobre o nome da constraint dinamicamente).
--     O DO block localiza a FK existente que referencia leads(id), dropa
--     e recria com ON DELETE CASCADE.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  constraint_name text;
  table_name_found text;
BEGIN
  SELECT con.conname, rel.relname
    INTO constraint_name, table_name_found
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_class refs ON refs.oid = con.confrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE con.contype = 'f'
    AND nsp.nspname = 'public'
    AND rel.relname = 'lead_history'
    AND refs.relname = 'leads'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', table_name_found, constraint_name);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE',
      table_name_found, constraint_name
    );
  END IF;
END
$$;
