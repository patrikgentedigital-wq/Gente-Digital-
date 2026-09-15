-- ================================================================
-- FIX: Padroniza a coluna de referência de comissões
-- Se o banco foi criado com a coluna "commission_key" (versão antiga
-- do código), renomeia para "commission_ref" para casar com a migration
-- supabase_migration_commission_payments.sql e com o código atual.
-- Idempotente: só renomeia se "commission_key" existir e
-- "commission_ref" ainda não existir. Executar no SQL Editor do Supabase.
-- ================================================================

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
      AND column_name = 'commission_key'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'commission_payments'
      AND column_name = 'commission_ref'
  ) THEN
    ALTER TABLE public.commission_payments
      RENAME COLUMN commission_key TO commission_ref;
  END IF;
END
$$;
