# Contrato do banco analítico

Este documento define o contrato esperado para a camada de proveniência de Opa! Suite e IXC. A migration ainda não foi criada nem aplicada neste worktree: a verificação inicial exigida pela Tarefa 4 mostrou que a CLI `supabase` não está disponível, e também não há Docker ou banco local acessível. Nenhum SQL remoto foi executado.

## Estado da entrega

- **Confirmado:** o contrato abaixo mantém payloads crus fora de `public`, usa `source_id` único nas entidades normalizadas, prevê RLS para as tabelas públicas e limita o estado de sincronização a `success`, `partial`, `failed` e `unavailable`.
- **Bloqueado:** gerar a migration pelo comando oficial `supabase migration new create_analytics_sources`, aplicar `supabase db reset` e executar as asserções contra Postgres local.
- **Condicionado:** nomes de campos de data e regras de relacionamento devem permanecer compatíveis com os endpoints e payloads sanitizados que serão confirmados antes da ingestão.
- **Proposto:** quando a CLI e o banco local estiverem disponíveis, gerar a migration oficial, aplicar somente com `supabase db reset` e executar as asserções SQL da Tarefa 4 antes de qualquer uso remoto.

## Camadas e regras comuns

As tabelas `integration.*` são internas. Elas guardam o payload bruto e metadados de ingestão para reprocessamento e auditoria. Não devem ser expostas pelo Data API a `anon` ou `authenticated`.

As tabelas `public.*` são projeções normalizadas para consulta analítica. Todas devem ter RLS habilitado. Nenhuma política de leitura pública é presumida neste contrato; as policies e grants só podem ser adicionadas quando o modelo de acesso server-side estiver definido.

Todas as entidades de origem usam:

- `id uuid` como identificador interno, quando aplicável;
- `source_id text not null unique` como chave estável recebida da origem;
- `source_updated_at timestamptz` para o cursor ou ordenação incremental, quando a origem fornecer esse campo;
- `synced_at timestamptz not null default now()`;
- `sync_run_id uuid` opcional para proveniência da execução;
- chaves `ixc_customer_id` e `ixc_contract_id` opcionais, sem inferência por telefone, nome ou posição do registro.

Valores de identificadores brutos continuam texto. A normalização não converte números em `number`, não remove zeros à esquerda e não transforma contato em nome de cliente.

## Tabelas de integração

| Tabela | Finalidade | Chave da origem | Campos de data | Payload bruto | Retenção e acesso |
| --- | --- | --- | --- | --- | --- |
| `integration.opa_records_raw` | Preservar cada registro recebido do Opa! Suite para reprocessamento e auditoria. | `source_id` da origem, com `source_system` e `record_type` no envelope. | `source_updated_at`, `received_at`. | `payload jsonb` e metadados técnicos, sem segredo ou credencial. | Retenção operacional definida antes da primeira carga. Schema interno, acesso apenas pelo processo server-side autorizado. |
| `integration.ixc_records_raw` | Preservar registros recebidos do IXC antes da projeção normalizada. | `source_id` da origem, com `source_system` e `record_type` no envelope. | `source_updated_at`, `received_at`. | `payload jsonb` e metadados técnicos, sem segredo ou credencial. | Retenção operacional definida antes da primeira carga. Schema interno, acesso apenas pelo processo server-side autorizado. |
| `integration.sync_runs` | Registrar uma execução por fonte, janela e request idempotente. | `request_id` deve ser único por execução lógica. | `period_start`, `period_end`, `started_at`, `finished_at`, `last_source_updated_at`. | Somente contagens, estado e erro sanitizado; nunca payload bruto. | Retenção de auditoria definida com a operação. Schema interno, acesso server-side. |

O payload bruto não deve ser duplicado nas tabelas `public.*`. Campos derivados podem carregar apenas o valor necessário para consulta, mantendo o campo original quando a proveniência exigir.

## Projeções públicas

