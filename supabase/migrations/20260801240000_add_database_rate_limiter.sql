-- Fallback atômico de rate limiting quando Upstash/KV não estiver configurado.

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key TEXT PRIMARY KEY CHECK (char_length(key) BETWEEN 1 AND 128),
  window_started_at TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL CHECK (hits >= 0),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_buckets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rate_limit_buckets TO service_role;

DROP POLICY IF EXISTS "rate_limit_buckets_service_role" ON public.rate_limit_buckets;
CREATE POLICY "rate_limit_buckets_service_role" ON public.rate_limit_buckets
  FOR ALL TO service_role
  USING ((SELECT current_user) = 'service_role')
  WITH CHECK ((SELECT current_user) = 'service_role');

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE(allowed BOOLEAN, retry_after_seconds INTEGER)
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_hits INTEGER;
  current_expires TIMESTAMPTZ;
  current_now TIMESTAMPTZ := NOW();
BEGIN
  IF p_key IS NULL OR char_length(p_key) > 128 OR p_limit < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'invalid rate limit arguments';
  END IF;

  INSERT INTO public.rate_limit_buckets(key, window_started_at, hits, expires_at)
  VALUES (p_key, current_now, 1, current_now + make_interval(secs => p_window_seconds))
  ON CONFLICT (key) DO UPDATE
    SET hits = CASE
      WHEN public.rate_limit_buckets.expires_at <= current_now THEN 1
      ELSE LEAST(public.rate_limit_buckets.hits + 1, p_limit + 1)
    END,
    window_started_at = CASE
      WHEN public.rate_limit_buckets.expires_at <= current_now THEN current_now
      ELSE public.rate_limit_buckets.window_started_at
    END,
    expires_at = CASE
      WHEN public.rate_limit_buckets.expires_at <= current_now THEN current_now + make_interval(secs => p_window_seconds)
      ELSE public.rate_limit_buckets.expires_at
    END
  RETURNING rate_limit_buckets.hits, rate_limit_buckets.expires_at
  INTO current_hits, current_expires;

  RETURN QUERY SELECT
    current_hits <= p_limit,
    GREATEST(1, CEIL(EXTRACT(EPOCH FROM (current_expires - current_now)))::INTEGER);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;
