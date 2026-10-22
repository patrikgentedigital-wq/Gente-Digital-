-- Resultado técnico separado do lead: não altera status, indicação ou comissão.
create table if not exists public.viability_evaluations (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null unique,
  user_id uuid not null references auth.users(id),
  lead_id integer references public.leads(id) on delete set null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  constraint viability_result_origin check (result ? 'origin' and result->>'origin' in ('DEMO','LIVE')),
  constraint viability_result_status check (result ? 'status' and result->>'status' in ('VIAVEL','INVIAVEL','ANALISE_TECNICA'))
);
create index if not exists viability_user_date on public.viability_evaluations(user_id,created_at desc);
create index if not exists viability_lead_date on public.viability_evaluations(lead_id,created_at desc);
alter table public.viability_evaluations enable row level security;
revoke all on public.viability_evaluations from anon, authenticated, service_role;
grant select on public.viability_evaluations to authenticated;
grant select, insert on public.viability_evaluations to service_role;
create policy "viability_read_own_or_admin" on public.viability_evaluations for select to authenticated
using (user_id=(select auth.uid()) or exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid()) and ur.role='admin'));
-- Nenhuma política/grant de escrita para clientes. A rota autentica, autoriza
-- o lead e registra uma decisão calculada pelo motor usando service_role.
