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

-- RLS (Row Level Security) - ajuste conforme sua política
ALTER TABLE commission_payments ENABLE ROW LEVEL SECURITY;

-- Política: usuários autenticados podem ler e inserir
CREATE POLICY "Authenticated users can read commission_payments"
  ON commission_payments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert commission_payments"
  ON commission_payments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update commission_payments"
  ON commission_payments FOR UPDATE
  TO authenticated
  USING (true);
