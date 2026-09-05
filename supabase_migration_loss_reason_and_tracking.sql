-- ================================================================
-- MIGRATION: Motivo de Perda/Erro e Rastreamento em Leads
-- Executar no SQL Editor do Supabase Dashboard.
-- ================================================================

-- 1. Coluna loss_reason para registrar o motivo de descarte ou erro do lead
ALTER TABLE leads ADD COLUMN IF NOT EXISTS loss_reason TEXT;

-- 2. Coluna tracking_metadata para armazenar metadados opcionais de rastreamento (JSON)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tracking_metadata JSONB DEFAULT '{}'::jsonb;

-- 3. Índice para consultas rápidas por status e data de criação (apuracao de comissoes)
CREATE INDEX IF NOT EXISTS idx_leads_status_created_at 
  ON leads (status, created_at DESC);

-- 4. Índice para buscas por ref e período
CREATE INDEX IF NOT EXISTS idx_leads_ref_created_at 
  ON leads (ref, created_at DESC);