| Tabela | Finalidade e origem da métrica | Chave da origem | Campos de data | Campos brutos e relação IXC | Retenção e acesso |
| --- | --- | --- | --- | --- | --- |
| `public.opa_attendances` | Atendimento agregado por registro do Opa! Suite. Alimenta `ATENDIMENTO`, sujeito ao mapa de paridade. | `source_id` do atendimento. | `data_abertura`, `data_inicio`, `data_ultima_interacao`, `data_finalizacao`, `source_updated_at`, `synced_at`. | `protocolo`, `contato_bruto`, `tipo_identificador`, `canal`, `status`, `motivo`, `avaliacao`, `fcr`; `ixc_customer_id` e `ixc_contract_id` opcionais. | Retenção analítica definida pela política de dados. RLS obrigatório; leitura somente pelo acesso autorizado do painel/API. |
| `public.opa_interactions` | Interações do atendimento, quando a fonte fornecer granularidade e identificador estáveis. | `source_id` da interação. | `data_interacao`, `source_updated_at`, `synced_at`. | Identificador bruto da interação e conteúdo mínimo necessário; relação opcional com atendimento e IXC. | Retenção analítica definida pela política de dados. RLS obrigatório; sem exposição de payload completo. |
| `public.ixc_customers` | Projeção de clientes IXC para vínculo analítico. Não é fonte de nomes para contatos Opa! sem chave confirmada. | `source_id` do cliente. | `source_updated_at`, `synced_at`. | Identificadores exigidos pelo contrato da fonte; PII somente se necessária e autorizada, fora de fixtures e documentação. | Retenção e acesso conforme política de dados. RLS obrigatório; leitura server-side autorizada. |
| `public.ixc_contracts` | Projeção de contratos IXC para `GERAL` e vínculos opcionais. | `source_id` do contrato. | `data_ativacao`, `source_updated_at`, `synced_at`. | `customer_source_id`, status e campos contratuais mínimos; relação com cliente opcional. | Retenção analítica definida pela política de dados. RLS obrigatório; leitura server-side autorizada. |
| `public.ixc_sales` | Projeção de vendas IXC para `GERAL`, após confirmação da fonte e da data de referência. | `source_id` da venda. | `data_venda`, `source_updated_at`, `synced_at`. | Campos de identificação da venda necessários ao cálculo; relações opcionais com cliente e contrato. | Retenção analítica definida pela política de dados. RLS obrigatório; sem valor estimado quando a fonte não estiver confirmada. |
| `public.ixc_cancellations` | Projeção de eventos de cancelamento para `CANCELAMENTOS`. | `source_id` do evento. | `data_cancelamento`, `source_updated_at`, `synced_at`. | `motivo`, tipo do evento e `contract_source_id` opcional. | Retenção analítica definida pela política de dados. RLS obrigatório; leitura server-side autorizada. |
| `public.analytics_sync_status` | Estado consultável da última sincronização por fonte e janela. | `source_system` + janela, com a unicidade definida pela migration. | `period_start`, `period_end`, `last_source_updated_at`, `synced_at`. | Contagens e `error_message` sanitizada; nenhum payload. | Retenção curta de estado e histórico em `integration.sync_runs`. RLS obrigatório; leitura somente pelo acesso autorizado. |

## Domínio de sincronização

`analytics_sync_status.status` e o estado correspondente em `integration.sync_runs` aceitam somente:

```text
success | partial | failed | unavailable
```

`unavailable` significa que a fonte ou a persistência não forneceu dados válidos para a janela. Não deve ser convertido em zero, lista vazia definitiva ou sucesso. `partial` exige que as contagens e a causa sanitizada sejam preservadas.

## Índices e constraints esperados

A migration deverá criar unicidade em todos os `source_id`, índices para os campos usados em filtros de período e índices para `sync_run_id` e chaves opcionais quando houver junção. Foreign keys para registros de origem podem ser adicionadas apenas quando a cardinalidade e a retenção não quebrarem reprocessamento; a ausência de uma chave confirmada deve permanecer `NULL`.

Asserções mínimas para executar após a migration local (com pgTAP disponível):

```sql
select has_table('public', 'opa_attendances');
select has_table('public', 'ixc_contracts');
select has_table('public', 'ixc_cancellations');
select has_column('public', 'opa_attendances', 'contato_bruto');
select has_column('public', 'opa_attendances', 'source_id');
select has_table('public', 'analytics_sync_status');
select has_schema('integration');
```

O teste final também deverá consultar `pg_class.relrowsecurity`, verificar as constraints únicas de `source_id` e tentar estados inválidos em uma transação de teste. Essas verificações não foram executadas neste worktree porque não há banco local.

## Limites de segurança

Não entram neste contrato: tokens, headers de autenticação, chaves Supabase, `service_role`, nomes, telefones, protocolos ou IDs reais. A relação Opa! Suite ↔ IXC só pode ser preenchida quando a chave e seu significado forem confirmados por evidência sanitizada. A criação do schema não autoriza ingestão, agenda n8n, carga remota ou alteração de workflows Opa!.
