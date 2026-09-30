-- Add a second explicitly approved platform administrator identity.
-- Keep platform_access.email as the primary owner address and store any
-- additional approved addresses in a separate array.

ALTER TABLE private.platform_access
  ADD COLUMN IF NOT EXISTS additional_emails TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE private.platform_access AS pa
SET additional_emails = ARRAY(
  SELECT DISTINCT pg_catalog.lower(pg_catalog.btrim(approved.email))
  FROM pg_catalog.unnest(
    pg_catalog.array_cat(
      pa.additional_emails,
      ARRAY[
        'patrikgentedigital@gmail.com'::TEXT,
        'gentedigital2424@gmail.com'::TEXT
      ]
    )
  ) AS approved(email)
  WHERE approved.email IS NOT NULL
    AND pg_catalog.btrim(approved.email) <> ''
  ORDER BY pg_catalog.lower(pg_catalog.btrim(approved.email))
)
WHERE pa.singleton IS TRUE;

CREATE OR REPLACE FUNCTION public.is_platform_user()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM private.platform_access AS pa
    CROSS JOIN LATERAL pg_catalog.unnest(
      pg_catalog.array_append(pa.additional_emails, pa.email)
    ) AS approved(email)
    WHERE pa.singleton IS TRUE
      AND pg_catalog.lower(pg_catalog.btrim(auth.jwt() ->> 'email'))
        = pg_catalog.lower(pg_catalog.btrim(approved.email))
  );
$function$;
