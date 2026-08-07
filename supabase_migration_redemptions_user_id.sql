-- ================================================================
-- MIGRATION: Escopo individual da Gamificação (resgates por usuário)
-- Adiciona a coluna user_id em redemptions para que cada usuário
-- veja e gaste APENAS os próprios pontos e histórico de resgates.
-- Executar no SQL Editor do Supabase Dashboard.
-- ================================================================

ALTER TABLE redemptions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_redemptions_user_id ON redemptions (user_id);