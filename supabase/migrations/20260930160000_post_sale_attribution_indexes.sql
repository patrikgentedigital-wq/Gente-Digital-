-- Cobre as referências de colaborador na auditoria de correção de coletor.
CREATE INDEX IF NOT EXISTS post_sale_attribution_audit_old_colaborador_idx
  ON public.post_sale_collection_attribution_audit (old_colaborador_id);

CREATE INDEX IF NOT EXISTS post_sale_attribution_audit_new_colaborador_idx
  ON public.post_sale_collection_attribution_audit (new_colaborador_id);
