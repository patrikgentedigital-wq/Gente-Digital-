-- Remove privilégios herdados do ambiente; histórico só pode ser lido e acrescentado pelo servidor.
revoke all on public.viability_evaluations from service_role;
grant select, insert on public.viability_evaluations to service_role;
