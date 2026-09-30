-- Correções administrativas do coletor sempre preservam quem alterou, quando e por quê.
CREATE TABLE IF NOT EXISTS public.post_sale_collection_attribution_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_sale_collection_id uuid NOT NULL
    REFERENCES public.post_sale_collections (id) ON DELETE RESTRICT,
  old_colaborador_id text NOT NULL
    REFERENCES public.colaboradores (id) ON DELETE RESTRICT,
  new_colaborador_id text NOT NULL
    REFERENCES public.colaboradores (id) ON DELETE RESTRICT,
  changed_by uuid NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_sale_attribution_audit_collection_created_idx
  ON public.post_sale_collection_attribution_audit (post_sale_collection_id, created_at DESC);

ALTER TABLE public.post_sale_collection_attribution_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.post_sale_collection_attribution_audit FROM PUBLIC;
REVOKE ALL ON TABLE public.post_sale_collection_attribution_audit FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.post_sale_collection_attribution_audit TO service_role;
GRANT UPDATE (collector_colaborador_id, updated_at)
  ON TABLE public.post_sale_collections TO service_role;

CREATE OR REPLACE FUNCTION public.correct_post_sale_collection_collector(
  p_collection_id uuid,
  p_new_colaborador_id text,
  p_changed_by uuid,
  p_reason text,
  p_changed_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $post_sale_collector_correction$
DECLARE
  old_colaborador_id text;
BEGIN
  IF p_collection_id IS NULL
    OR NULLIF(btrim(p_new_colaborador_id), '') IS NULL
    OR p_changed_by IS NULL
    OR p_changed_at IS NULL
    OR char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'Dados da correção de coletor inválidos' USING ERRCODE = '22023';
  END IF;

  SELECT collection.collector_colaborador_id
    INTO old_colaborador_id
  FROM public.post_sale_collections AS collection
  WHERE collection.id = p_collection_id
  FOR UPDATE;

  IF old_colaborador_id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'changed', false);
  END IF;

  IF old_colaborador_id = btrim(p_new_colaborador_id) THEN
    RETURN jsonb_build_object('found', true, 'changed', false);
  END IF;

  UPDATE public.post_sale_collections
  SET collector_colaborador_id = btrim(p_new_colaborador_id),
      updated_at = clock_timestamp()
  WHERE id = p_collection_id;

  INSERT INTO public.post_sale_collection_attribution_audit (
    post_sale_collection_id,
    old_colaborador_id,
    new_colaborador_id,
    changed_by,
    reason,
    created_at
  )
  VALUES (
    p_collection_id,
    old_colaborador_id,
    btrim(p_new_colaborador_id),
    p_changed_by,
    btrim(p_reason),
    p_changed_at
  );

  RETURN jsonb_build_object('found', true, 'changed', true);
END;
$post_sale_collector_correction$;

REVOKE EXECUTE ON FUNCTION public.correct_post_sale_collection_collector(uuid, text, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.correct_post_sale_collection_collector(uuid, text, uuid, text, timestamptz)
  TO service_role;
