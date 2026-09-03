-- ================================================================
-- MIGRATION: Criar tabela commission_payments
-- Executar no SQL Editor do Supabase Dashboard
-- ================================================================

-- Tabela para persistir o estado de pagamento das comissões
-- Substitui o uso problemático de localStorage
CREATE TABLE IF NOT EXISTS commission_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_ref  TEXT NOT NULL UNIQUE,  -- ID da comissão (lead_id ou bonus_id)
  lead_name       TEXT,
  colaborador_name TEXT,
  amount          NUMERIC(10, 2) NOT NULL DEFAULT 0,
  type            TEXT NOT NULL DEFAULT 'pix_colaborador', 
                  -- pix_colaborador | desconto_cliente | bonus_top
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para busca por referência
CREATE INDEX IF NOT EXISTS idx_commission_payments_ref 
  ON commission_payments (commission_ref);

-- Comentário da tabela
COMMENT ON TABLE commission_payments IS 
  'Registro persistente de comissões pagas. Substitui localStorage do admin.';

-- RLS (Row Level Security)
ALTER TABLE commission_payments ENABLE ROW LEVEL SECURITY;

-- Políticas de Segurança RLS
-- Leitura: usuários autenticados podem consultar comissões
-- Escrita (INSERT/UPDATE/DELETE): restrita a administradores (ou via API server-side com service_role)
DROP POLICY IF EXISTS "Authenticated users can read commission_payments" ON commission_payments;
DROP POLICY IF EXISTS "Authenticated users can insert commission_payments" ON commission_payments;
DROP POLICY IF EXISTS "Authenticated users can update commission_payments" ON commission_payments;
DROP POLICY IF EXISTS "Admins podem tudo em commission_payments" ON commission_payments;
DROP POLICY IF EXISTS "Autenticados podem ler commission_payments" ON commission_payments;

CREATE POLICY "Admins podem tudo em commission_payments"
  ON commission_payments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Autenticados podem ler commission_payments"
  ON commission_payments FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);
