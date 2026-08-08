-- ================================================================
-- MIGRATION: Deduplicação, RLS e RBAC para Supabase
-- Executar no SQL Editor do Supabase Dashboard.
-- ================================================================

-- 1. Coluna external_ref para deduplicação primária no webhook MS Forms
ALTER TABLE leads ADD COLUMN IF NOT EXISTS external_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_external_ref 
  ON leads (external_ref) WHERE external_ref IS NOT NULL;

-- 2. Coluna source para rastreabilidade do canal de entrada do lead
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
-- Valores: 'ms_forms', 'landing', 'manual', 'api'

-- 3. Coluna user_id em colaboradores para vinculação ao auth.users
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_colaboradores_user_id 
  ON colaboradores (user_id) WHERE user_id IS NOT NULL;

-- 4. Função auxiliar is_admin para checar se o usuário atual é admin em RLS
CREATE OR REPLACE FUNCTION public.is_admin(uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = uid AND role = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 5. Habilitar RLS em leads
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins podem tudo em leads" ON leads;
CREATE POLICY "Admins podem tudo em leads" ON leads
  FOR ALL USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Autenticados podem ler leads" ON leads;
CREATE POLICY "Autenticados podem ler leads" ON leads
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Autenticados podem criar leads" ON leads;
CREATE POLICY "Autenticados podem criar leads" ON leads
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 6. Habilitar RLS em lead_history
ALTER TABLE lead_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins podem tudo em lead_history" ON lead_history;
CREATE POLICY "Admins podem tudo em lead_history" ON lead_history
  FOR ALL USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Autenticados podem ler lead_history" ON lead_history;
CREATE POLICY "Autenticados podem ler lead_history" ON lead_history
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Autenticados podem inserir lead_history" ON lead_history;
CREATE POLICY "Autenticados podem inserir lead_history" ON lead_history
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 7. Habilitar RLS em colaboradores
ALTER TABLE colaboradores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins podem tudo em colaboradores" ON colaboradores;
CREATE POLICY "Admins podem tudo em colaboradores" ON colaboradores
  FOR ALL USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Autenticados podem ler colaboradores" ON colaboradores;
CREATE POLICY "Autenticados podem ler colaboradores" ON colaboradores
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 8. Habilitar RLS em redemptions
ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins podem tudo em redemptions" ON redemptions;
CREATE POLICY "Admins podem tudo em redemptions" ON redemptions
  FOR ALL USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Usuarios veem seus resgates" ON redemptions;
CREATE POLICY "Usuarios veem seus resgates" ON redemptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuarios podem criar resgates" ON redemptions;
CREATE POLICY "Usuarios podem criar resgates" ON redemptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 9. Habilitar RLS em settings
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins podem tudo em settings" ON settings;
CREATE POLICY "Admins podem tudo em settings" ON settings
  FOR ALL USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Autenticados podem ler settings" ON settings;
CREATE POLICY "Autenticados podem ler settings" ON settings
  FOR SELECT USING (auth.uid() IS NOT NULL);
