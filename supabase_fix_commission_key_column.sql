-- ================================================================
-- FIX: Padroniza a coluna de referência de comissões
-- Se o banco foi criado com a coluna "commission_key" (versão antiga
-- do código), renomeia para "commission_ref" para casar com a migration
-- supabase_migration_commission_payments.sql e com o código atual.
-- Executar no SQL Editor do Supabase Dashboard.
-- ================================================================

ALTER TABLE commission_payments
  RENAME COLUMN commission_key TO commission_ref;