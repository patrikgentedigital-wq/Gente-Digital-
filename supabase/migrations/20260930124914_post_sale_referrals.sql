-- Pós-venda: coleta por contrato de origem, contatos e contratos convertidos.
-- Esta migration é aditiva e não atualiza nem reatribui leads existentes.

CREATE TABLE IF NOT EXISTS public.post_sale_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_contract_id text NOT NULL UNIQUE CHECK (btrim(origin_contract_id) <> ''),
  origin_customer_ref text NOT NULL CHECK (btrim(origin_customer_ref) <> ''),
  sold_at timestamptz NOT NULL,
  collector_colaborador_id text NOT NULL
    REFERENCES public.colaboradores (id) ON DELETE RESTRICT,
  recorded_by uuid NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('contacts_collected', 'no_referral')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.post_sale_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_sale_collection_id uuid NOT NULL
    REFERENCES public.post_sale_collections (id) ON DELETE CASCADE,
  contact_name text NOT NULL DEFAULT '',
  phone_raw text NOT NULL DEFAULT '',
  phone_normalized text NOT NULL DEFAULT '',
  state text NOT NULL CHECK (state IN ('created_lead', 'duplicate_existing', 'invalid')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.post_sale_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ixc_contract_id text NOT NULL UNIQUE CHECK (btrim(ixc_contract_id) <> ''),
  post_sale_collection_id uuid
    REFERENCES public.post_sale_collections (id) ON DELETE SET NULL,
  post_sale_contact_id uuid
    REFERENCES public.post_sale_contacts (id) ON DELETE SET NULL,
  activated_at timestamptz NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL CHECK (state IN ('confirmed', 'pending_review')),
  reviewed_by uuid,
  review_reason text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_sale_conversions_confirmed_contact_check
    CHECK (state <> 'confirmed' OR post_sale_contact_id IS NOT NULL),
  CONSTRAINT post_sale_conversions_review_audit_check
    CHECK (
      reviewed_at IS NULL
      OR (reviewed_by IS NOT NULL AND btrim(COALESCE(review_reason, '')) <> '')
    )
);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS post_sale_collection_id uuid;

DO $post_sale_lead_relations$
DECLARE
  lead_id_type text;
