-- Compatibilidade para instalações antigas que ainda executam este arquivo manualmente.
-- A migração oficial está em supabase/migrations/20260801000000_harden_referral_program.sql.

CREATE TABLE IF NOT EXISTS public.commission_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_ref TEXT NOT NULL UNIQUE,
  lead_name TEXT,
  colaborador_name TEXT,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  type TEXT NOT NULL DEFAULT 'pix_colaborador'
    CHECK (type IN ('pix_colaborador', 'desconto_cliente', 'bonus_top')),
  status TEXT NOT NULL DEFAULT 'baixa_registrada',
  payment_reference TEXT,
  confirmation_source TEXT NOT NULL DEFAULT 'manual_admin',
  confirmed_by UUID,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.commission_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commission_payments FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commission_payments TO service_role;

COMMENT ON TABLE public.commission_payments IS
  'Baixas administrativas de comissões com referência de comprovante; não substitui o comprovante financeiro externo.';
