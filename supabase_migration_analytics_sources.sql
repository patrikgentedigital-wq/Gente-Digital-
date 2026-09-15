-- Camada analítica Opa! Suite + IXC.
--
-- Esta migration é deliberadamente aditiva. Ela não altera grants, policies ou
-- estruturas das tabelas existentes do Indique e Ganhe. O processo de carga
-- usa service_role no n8n/server-side; anon e authenticated ficam sem acesso
-- direto às tabelas novas.

begin;

create schema if not exists integration;

create table if not exists integration.opa_records_raw (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  source_system text not null check (source_system = 'opa'),
  record_type text not null,
  payload jsonb not null,
  source_updated_at timestamptz,
  received_at timestamptz not null default now(),
  sync_run_id uuid
);

create table if not exists integration.ixc_records_raw (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  source_system text not null check (source_system = 'ixc'),
  record_type text not null,
  payload jsonb not null,
  source_updated_at timestamptz,
  received_at timestamptz not null default now(),
  sync_run_id uuid
);

create table if not exists integration.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_system text not null check (source_system in ('opa', 'ixc')),
  request_id text not null unique,
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null check (status in ('success', 'partial', 'failed', 'unavailable')),
  received integer not null default 0 check (received >= 0),
  inserted integer not null default 0 check (inserted >= 0),
  updated integer not null default 0 check (updated >= 0),
  failed integer not null default 0 check (failed >= 0),
  last_source_updated_at timestamptz,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text
);

create table if not exists public.opa_attendances (
  id uuid primary key default gen_random_uuid(),
  source_system text not null check (source_system = 'opa'),
  source_id text not null unique,
  protocolo text,
  contato_bruto text,
  tipo_identificador text not null,
  canal text,
  atendente text,
  departamento text,
  status text,
  motivo text,
  avaliacao text,
  fcr boolean,
  data_abertura timestamptz,
  data_inicio timestamptz,
  data_ultima_interacao timestamptz,
  data_finalizacao timestamptz,
  status_vinculo text not null,
  ixc_customer_source_id text,
  ixc_contract_source_id text,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  sync_run_id uuid
);

create table if not exists public.opa_interactions (
  id uuid primary key default gen_random_uuid(),
  source_system text not null check (source_system = 'opa'),
  source_id text not null unique,
  attendance_source_id text,
  ixc_customer_source_id text,
  ixc_contract_source_id text,
  tipo text,
  status text,
  data_interacao timestamptz,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  sync_run_id uuid
);

create table if not exists public.ixc_customers (
  id uuid primary key default gen_random_uuid(),
  source_system text not null check (source_system = 'ixc'),
  source_id text not null unique,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  sync_run_id uuid
);

create table if not exists public.ixc_contracts (
  id uuid primary key default gen_random_uuid(),
  source_system text not null check (source_system = 'ixc'),
  source_id text not null unique,
  customer_source_id text,
  status text,
  data_ativacao timestamptz,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  sync_run_id uuid
);

create table if not exists public.ixc_sales (
  id uuid primary key default gen_random_uuid(),
  source_system text not null check (source_system = 'ixc'),
  source_id text not null unique,
  customer_source_id text,
  contract_source_id text,
  status text,
  data_venda timestamptz,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  sync_run_id uuid
);

create table if not exists public.ixc_cancellations (
  id uuid primary key default gen_random_uuid(),
  source_system text not null check (source_system = 'ixc'),
  source_id text not null unique,
  contract_source_id text,
  motivo text,
  tipo text,
  data_cancelamento timestamptz,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  sync_run_id uuid
);