BEGIN
  SELECT pg_catalog.format_type(lead_id_column.atttypid, lead_id_column.atttypmod)
    INTO lead_id_type
  FROM pg_catalog.pg_attribute AS lead_id_column
  WHERE lead_id_column.attrelid = 'public.leads'::regclass
    AND lead_id_column.attname = 'id'
    AND NOT lead_id_column.attisdropped;

  IF lead_id_type IS NULL THEN
    RAISE EXCEPTION 'public.leads.id não foi encontrado; a migration de pós-venda foi cancelada';
  END IF;

  EXECUTE pg_catalog.format(
    'ALTER TABLE public.post_sale_contacts ADD COLUMN IF NOT EXISTS lead_id %s',
    lead_id_type
  );

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS relation_constraint
    WHERE relation_constraint.conrelid = 'public.post_sale_contacts'::regclass
      AND relation_constraint.conname = 'post_sale_contacts_lead_id_fkey'
  ) THEN
    ALTER TABLE public.post_sale_contacts
      ADD CONSTRAINT post_sale_contacts_lead_id_fkey
      FOREIGN KEY (lead_id) REFERENCES public.leads (id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS relation_constraint
    WHERE relation_constraint.conrelid = 'public.leads'::regclass
      AND relation_constraint.conname = 'leads_post_sale_collection_id_fkey'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_post_sale_collection_id_fkey
      FOREIGN KEY (post_sale_collection_id)
      REFERENCES public.post_sale_collections (id) ON DELETE SET NULL;
  END IF;
END;
$post_sale_lead_relations$;

CREATE INDEX IF NOT EXISTS post_sale_collections_collector_sold_at_idx
  ON public.post_sale_collections (collector_colaborador_id, sold_at DESC);

CREATE INDEX IF NOT EXISTS post_sale_contacts_collection_idx
  ON public.post_sale_contacts (post_sale_collection_id, created_at);

CREATE INDEX IF NOT EXISTS post_sale_contacts_lead_id_idx
  ON public.post_sale_contacts (lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS post_sale_conversions_contact_activated_idx
  ON public.post_sale_conversions (post_sale_contact_id, activated_at DESC)
  WHERE post_sale_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS post_sale_conversions_collection_activated_idx
  ON public.post_sale_conversions (post_sale_collection_id, activated_at DESC)
  WHERE post_sale_collection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS post_sale_conversions_state_verified_idx
  ON public.post_sale_conversions (state, verified_at DESC);

CREATE INDEX IF NOT EXISTS leads_post_sale_collection_id_idx
  ON public.leads (post_sale_collection_id)
  WHERE post_sale_collection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_post_sale_normalized_phone_idx
  ON public.leads (
    (pg_catalog.regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'))
  );

ALTER TABLE public.post_sale_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_sale_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_sale_conversions ENABLE ROW LEVEL SECURITY;

-- Não criar policies: acesso direto de anon/authenticated fica negado por padrão.
REVOKE ALL ON TABLE public.post_sale_collections FROM PUBLIC;
REVOKE ALL ON TABLE public.post_sale_collections FROM anon, authenticated;
REVOKE ALL ON TABLE public.post_sale_contacts FROM PUBLIC;
REVOKE ALL ON TABLE public.post_sale_contacts FROM anon, authenticated;
REVOKE ALL ON TABLE public.post_sale_conversions FROM PUBLIC;
REVOKE ALL ON TABLE public.post_sale_conversions FROM anon, authenticated;

-- PostgREST depende destes grants explícitos para o servidor com service_role.
GRANT SELECT, INSERT ON TABLE public.post_sale_collections TO service_role;
GRANT SELECT, INSERT ON TABLE public.post_sale_contacts TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.post_sale_conversions TO service_role;

CREATE OR REPLACE FUNCTION public.create_post_sale_collection_with_contacts(
  p_origin_contract_id text,
  p_origin_customer_ref text,
  p_sold_at timestamptz,
  p_collector_colaborador_id text,
  p_recorded_by uuid,
  p_outcome text,
  p_contacts jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $post_sale_collection_rpc$
DECLARE
  contact_payload jsonb;
  collection_id uuid;
  contact_id uuid;
  existing_collection_id uuid;
  lead_row_id bigint;
  inserted_lead_id bigint;
  contact_name_value text;
  raw_phone_value text;
  normalized_phone_value text;
  contact_state text;
  contact_reason text;
  contact_results jsonb := '[]'::jsonb;
BEGIN
  IF NULLIF(btrim(p_origin_contract_id), '') IS NULL
    OR NULLIF(btrim(p_origin_customer_ref), '') IS NULL
    OR p_sold_at IS NULL
    OR NULLIF(btrim(p_collector_colaborador_id), '') IS NULL
    OR p_recorded_by IS NULL THEN
    RAISE EXCEPTION 'Dados obrigatórios da coleta estão ausentes' USING ERRCODE = '22023';
  END IF;

  IF p_outcome NOT IN ('contacts_collected', 'no_referral') THEN
    RAISE EXCEPTION 'Resultado da coleta inválido' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_contacts) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'A lista de contatos deve ser um array' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_contacts) > 100 THEN
    RAISE EXCEPTION 'A coleta excede o limite de contatos' USING ERRCODE = '22023';
  END IF;

  IF (p_outcome = 'no_referral' AND jsonb_array_length(p_contacts) <> 0)
    OR (p_outcome = 'contacts_collected' AND jsonb_array_length(p_contacts) = 0) THEN
    RAISE EXCEPTION 'Resultado da coleta incompatível com a lista de contatos' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.post_sale_collections (
    origin_contract_id,
    origin_customer_ref,
    sold_at,
    collector_colaborador_id,
    recorded_by,
    outcome
  )
  VALUES (
    btrim(p_origin_contract_id),
    btrim(p_origin_customer_ref),
    p_sold_at,
    btrim(p_collector_colaborador_id),
    p_recorded_by,
    p_outcome
  )
  ON CONFLICT (origin_contract_id) DO NOTHING
  RETURNING id INTO collection_id;

  IF collection_id IS NULL THEN
    SELECT existing_collection.id
      INTO existing_collection_id
    FROM public.post_sale_collections AS existing_collection
    WHERE existing_collection.origin_contract_id = btrim(p_origin_contract_id);

    RETURN jsonb_build_object(
      'collectionId', existing_collection_id,
      'created', false,
      'outcome', p_outcome
    );
  END IF;

  FOR contact_payload IN
    SELECT contact_item.value
    FROM jsonb_array_elements(p_contacts) AS contact_item(value)
  LOOP
    contact_name_value := COALESCE(NULLIF(btrim(contact_payload ->> 'name'), ''), '');
    raw_phone_value := COALESCE(contact_payload ->> 'phone', '');
    normalized_phone_value := pg_catalog.regexp_replace(raw_phone_value, '[^0-9]', '', 'g');
    lead_row_id := NULL;
    inserted_lead_id := NULL;
    contact_reason := NULL;

    IF jsonb_typeof(contact_payload -> 'name') IS DISTINCT FROM 'string'
      OR contact_name_value = '' THEN
      contact_state := 'invalid';
      contact_reason := 'missing_name';
    ELSIF jsonb_typeof(contact_payload -> 'phone') IS DISTINCT FROM 'string'
      OR char_length(normalized_phone_value) < 10
      OR char_length(normalized_phone_value) > 15 THEN
      contact_state := 'invalid';
      contact_reason := 'invalid_phone';
    ELSE
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(normalized_phone_value, 0)
      );

      SELECT lead_row.id
        INTO lead_row_id
      FROM public.leads AS lead_row
      WHERE pg_catalog.regexp_replace(COALESCE(lead_row.phone, ''), '[^0-9]', '', 'g')
        = normalized_phone_value
      ORDER BY lead_row.created_at ASC NULLS LAST, lead_row.id ASC
      LIMIT 1;

      IF lead_row_id IS NOT NULL THEN
        contact_state := 'duplicate_existing';
        contact_reason := 'phone_already_registered';
      ELSE
        INSERT INTO public.leads (
          name,
          phone,
          ref,
          status,
          value,
          source,
          created_at,
          post_sale_collection_id
        )
        VALUES (
          contact_name_value,
          normalized_phone_value,
          btrim(p_origin_customer_ref),
          'Pendente',
          0,
          'post_sale',
          now(),
          collection_id
        )
        ON CONFLICT DO NOTHING
        RETURNING id INTO inserted_lead_id;

        IF inserted_lead_id IS NOT NULL THEN
          lead_row_id := inserted_lead_id;
          contact_state := 'created_lead';

          INSERT INTO public.lead_history (lead_id, date, action, note)
          VALUES (
            inserted_lead_id,
            to_char(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
            'Lead criado após coleta de pós-venda',
            'Coleta ' || collection_id::text
          );
        ELSE
          SELECT lead_row.id
            INTO lead_row_id
          FROM public.leads AS lead_row
          WHERE pg_catalog.regexp_replace(COALESCE(lead_row.phone, ''), '[^0-9]', '', 'g')
            = normalized_phone_value
          ORDER BY lead_row.created_at ASC NULLS LAST, lead_row.id ASC
          LIMIT 1;

          IF lead_row_id IS NULL THEN
            RAISE EXCEPTION 'Não foi possível inserir nem localizar o lead da coleta';
          END IF;

          contact_state := 'duplicate_existing';
          contact_reason := 'phone_already_registered';
        END IF;
      END IF;
    END IF;

    INSERT INTO public.post_sale_contacts (
      post_sale_collection_id,
      contact_name,
      phone_raw,
      phone_normalized,
      state,
      reason,
      lead_id
    )
    VALUES (
      collection_id,
      contact_name_value,
      raw_phone_value,
      normalized_phone_value,
      contact_state,
      contact_reason,
      CASE WHEN contact_state = 'created_lead' THEN lead_row_id ELSE NULL END
    )
    RETURNING id INTO contact_id;

    contact_results := contact_results || jsonb_build_array(jsonb_build_object(
      'contactId', contact_id,
      'state', contact_state,
      'leadId', CASE WHEN contact_state = 'created_lead' THEN lead_row_id ELSE NULL END,
      'reason', contact_reason
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'collectionId', collection_id,
    'created', true,
    'outcome', p_outcome,
    'contacts', contact_results
  );
END;
$post_sale_collection_rpc$;

REVOKE EXECUTE ON FUNCTION public.create_post_sale_collection_with_contacts(
  text, text, timestamptz, text, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_post_sale_collection_with_contacts(
  text, text, timestamptz, text, uuid, text, jsonb
) TO service_role;
