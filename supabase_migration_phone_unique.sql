-- ================================================================
-- MIGRATION: Índice único de telefone em leads
-- Fecha a race condition do endpoint /api/referrals, onde duas
-- requisições simultâneas com o mesmo telefone podiam inserir
-- leads duplicados (a checagem prévia é feita sem lock).
-- Executar no SQL Editor do Supabase Dashboard.
-- ================================================================

-- Remove duplicados existentes antes de criar o índice (mantém o mais antigo)
DELETE FROM leads a
  USING leads b
  WHERE a.id > b.id
    AND a.phone = b.phone;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_phone
  ON leads (phone);