create table if not exists public.analytics_sync_status (
  id uuid primary key default gen_random_uuid(),
  source_system text not null check (source_system in ('opa', 'ixc')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null check (status in ('success', 'partial', 'failed', 'unavailable')),
  received integer not null default 0 check (received >= 0),
  inserted integer not null default 0 check (inserted >= 0),
  updated integer not null default 0 check (updated >= 0),
  failed integer not null default 0 check (failed >= 0),
  last_source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  error_message text,
  sync_run_id uuid,
  unique (source_system, period_start, period_end)
);

create index if not exists opa_records_raw_source_updated_at_idx
  on integration.opa_records_raw (source_updated_at);
create index if not exists opa_records_raw_received_at_idx
  on integration.opa_records_raw (received_at);
create index if not exists opa_records_raw_sync_run_id_idx
  on integration.opa_records_raw (sync_run_id);
create index if not exists ixc_records_raw_source_updated_at_idx
  on integration.ixc_records_raw (source_updated_at);
create index if not exists ixc_records_raw_received_at_idx
  on integration.ixc_records_raw (received_at);
create index if not exists ixc_records_raw_sync_run_id_idx
  on integration.ixc_records_raw (sync_run_id);
create index if not exists sync_runs_source_system_period_idx
  on integration.sync_runs (source_system, period_start, period_end);
create index if not exists sync_runs_started_at_idx
  on integration.sync_runs (started_at);
create index if not exists sync_runs_finished_at_idx
  on integration.sync_runs (finished_at);
create index if not exists sync_runs_last_source_updated_at_idx
  on integration.sync_runs (last_source_updated_at);

create index if not exists opa_attendances_data_abertura_idx on public.opa_attendances (data_abertura);
create index if not exists opa_attendances_data_inicio_idx on public.opa_attendances (data_inicio);
create index if not exists opa_attendances_data_ultima_interacao_idx on public.opa_attendances (data_ultima_interacao);
create index if not exists opa_attendances_data_finalizacao_idx on public.opa_attendances (data_finalizacao);
create index if not exists opa_attendances_ixc_customer_source_id_idx on public.opa_attendances (ixc_customer_source_id);
create index if not exists opa_attendances_ixc_contract_source_id_idx on public.opa_attendances (ixc_contract_source_id);
create index if not exists opa_attendances_source_updated_at_idx on public.opa_attendances (source_updated_at);
create index if not exists opa_attendances_synced_at_idx on public.opa_attendances (synced_at);
create index if not exists opa_attendances_sync_run_id_idx on public.opa_attendances (sync_run_id);
create index if not exists opa_interactions_attendance_source_id_idx on public.opa_interactions (attendance_source_id);
create index if not exists opa_interactions_ixc_customer_source_id_idx on public.opa_interactions (ixc_customer_source_id);
create index if not exists opa_interactions_ixc_contract_source_id_idx on public.opa_interactions (ixc_contract_source_id);
create index if not exists opa_interactions_data_interacao_idx on public.opa_interactions (data_interacao);
create index if not exists opa_interactions_source_updated_at_idx on public.opa_interactions (source_updated_at);
create index if not exists opa_interactions_synced_at_idx on public.opa_interactions (synced_at);
create index if not exists opa_interactions_sync_run_id_idx on public.opa_interactions (sync_run_id);
create index if not exists ixc_customers_source_updated_at_idx on public.ixc_customers (source_updated_at);
create index if not exists ixc_customers_synced_at_idx on public.ixc_customers (synced_at);
create index if not exists ixc_customers_sync_run_id_idx on public.ixc_customers (sync_run_id);
create index if not exists ixc_contracts_customer_source_id_idx on public.ixc_contracts (customer_source_id);
create index if not exists ixc_contracts_data_ativacao_idx on public.ixc_contracts (data_ativacao);
create index if not exists ixc_contracts_source_updated_at_idx on public.ixc_contracts (source_updated_at);
create index if not exists ixc_contracts_synced_at_idx on public.ixc_contracts (synced_at);
create index if not exists ixc_contracts_sync_run_id_idx on public.ixc_contracts (sync_run_id);
create index if not exists ixc_sales_customer_source_id_idx on public.ixc_sales (customer_source_id);
create index if not exists ixc_sales_contract_source_id_idx on public.ixc_sales (contract_source_id);
create index if not exists ixc_sales_data_venda_idx on public.ixc_sales (data_venda);
create index if not exists ixc_sales_source_updated_at_idx on public.ixc_sales (source_updated_at);
create index if not exists ixc_sales_synced_at_idx on public.ixc_sales (synced_at);
create index if not exists ixc_sales_sync_run_id_idx on public.ixc_sales (sync_run_id);
create index if not exists ixc_cancellations_contract_source_id_idx on public.ixc_cancellations (contract_source_id);
create index if not exists ixc_cancellations_data_cancelamento_idx on public.ixc_cancellations (data_cancelamento);
create index if not exists ixc_cancellations_source_updated_at_idx on public.ixc_cancellations (source_updated_at);
create index if not exists ixc_cancellations_synced_at_idx on public.ixc_cancellations (synced_at);
create index if not exists ixc_cancellations_sync_run_id_idx on public.ixc_cancellations (sync_run_id);
create index if not exists analytics_sync_status_source_period_idx
  on public.analytics_sync_status (source_system, period_start, period_end);
create index if not exists analytics_sync_status_synced_at_idx on public.analytics_sync_status (synced_at);
create index if not exists analytics_sync_status_sync_run_id_idx on public.analytics_sync_status (sync_run_id);

alter table integration.opa_records_raw enable row level security;
alter table integration.ixc_records_raw enable row level security;
alter table integration.sync_runs enable row level security;
alter table public.opa_attendances enable row level security;
alter table public.opa_interactions enable row level security;
alter table public.ixc_customers enable row level security;
alter table public.ixc_contracts enable row level security;
alter table public.ixc_sales enable row level security;
alter table public.ixc_cancellations enable row level security;
alter table public.analytics_sync_status enable row level security;

-- Permissões somente para o processo administrativo. O escopo é limitado às
-- tabelas criadas acima e não toca nas tabelas existentes do aplicativo.
revoke all on schema integration from anon, authenticated;
revoke all on table
  integration.opa_records_raw,
  integration.ixc_records_raw,
  integration.sync_runs,
  public.opa_attendances,
  public.opa_interactions,
  public.ixc_customers,
  public.ixc_contracts,
  public.ixc_sales,
  public.ixc_cancellations,
  public.analytics_sync_status
from anon, authenticated;

grant usage on schema integration to service_role;
grant all on table integration.opa_records_raw to service_role;
grant all on table integration.ixc_records_raw to service_role;
grant all on table integration.sync_runs to service_role;
grant select, insert, update on table
  public.opa_attendances,
  public.opa_interactions,
  public.ixc_customers,
  public.ixc_contracts,
  public.ixc_sales,
  public.ixc_cancellations
to service_role;
grant select, insert, update on table public.analytics_sync_status to service_role;

commit;
