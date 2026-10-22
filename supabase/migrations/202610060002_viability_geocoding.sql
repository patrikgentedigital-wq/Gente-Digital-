-- Dados públicos de ruas/cidades. Não recebe números de imóveis ou dados de clientes.
create table public.viability_geocoding_gate (
  provider text primary key check (provider = 'nominatim'),
  last_started_at timestamptz not null
);
insert into public.viability_geocoding_gate values ('nominatim', '-infinity');
create table public.viability_geocoding_cache (
  query_hash text primary key check (query_hash ~ '^[a-f0-9]{64}$'),
  places jsonb not null check (jsonb_typeof(places) = 'array' and jsonb_array_length(places) <= 5),
  expires_at timestamptz not null
);
create index viability_geocoding_cache_expiry on public.viability_geocoding_cache(expires_at);
alter table public.viability_geocoding_gate enable row level security;
alter table public.viability_geocoding_cache enable row level security;
revoke all on public.viability_geocoding_gate, public.viability_geocoding_cache from public, anon, authenticated, service_role;
grant select, update on public.viability_geocoding_gate to service_role;
grant select, insert, update, delete on public.viability_geocoding_cache to service_role;

create function public.viability_claim_geocoding_slot() returns boolean
language sql volatile security invoker set search_path = '' as $$
  with claimed as (
    update public.viability_geocoding_gate
    set last_started_at = clock_timestamp()
    where provider = 'nominatim' and last_started_at <= clock_timestamp() - interval '1100 milliseconds'
    returning provider
  )
  select exists(select 1 from claimed);
$$;
revoke all on function public.viability_claim_geocoding_slot() from public, anon, authenticated;
grant execute on function public.viability_claim_geocoding_slot() to service_role;
notify pgrst, 'reload schema';
